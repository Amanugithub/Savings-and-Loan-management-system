import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';

let ctx;
let tokens; // by role
let adminIds; // by role

function sixMonthsBeforeToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

before(async () => {
  ctx = await startTestServer();
  const admins = await ctx.seedAllRoles('wf');
  tokens = {};
  adminIds = {};
  for (const role of ctx.ROLES) {
    tokens[role] = await ctx.login(admins[role].username);
    adminIds[role] = admins[role].id;
  }
});

after(async () => ctx.close());

// A member eligible to apply for and receive a loan: joined well over six
// months ago and holding the minimum required share balance.
function eligibleMember() {
  const memberId = ctx.seedMember({ dateJoined: '2020-01-01' });
  ctx.grantShares(memberId, 12000, adminIds.cashier);
  return memberId;
}

describe('loan status pipeline (self-secured, no guarantor)', () => {
  test('walks awaiting_recommendation -> awaiting_committee_approval -> approved -> active, with a persisted schedule', async () => {
    const memberId = eligibleMember();

    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 24000, term_years: 1 },
    });
    assert.equal(apply.status, 201);
    assert.equal(apply.body.data.status, 'awaiting_recommendation');
    assert.equal(apply.body.data.monthly_installment, 2180, 'monthly installment must include principal, interest, and insurance');
    const loanId = apply.body.data.id;

    const recommend = await ctx.request('PATCH', `/api/loans/${loanId}/recommend`, { token: tokens.chairperson });
    assert.equal(recommend.status, 200);
    assert.equal(recommend.body.status, 'awaiting_committee_approval');

    const approve = await ctx.request('PATCH', `/api/loans/${loanId}/committee-approve`, { token: tokens.loan_committee });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.status, 'approved');

    const disburse = await ctx.request('PATCH', `/api/loans/${loanId}/disburse`, {
      token: tokens.cashier,
      body: { disbursement_date: '2026-01-01' },
    });
    assert.equal(disburse.status, 200);
    assert.equal(disburse.body.loan.status, 'active');
    assert.equal(disburse.body.installments.length, 12);
    // Rounding: the schedule must sum back to exactly the principal, even
    // though 24000 / 12 divides evenly here — this is the general contract.
    const totalPrincipalDue = disburse.body.installments.reduce((sum, i) => sum + i.principal_due, 0);
    assert.equal(totalPrincipalDue, 24000);
  });

  test('rejects an out-of-order transition: cannot committee-approve a loan still awaiting recommendation', async () => {
    const memberId = eligibleMember();
    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    const loanId = apply.body.data.id;

    const res = await ctx.request('PATCH', `/api/loans/${loanId}/committee-approve`, { token: tokens.loan_committee });
    assert.equal(res.status, 400);
  });

  test('recommending the same loan twice fails the second time (status already changed)', async () => {
    const memberId = eligibleMember();
    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    const loanId = apply.body.data.id;

    const first = await ctx.request('PATCH', `/api/loans/${loanId}/recommend`, { token: tokens.chairperson });
    assert.equal(first.status, 200);

    const second = await ctx.request('PATCH', `/api/loans/${loanId}/recommend`, { token: tokens.chairperson });
    assert.equal(second.status, 400);
  });

  test('committee-reject moves an application to a terminal rejected state', async () => {
    const memberId = eligibleMember();
    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    const loanId = apply.body.data.id;
    await ctx.request('PATCH', `/api/loans/${loanId}/recommend`, { token: tokens.chairperson });

    const reject = await ctx.request('PATCH', `/api/loans/${loanId}/committee-reject`, { token: tokens.loan_committee });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.status, 'rejected');

    const disburseAttempt = await ctx.request('PATCH', `/api/loans/${loanId}/disburse`, { token: tokens.cashier, body: {} });
    assert.equal(disburseAttempt.status, 400);
  });

  test('cannot disburse the same loan twice', async () => {
    const memberId = eligibleMember();
    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    const loanId = apply.body.data.id;
    await ctx.request('PATCH', `/api/loans/${loanId}/recommend`, { token: tokens.chairperson });
    await ctx.request('PATCH', `/api/loans/${loanId}/committee-approve`, { token: tokens.loan_committee });

    const first = await ctx.request('PATCH', `/api/loans/${loanId}/disburse`, { token: tokens.cashier, body: {} });
    assert.equal(first.status, 200);

    const second = await ctx.request('PATCH', `/api/loans/${loanId}/disburse`, { token: tokens.cashier, body: {} });
    assert.equal(second.status, 400);

    const installmentCount = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM loan_installments WHERE loan_id = ?')
      .get(loanId).c;
    assert.equal(installmentCount, 12, 'a duplicate disburse must not duplicate the schedule');
  });
});

describe('guarantor consent', () => {
  test('approve moves a guarantor-backed loan to awaiting_recommendation, and a repeat response is rejected', async () => {
    const borrowerId = eligibleMember();
    const guarantorId = ctx.seedMember({ dateJoined: '2020-01-01' });
    ctx.grantSavings(guarantorId, 100000, adminIds.cashier);

    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: {
        member_id: borrowerId,
        type: 'regular',
        principal_amount: 12000,
        term_years: 1,
        collateral_type: 'guarantor',
        guarantor_member_id: guarantorId,
      },
    });
    assert.equal(apply.status, 201);
    assert.equal(apply.body.data.status, 'awaiting_guarantor');
    const loanId = apply.body.data.id;

    const respond = await ctx.request('PATCH', `/api/loans/${loanId}/guarantor-response`, {
      token: tokens.cashier,
      body: { decision: 'approve' },
    });
    assert.equal(respond.status, 200);
    assert.equal(respond.body.status, 'awaiting_recommendation');

    const repeat = await ctx.request('PATCH', `/api/loans/${loanId}/guarantor-response`, {
      token: tokens.cashier,
      body: { decision: 'approve' },
    });
    assert.equal(repeat.status, 409);
  });

  test('decline moves the loan to the terminal guarantor_declined state', async () => {
    const borrowerId = eligibleMember();
    const guarantorId = ctx.seedMember({ dateJoined: '2020-01-01' });
    ctx.grantSavings(guarantorId, 100000, adminIds.cashier);

    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: {
        member_id: borrowerId,
        type: 'regular',
        principal_amount: 12000,
        term_years: 1,
        collateral_type: 'guarantor',
        guarantor_member_id: guarantorId,
      },
    });
    const loanId = apply.body.data.id;

    const decline = await ctx.request('PATCH', `/api/loans/${loanId}/guarantor-response`, {
      token: tokens.cashier,
      body: { decision: 'decline' },
    });
    assert.equal(decline.status, 200);
    assert.equal(decline.body.status, 'guarantor_declined');
  });
});

describe('eligibility boundaries', () => {
  test('member joined exactly six months ago is eligible (boundary is inclusive)', async () => {
    const memberId = ctx.seedMember({ dateJoined: sixMonthsBeforeToday() });
    ctx.grantShares(memberId, 12000, adminIds.cashier);

    const res = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    assert.equal(res.status, 201);
  });

  test('member joined one day short of six months is rejected', async () => {
    const cutoff = sixMonthsBeforeToday();
    const memberId = ctx.seedMember({ dateJoined: addDaysIso(cutoff, 1) });
    ctx.grantShares(memberId, 12000, adminIds.cashier);

    const res = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    assert.equal(res.status, 409);
  });

  test('exactly the minimum share balance (9,000 ETB) is eligible', async () => {
    const memberId = ctx.seedMember({ dateJoined: '2020-01-01' });
    ctx.grantShares(memberId, 9000, adminIds.cashier);

    const res = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    assert.equal(res.status, 201);
  });

  test('one ETB short of the minimum share balance is rejected', async () => {
    const memberId = ctx.seedMember({ dateJoined: '2020-01-01' });
    ctx.grantShares(memberId, 8999, adminIds.cashier);

    const res = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    assert.equal(res.status, 409);
  });
});

describe('non-blocking warnings', () => {
  test('a loan above the guideline amount still succeeds, with a warning attached', async () => {
    const memberId = eligibleMember();
    const res = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 60000, term_years: 5 },
    });
    assert.equal(res.status, 201);
    assert.ok(Array.isArray(res.body.warnings));
    assert.ok(res.body.warnings.some((w) => w.code === 'LOAN_AMOUNT_ABOVE_GUIDELINE'));
  });

  test('a loan within the guideline amount succeeds with no warnings', async () => {
    const memberId = eligibleMember();
    const res = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.warnings, []);
  });

  test('a savings deposit below the guideline still posts, with a warning', async () => {
    const memberId = eligibleMember();
    const res = await ctx.request('POST', '/api/transactions', {
      token: tokens.cashier,
      body: { member_id: memberId, type: 'savings_deposit', amount: 100 },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.warnings.some((w) => w.code === 'MONTHLY_SAVINGS_BELOW_GUIDELINE'));
    assert.equal(res.body.data.amount, 100, 'the deposit must still be recorded despite the warning');
  });
});
