import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const tmpDir = path.join(backendRoot, '.tmp');

function freshDbPath() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  return path.join(tmpDir, `migrate-${randomUUID()}.db`);
}

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
}

function runMigrate(dbPath, extraEnv = {}) {
  return execFileSync('node', ['src/db/migrate-local.js'], {
    cwd: backendRoot,
    env: { ...process.env, LOCAL_DB_PATH: dbPath, ...extraEnv },
    encoding: 'utf8',
  });
}

test('clean install creates the full schema from master.sql', () => {
  const dbPath = freshDbPath();
  try {
    const output = runMigrate(dbPath);
    assert.match(output, /Initialized clean SQLite database/);

    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    db.close();

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
      'schema_migrations',
    ]) {
      assert.ok(tables.includes(expected), `expected table "${expected}" to exist after clean install`);
    }
  } finally {
    cleanup(dbPath);
  }
});

test('re-running migrate-local against an already-migrated database is a safe no-op', () => {
  const dbPath = freshDbPath();
  try {
    runMigrate(dbPath);
    const secondRunOutput = runMigrate(dbPath);
    assert.match(secondRunOutput, /No new migrations to apply/);

    // A second run must not have duplicated or corrupted anything.
    const db = new Database(dbPath, { readonly: true });
    const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
    db.close();
    assert.equal(memberCount, 0);
  } finally {
    cleanup(dbPath);
  }
});
