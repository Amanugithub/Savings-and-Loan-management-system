import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const masterSqlPath = path.join(__dirname, '../src/db/migrations/postgres/master.sql');

// Opt-in and deliberately separate from DATABASE_URL (the app's own
// connection string) — this test creates and drops a throwaway schema, and
// must never be pointed at a real database by accident. Set
// TEST_DATABASE_URL to a scratch Postgres/Supabase instance to run it.
const connectionString = process.env.TEST_DATABASE_URL;

test('postgres/master.sql applies cleanly and matches the SQLite schema\'s key tables', { skip: !connectionString && 'TEST_DATABASE_URL not set — skipping live Postgres compatibility check' }, async () => {
  const { Client } = pg;
  const client = new Client({ connectionString });
  await client.connect();

  const schemaName = `test_${randomUUID().replace(/-/g, '_')}`;
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    const sql = fs.readFileSync(masterSqlPath, 'utf8');
    await client.query(sql);

    const { rows: tables } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schemaName]
    );
    const tableNames = tables.map((row) => row.table_name);

    for (const expected of [
      'administrators',
      'members',
      'loans',
      'loan_installments',
      'loan_penalties',
      'loan_payments',
      'loan_payment_allocations',
      'transactions',
      'expenses',
    ]) {
      assert.ok(tableNames.includes(expected), `expected table "${expected}" in postgres schema`);
    }

    const { rows: penaltyConstraint } = await client.query(
      `SELECT conname FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = $1 AND t.relname = 'loan_penalties' AND contype = 'u'`,
      [schemaName]
    );
    assert.ok(penaltyConstraint.length > 0, 'loan_penalties must have a unique constraint (loan_id, penalty_period)');
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  }
});
