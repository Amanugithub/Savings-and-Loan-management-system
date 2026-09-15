import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';

let ctx;
let tokensByRole;

before(async () => {
  ctx = await startTestServer();
  const admins = await ctx.seedAllRoles('auth');
  tokensByRole = {};
  for (const role of ctx.ROLES) {
    tokensByRole[role] = await ctx.login(admins[role].username);
  }
});

after(async () => ctx.close());

describe('login', () => {
  test('rejects an unknown username with 401, not 404', async () => {
    const res = await ctx.request('POST', '/api/auth/login', {
      body: { username: 'nobody', password: 'whatever123' },
    });
    assert.equal(res.status, 401);
  });

  test('rejects a wrong password with the same 401 shape as an unknown user', async () => {
    const res = await ctx.request('POST', '/api/auth/login', {
      body: { username: 'auth_cashier', password: 'wrong-password' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid username or password');
  });

  test('issues a token embedding the administrator role', async () => {
    const res = await ctx.request('POST', '/api/auth/login', {
      body: { username: 'auth_cashier', password: 'testpass123' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.admin.role, 'cashier');
    assert.ok(res.body.token);
  });
});

describe('requireAuth', () => {
  test('rejects a request with no Authorization header', async () => {
    const res = await ctx.request('GET', '/api/loans');
    assert.equal(res.status, 401);
  });

  test('rejects a malformed / invalid JWT', async () => {
    const res = await ctx.request('GET', '/api/loans', { token: 'not-a-real-token' });
    assert.equal(res.status, 401);
  });
});

describe('GET access for every role', () => {
  for (const role of [
    'chairperson',
    'vice_chairperson',
    'loan_committee',
    'cashier',
    'accountant',
    'general_manager',
    'control_audit_committee',
  ]) {
    test(`${role} can list members, loans, and transactions`, async () => {
      const token = tokensByRole[role];
      for (const path of ['/api/members', '/api/loans', '/api/transactions']) {
        const res = await ctx.request('GET', path, { token });
        assert.notEqual(res.status, 401, `${role} GET ${path} should not be unauthenticated`);
        assert.notEqual(res.status, 403, `${role} GET ${path} should not be forbidden`);
      }
    });
  }
});

// A 403 must be a pure permission check that runs before any state is
// touched — asserting `!== 403` for the allowed role only proves the gate
// let the request through, not that the underlying action succeeded (that
// belongs to the workflow/accounting tests instead).
describe('write-endpoint role matrix', () => {
  const cases = [
    { method: 'POST', path: '/api/loans', allowed: ['cashier', 'general_manager'] },
    { method: 'POST', path: '/api/administrators', allowed: ['chairperson', 'vice_chairperson', 'general_manager'] },
    { method: 'POST', path: '/api/expenses', allowed: ['accountant'] },
    { method: 'PATCH', path: '/api/loans/does-not-exist/recommend', allowed: ['chairperson', 'vice_chairperson'] },
    { method: 'PATCH', path: '/api/loans/does-not-exist/committee-approve', allowed: ['loan_committee'] },
    { method: 'PATCH', path: '/api/loans/does-not-exist/committee-reject', allowed: ['loan_committee'] },
    { method: 'PATCH', path: '/api/loans/does-not-exist/disburse', allowed: ['cashier'] },
    { method: 'POST', path: '/api/loans/does-not-exist/payments', allowed: ['cashier'] },
  ];

  for (const { method, path, allowed } of cases) {
    test(`${method} ${path} — allowed roles pass the gate, everyone else gets 403`, async () => {
      for (const role of [
        'chairperson',
        'vice_chairperson',
        'loan_committee',
        'cashier',
        'accountant',
        'general_manager',
        'control_audit_committee',
      ]) {
        const res = await ctx.request(method, path, { token: tokensByRole[role], body: {} });
        if (allowed.includes(role)) {
          assert.notEqual(res.status, 403, `${role} should pass the role gate for ${method} ${path}`);
        } else {
          assert.equal(res.status, 403, `${role} should be forbidden from ${method} ${path}`);
        }
      }
    });
  }

  test('an unauthorized request never mutates data: rejected POST /api/expenses writes nothing', async () => {
    const before = ctx.db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c;
    const res = await ctx.request('POST', '/api/expenses', {
      token: tokensByRole.cashier, // not accountant
      body: { category: 'other', amount: 500 },
    });
    assert.equal(res.status, 403);
    const afterCount = ctx.db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c;
    assert.equal(afterCount, before);
  });
});

describe('generic transaction type gating', () => {
  test('a cashier cannot record bank_interest_income (accountant-only)', async () => {
    const res = await ctx.request('POST', '/api/transactions', {
      token: tokensByRole.cashier,
      body: { type: 'bank_interest_income', amount: 1000 },
    });
    assert.equal(res.status, 403);
  });

  test('loan repayment types are rejected outright, regardless of role', async () => {
    for (const type of ['loan_installment', 'loan_interest', 'loan_insurance', 'penalty_payment']) {
      const res = await ctx.request('POST', '/api/transactions', {
        token: tokensByRole.cashier,
        body: { member_id: 'whatever', type, amount: 100 },
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /POST \/api\/loans\/:id\/payments/);
    }
  });
});
