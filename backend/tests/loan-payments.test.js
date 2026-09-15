import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestServer } from './helpers/testServer.js';

let ctx;
let tokens;
let adminIds;

before(async () => {
  ctx = await startTestServer();
  const admins = await ctx.seedAllRoles('pay');
  tokens = {};
  adminIds = {};
  for (const role of ctx.ROLES) {
    tokens[role] = await ctx.login(admins[role].username);
    adminIds[role] = admins[role].id;
  }
});

after(async () => ctx.close());

// Disbursed "today" by default so no installment is overdue yet and no
// penalty silently joins the interest_penalty bucket — tests that want
// penalty interaction pass an explicit, backdated disbursementDate.
const TODAY = new Date().toISOString().slice(0, 10);
const paymentBody = (body) => ({ ...body, idempotency_key: randomUUID() });

async function activeLoan({ principal = 24000, termYears = 1, disbursementDate = TODAY } = {}) {
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

describe('payment waterfall', () => {
  test('collection expenses are paid before interest/insurance and principal', async () => {
    const { loanId } = await activeLoan();
    await ctx.request('POST', '/api/expenses', {
      token: tokens.accountant,
      body: { category: 'collection_expense', amount: 100, loan_id: loanId },
    });

    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: 150 }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.allocations[0].bucket, 'collection_expense');
    assert.equal(res.body.allocations[0].amount, 100);
    assert.equal(res.body.allocations[1].bucket, 'interest_penalty');
    assert.equal(res.body.allocations[1].amount, 50);
  });

  test('a payment covering only interest and insurance never touches principal', async () => {
    const { loanId } = await activeLoan();
    // Installment 1 on a 24,000 / 1yr self-secured loan: 160 interest + 20 insurance (2000 principal).
    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: 180 }),
    });
    assert.equal(res.status, 201);

    const buckets = res.body.allocations.map((a) => a.bucket);
    assert.deepEqual(buckets, ['interest_penalty', 'interest_penalty']);
    assert.equal(res.body.installments[0].status, 'partially_paid');
    assert.equal(res.body.installments[0].principal_paid, 0);
  });

  test('a normal monthly payment clears one installment before moving to the next', async () => {
    const { loanId } = await activeLoan();
    // One monthly payment is 2,000 principal + 160 interest + 20 insurance.
    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: 2180 }),
    });
    assert.equal(res.status, 201);

    const principalAllocations = res.body.allocations.filter((a) => a.bucket === 'principal');
    assert.equal(principalAllocations.length, 1);
    assert.equal(principalAllocations[0].amount, 2000);
    assert.equal(principalAllocations[0].installment_id, res.body.installments[0].id);
    assert.equal(res.body.installments[0].interest_paid, 160);
    assert.equal(res.body.installments[0].insurance_paid, 20);
    assert.equal(res.body.installments[0].principal_paid, 2000);
    assert.equal(res.body.installments[0].status, 'paid');
    assert.equal(res.body.installments[1].interest_paid, 0, 'future installment interest must not be collected early');
    assert.equal(res.body.installments[1].principal_paid, 0, 'future installment principal must not be collected early');
  });

  test('payment preview explains rounding shortfalls and payments that continue into the next installment', async () => {
    const { loanId } = await activeLoan({ principal: 24000, termYears: 3 });
    const shortPayment = await ctx.request('POST', `/api/loans/${loanId}/payments/preview`, {
      token: tokens.cashier,
      body: { amount: 740 },
    });
    assert.equal(shortPayment.status, 200);
    assert.equal(shortPayment.body.next_installment.installment_number, 1);
    assert.equal(shortPayment.body.next_installment.total_remaining, 740.01);
    assert.equal(shortPayment.body.shortfall, 0.01);
    assert.equal(shortPayment.body.excess_over_installment, 0);

    const continuingPayment = await ctx.request('POST', `/api/loans/${loanId}/payments/preview`, {
      token: tokens.cashier,
      body: { amount: 1000 },
    });
    assert.equal(continuingPayment.status, 200);
    assert.equal(continuingPayment.body.excess_over_installment, 259.99);
    assert.ok(continuingPayment.body.allocations.some((allocation) => allocation.installment_number === 2));
  });

  test('payment preview identifies an amount greater than the full loan balance without writing', async () => {
    const { loanId } = await activeLoan();
    const res = await ctx.request('POST', `/api/loans/${loanId}/payments/preview`, {
      token: tokens.cashier,
      body: { amount: 999999 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.overpaid, true);
    assert.equal(res.body.allocations.length, 0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?').get(loanId).c, 0);
  });

  test('non-collection expenses linked to a loan are rejected and never become repayment debt', async () => {
    const { loanId } = await activeLoan();
    const res = await ctx.request('POST', '/api/expenses', {
      token: tokens.accountant,
      body: { category: 'other', amount: 100, loan_id: loanId },
    });
    assert.equal(res.status, 400);
  });

  test('overpayment is rejected with 409 and writes nothing', async () => {
    const { loanId } = await activeLoan();
    const before = ctx.db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?').get(loanId).c;

    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: 999999 }),
    });
    assert.equal(res.status, 409);
    assert.ok(typeof res.body.outstanding_balance === 'number');

    const afterCount = ctx.db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?').get(loanId).c;
    const allocationCount = ctx.db
      .prepare('SELECT COUNT(*) AS c FROM loan_payment_allocations WHERE loan_id = ?')
      .get(loanId).c;
    assert.equal(afterCount, before);
    assert.equal(allocationCount, 0);
  });

  test('repeating a payment with the same idempotency key returns one receipt', async () => {
    const { loanId } = await activeLoan();
    const key = randomUUID();
    const body = { amount: 180, idempotency_key: key };
    const first = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body,
    });
    const second = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body,
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.payment.id, first.body.payment.id);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?').get(loanId).c, 1);
  });

  test('paying the exact full remaining balance closes out every installment and zeroes the outstanding balance', async () => {
    const { loanId } = await activeLoan({ principal: 12000, termYears: 1 });
    const quote = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    const totalDue = quote.body.schedule.reduce(
      (sum, i) => sum + i.principal_due + i.interest_due + i.insurance_due,
      0
    );

    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: totalDue }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.outstanding_balance, 0);
    assert.ok(res.body.installments.every((i) => i.status === 'paid'));
  });

  test('paying the exact full remaining balance closes the loan', async () => {
    const { loanId } = await activeLoan({ principal: 12000, termYears: 1 });
    const quote = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    const totalDue = quote.body.schedule.reduce(
      (sum, installment) => sum + installment.principal_due + installment.interest_due + installment.insurance_due,
      0
    );

    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: totalDue }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.loan_status, 'closed');
    assert.equal(ctx.db.prepare('SELECT status FROM loans WHERE id = ?').get(loanId).status, 'closed');
  });

  test('a payment is atomic: a rejected payment cannot partially update installments either', async () => {
    const { loanId } = await activeLoan();
    const before = ctx.db
      .prepare('SELECT principal_paid, interest_paid, insurance_paid FROM loan_installments WHERE loan_id = ? ORDER BY installment_number')
      .all(loanId);

    await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: 999999 }),
    });

    const after = ctx.db
      .prepare('SELECT principal_paid, interest_paid, insurance_paid FROM loan_installments WHERE loan_id = ? ORDER BY installment_number')
      .all(loanId);
    assert.deepEqual(after, before);
  });

  test('cannot record a payment against a loan that is not active', async () => {
    const memberId = ctx.seedMember({ dateJoined: '2020-01-01' });
    ctx.grantShares(memberId, 12000, adminIds.cashier);
    const apply = await ctx.request('POST', '/api/loans', {
      token: tokens.general_manager,
      body: { member_id: memberId, type: 'self_secured', principal_amount: 12000, term_years: 1 },
    });
    const loanId = apply.body.data.id; // still awaiting_recommendation

    const res = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: 1000 }),
    });
    assert.equal(res.status, 400);
  });

  test('penalties are allocated (and their outstanding balance drops) once collected', async () => {
    const { loanId } = await activeLoan({ disbursementDate: '2020-01-01' }); // deeply overdue
    const withPenalty = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    assert.ok(withPenalty.body.total_penalties > 0);

    const payoff = await ctx.request('POST', `/api/loans/${loanId}/payments`, {
      token: tokens.cashier,
      body: paymentBody({ amount: withPenalty.body.schedule.reduce((s, i) => s + i.principal_due + i.interest_due + i.insurance_due, 0) + withPenalty.body.outstanding_penalty_balance }),
    });
    assert.equal(payoff.status, 201);

    const after = await ctx.request('GET', `/api/loans/${loanId}`, { token: tokens.general_manager });
    assert.equal(after.body.outstanding_penalty_balance, 0);
    assert.equal(after.body.total_penalties, withPenalty.body.total_penalties, 'the penalty ledger itself is immutable');
  });
});
