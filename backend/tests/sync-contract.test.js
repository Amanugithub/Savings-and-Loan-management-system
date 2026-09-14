import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_TABLES } from '../src/sync/PushToRemote.js';
import { PULL_TABLES } from '../src/sync/PullFromRemote.js';

const expectedTables = [
  'administrators',
  'members',
  'loans',
  'loan_installments',
  'loan_penalties',
  'loan_payments',
  'loan_payment_allocations',
  'transactions',
  'expenses',
  'dividend_history',
  'member_exits',
  'notifications',
];

test('push and pull use the same FK-safe table order and columns', () => {
  assert.deepEqual(SYNC_TABLES.map((table) => table.name), expectedTables);
  assert.deepEqual(PULL_TABLES.map((table) => table.name), expectedTables);

  for (const table of expectedTables) {
    const push = SYNC_TABLES.find((entry) => entry.name === table);
    const pull = PULL_TABLES.find((entry) => entry.name === table);
    assert.deepEqual(pull.columns, push.columns, `${table} columns differ between push and pull`);
  }
});

test('repayment sync contract includes idempotency and allocation references', () => {
  const payments = SYNC_TABLES.find((table) => table.name === 'loan_payments');
  const allocations = SYNC_TABLES.find((table) => table.name === 'loan_payment_allocations');
  assert.ok(payments.columns.includes('idempotency_key'));
  assert.ok(allocations.columns.includes('payment_id'));
  assert.ok(allocations.columns.includes('installment_id'));
  assert.ok(allocations.columns.includes('penalty_id'));
});
