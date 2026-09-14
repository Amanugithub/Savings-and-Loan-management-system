// Read-only health checks for local.db, meant to run before and after a
// release. This is deliberately separate from migrate-local.js's own
// --dry-run report (which only covers what blocks the one-time legacy
// migration: role/status mapping, duplicate live loans, orphaned
// loans/transactions) — this script covers the newer tables and the
// checks that matter for an ongoing release, not just the original
// migration.
//
// Usage: node src/db/verify-release.js
// Exit code is always 0 — this is a report, not a gate (the actual
// migration gate is migrate-local.js/migrate-remote.js's own validation).
// Read the FAIL lines; don't just check the exit code.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_ROLES = [
  'chairperson', 'vice_chairperson', 'loan_committee', 'cashier',
  'accountant', 'general_manager', 'control_audit_committee',
];
const LIVE_LOAN_STATUSES = [
  'awaiting_guarantor', 'awaiting_recommendation', 'awaiting_committee_approval', 'approved', 'active',
];
const VALID_NOTIFICATION_TYPES = ['payment_due', 'meeting', 'news', 'loan_status', 'guarantor_request'];

const results = [];

function check(name, rows, describe) {
  const ok = rows.length === 0;
  results.push({ name, ok, rows, describe });
  return ok;
}

// --- Orphaned foreign keys -------------------------------------------------
// PRAGMA foreign_key_check is the authoritative version of this (SQLite
// checks every FK in the schema), but it doesn't say *which* rows or give
// a human-readable table name mapping on its own, so we still run it as
// the final authoritative check and report anything it finds.
check(
  'Orphaned foreign keys (PRAGMA foreign_key_check)',
  db.prepare('PRAGMA foreign_key_check').all(),
  (rows) => rows.map((r) => `${r.table} row ${r.rowid} references missing ${r.parent} row`)
);

// --- Duplicate live loans ---------------------------------------------------
check(
  'Members with more than one live borrower loan',
  db.prepare(
    `SELECT member_id, COUNT(*) AS count FROM loans
     WHERE status IN (${LIVE_LOAN_STATUSES.map(() => '?').join(',')})
     GROUP BY member_id HAVING COUNT(*) > 1`
  ).all(...LIVE_LOAN_STATUSES),
  (rows) => rows.map((r) => `member ${r.member_id}: ${r.count} live loans`)
);
check(
  'Members guaranteeing more than one live loan',
  db.prepare(
    `SELECT guarantor_member_id, COUNT(*) AS count FROM loans
     WHERE guarantor_member_id IS NOT NULL
       AND status IN (${LIVE_LOAN_STATUSES.map(() => '?').join(',')})
     GROUP BY guarantor_member_id HAVING COUNT(*) > 1`
  ).all(...LIVE_LOAN_STATUSES),
  (rows) => rows.map((r) => `guarantor ${r.guarantor_member_id}: ${r.count} live guaranteed loans`)
);

// --- Administrators without a valid role ------------------------------------
check(
  'Administrators with an invalid or missing role',
  db.prepare(
    `SELECT id, username, role FROM administrators
     WHERE role IS NULL OR role NOT IN (${VALID_ROLES.map(() => '?').join(',')})`
  ).all(...VALID_ROLES),
  (rows) => rows.map((r) => `${r.username} (${r.id}): role = ${r.role ?? 'NULL'}`)
);

// --- Legacy pending loans never migrated off the old 4-status model --------
check(
  'Loans still on the legacy "pending" status (issue #41 migration incomplete)',
  db.prepare(`SELECT id, member_id FROM loans WHERE status = 'pending'`).all(),
  (rows) => rows.map((r) => `loan ${r.id} (member ${r.member_id})`)
);

// --- Active/closed loans missing their installment schedule -----------------
check(
  'Disbursed loans with no installment schedule',
  db.prepare(
    `SELECT l.id, l.status FROM loans l
     WHERE l.status IN ('active', 'closed')
       AND NOT EXISTS (SELECT 1 FROM loan_installments i WHERE i.loan_id = l.id)`
  ).all(),
  (rows) => rows.map((r) => `loan ${r.id} (status: ${r.status})`)
);

// --- Duplicate natural keys (belt-and-suspenders on top of the unique
// indexes — these should be structurally impossible, but restoring from a
// backup or an old export could reintroduce a pre-constraint duplicate) ---
check(
  'Duplicate (loan_id, installment_number) pairs',
  db.prepare(
    `SELECT loan_id, installment_number, COUNT(*) AS count FROM loan_installments
     GROUP BY loan_id, installment_number HAVING COUNT(*) > 1`
  ).all(),
  (rows) => rows.map((r) => `loan ${r.loan_id} installment #${r.installment_number}: ${r.count} rows`)
);
check(
  'Duplicate (loan_id, penalty_period) pairs',
  db.prepare(
    `SELECT loan_id, penalty_period, COUNT(*) AS count FROM loan_penalties
     GROUP BY loan_id, penalty_period HAVING COUNT(*) > 1`
  ).all(),
  (rows) => rows.map((r) => `loan ${r.loan_id} period ${r.penalty_period}: ${r.count} rows`)
);

// --- Invalid notification types (CHECK constraint should prevent this;
// this catches rows that predate a constraint change or were restored) ----
check(
  'Notifications with an invalid type',
  db.prepare(
    `SELECT id, type FROM notifications WHERE type NOT IN (${VALID_NOTIFICATION_TYPES.map(() => '?').join(',')})`
  ).all(...VALID_NOTIFICATION_TYPES),
  (rows) => rows.map((r) => `notification ${r.id}: type = ${r.type}`)
);

// --- Sync backlog ------------------------------------------------------------
const SYNCED_TABLES = [
  'administrators', 'members', 'loans', 'loan_installments', 'loan_penalties',
  'loan_payments', 'loan_payment_allocations', 'transactions', 'expenses',
  'dividend_history', 'member_exits', 'notifications',
];
const unsyncedCounts = SYNCED_TABLES
  .map((table) => ({ table, count: db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE synced_at IS NULL`).get().c }))
  .filter((row) => row.count > 0);
check(
  'Tables with unsynced rows (run POST /api/sync before release)',
  unsyncedCounts,
  (rows) => rows.map((r) => `${r.table}: ${r.count} unsynced row(s)`)
);

// --- Report ------------------------------------------------------------------
console.log('\n=== RELEASE VERIFICATION REPORT ===\n');
let anyFailed = false;
for (const result of results) {
  if (result.ok) {
    console.log(`PASS  ${result.name}`);
    continue;
  }
  anyFailed = true;
  console.log(`FAIL  ${result.name} (${result.rows.length})`);
  for (const line of result.describe(result.rows).slice(0, 20)) {
    console.log(`        - ${line}`);
  }
  if (result.rows.length > 20) console.log(`        … and ${result.rows.length - 20} more`);
}
console.log(`\n${anyFailed ? 'One or more checks found issues — review before releasing.' : 'All checks passed.'}\n`);
