import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';

let ctx;
let tokens;
let adminIds;

before(async () => {
  ctx = await startTestServer();
  const admins = await ctx.seedAllRoles('pen');
  tokens = {};
  adminIds = {};
  for (const role of ctx.ROLES) {
    tokens[role] = await ctx.login(admins[role].username);
    adminIds[role] = admins[role].id;
  }
});

after(async () => ctx.close());

async function activeLoan({ principal = 24000, termYears = 1, disbursementDate }) {
  const memberId = ctx.seedMember({ dateJoined: '2020-01-01' });
  ctx.grantShares(memberId, 12000, adminIds.cashier);

  const apply = await ctx.request('POST', '/api/loans', {
    token: tokens.general_manager,
    body: { member_id: memberId, type: 'self_secured', principal_amount: principal, term_years: termYears },
  });
  const loanId = apply.body.data.id;
  await ctx.request('PATCH', `/api/loans/${loanId}/recommend`, { token: tokens.chairperson });
  await ctx.request('PATCH', `/api/loans/${loanId}/committee-approve`, { token: tokens.loan_committee });
  await ctx.request('PATCH', `/api/loans/${loanId}/disburse`, {
    token: tokens.cashier,
    body: { disbursement_date: disbursementDate },
  });
  return { loanId, memberId };
}

// A fixed "today" independent of the machine clock: every disbursement
// date is expressed as N months before this anchor, so the number of
// overdue periods a test produces doesn't drift with the calendar.
const TODAY = new Date().toISOString().slice(0, 10);

function monthsAgoIso(months) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

describe('penalty accrual', () => {
  test('a single overdue month produces exactly one penalty', async () => {
    const { loanId } = await activeLoan({ disbursementDate: monthsAgoIso(1) });
    const res = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    assert.equal(res.status, 200);
    assert.equal(res.body.penalties.length, 1);
    assert.equal(res.body.penalties[0].basis_amount, 24000);
    assert.equal(res.body.penalties[0].amount, 480); // 2% of 24000
  });

  test('three overdue months produce three separate, compounding penalties', async () => {
    const { loanId } = await activeLoan({ disbursementDate: monthsAgoIso(3) });
    const res = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    assert.equal(res.body.penalties.length, 3);

    const amounts = res.body.penalties.map((p) => p.amount);
    // Each period's basis includes the prior period's still-unpaid penalty,
    // so amounts strictly increase.
    assert.ok(amounts[1] > amounts[0]);
    assert.ok(amounts[2] > amounts[1]);
  });

  test('repeating the read is idempotent: no duplicate penalties, same total', async () => {
    const { loanId } = await activeLoan({ disbursementDate: monthsAgoIso(4) });
    const first = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    const second = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });

    assert.equal(first.body.penalties.length, second.body.penalties.length);
    assert.equal(first.body.total_penalties, second.body.total_penalties);
    assert.deepEqual(
      first.body.penalties.map((p) => p.id).sort(),
      second.body.penalties.map((p) => p.id).sort()
    );
  });

  test('two near-simultaneous requests cannot double-accrue the same period', async () => {
    const { loanId } = await activeLoan({ disbursementDate: monthsAgoIso(2) });
    const [a, b] = await Promise.all([
      ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager }),
      ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager }),
    ]);
    assert.equal(a.body.penalties.length, 2);
    assert.equal(b.body.penalties.length, 2);

    const stored = ctx.db.prepare('SELECT COUNT(*) AS c FROM loan_penalties WHERE loan_id = ?').get(loanId).c;
    assert.equal(stored, 2);
  });

  test('a period whose installment is already paid off is excluded, and lowers a later period\'s basis', async () => {
    const { loanId } = await activeLoan({ disbursementDate: monthsAgoIso(2) });

    // Accrual always runs before a payment's own allocation within that
    // same request (the payment endpoint deliberately reflects pre-payment
    // state), so a same-call payment can't retroactively erase that call's
    // accrual for the period it just paid. To see a *later* period's basis
    // reflect an *earlier* repayment, seed installment 1 as already fully
    // paid before accrual ever runs for this loan — e.g. as it would be
    // after a real payment landed on a prior day.
    const installment1 = ctx.db
      .prepare('SELECT id, principal_due, interest_due, insurance_due FROM loan_installments WHERE loan_id = ? AND installment_number = 1')
      .get(loanId);
    ctx.db
      .prepare(
        `UPDATE loan_installments SET principal_paid = ?, interest_paid = ?, insurance_paid = ?, status = 'paid' WHERE id = ?`
      )
      .run(installment1.principal_due, installment1.interest_due, installment1.insurance_due, installment1.id);

    const res = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    assert.equal(res.body.penalties.length, 1, 'installment 1 is already paid, so only period 2 is overdue');
    assert.equal(res.body.penalties[0].basis_amount, 22000, 'basis reflects the 2,000 principal already repaid');
  });

  test('a pending (not yet active) loan accrues no penalties', async () => {
    const memberId = ctx.seedMember({ dateJoined: '2020-01-01' });
    ctx.grantShares(memberId, 12000, adminIds.cashier);
    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    const loanId = apply.body.data.id;

    const res = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    assert.equal(res.status, 200);
    assert.equal(res.body.total_penalties, 0);
  });
});
