import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations/sqlite');

const isDryRun = process.argv.includes('--dry-run');

const KNOWN_GENERAL_MANAGER_ID =
  '8469f799-0d87-44b4-84e9-b18f6a443ba3';

const ROLE_VALUES = [
  'chairperson',
  'vice_chairperson',
  'loan_committee',
  'cashier',
  'accountant',
  'general_manager',
  'control_audit_committee',
];

const LIVE_LOAN_STATUSES = [
  'awaiting_guarantor',
  'awaiting_recommendation',
  'awaiting_committee_approval',
  'approved',
  'active',
];

const VALID_LEGACY_STAGE_STATUSES = [
  ...LIVE_LOAN_STATUSES,
  'guarantor_declined',
  'recommendation_declined',
  'rejected',
  'closed',
];

function parseJsonEnv(name) {
  const value = process.env[name];

  if (!value) return {};

  let parsed;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be valid JSON.`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error(`${name} must be a JSON object.`);
  }

  return parsed;
}

function ensureMigrationTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getMigrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
}

function getAppliedMigrations() {
  return new Set(
    db
      .prepare('SELECT filename FROM schema_migrations')
      .all()
      .map((row) => row.filename)
  );
}

function initializeCleanInstall() {
  const hasMembersTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'members'")
    .get();

  if (hasMembersTable) return false;

  const masterPath = path.join(migrationsDir, 'master.sql');
  const masterSql = fs.readFileSync(masterPath, 'utf8');
  const migrationFiles = getMigrationFiles();

  db.transaction(() => {
    db.exec(masterSql);

    const insert = db.prepare(
      'INSERT INTO schema_migrations (filename) VALUES (?)'
    );
    for (const file of migrationFiles) insert.run(file);
  })();

  console.log(
    `Initialized clean SQLite database from master.sql and recorded ${migrationFiles.length} migration(s).`
  );
  return true;
}

function getLegacyReport() {
  const administrators = db
    .prepare(`
      SELECT id, name, username, status
      FROM administrators
      ORDER BY created_at
    `)
    .all();

  const pendingLoans = db
    .prepare(`
      SELECT
        id,
        member_id,
        guarantor_member_id,
        type,
        collateral_type,
        status
      FROM loans
      WHERE status = 'pending'
      ORDER BY created_at
    `)
    .all();

  const duplicateBorrowers = db
    .prepare(`
      SELECT member_id, COUNT(*) AS count
      FROM loans
      WHERE status IN (${LIVE_LOAN_STATUSES.map(() => '?').join(',')})
      GROUP BY member_id
      HAVING COUNT(*) > 1
    `)
    .all(...LIVE_LOAN_STATUSES);

  const duplicateGuarantors = db
    .prepare(`
      SELECT guarantor_member_id, COUNT(*) AS count
      FROM loans
      WHERE guarantor_member_id IS NOT NULL
        AND status IN (${LIVE_LOAN_STATUSES.map(() => '?').join(',')})
      GROUP BY guarantor_member_id
      HAVING COUNT(*) > 1
    `)
    .all(...LIVE_LOAN_STATUSES);

  const orphanedLoans = db
    .prepare(`
      SELECT
        l.id,
        l.member_id,
        l.guarantor_member_id
      FROM loans l
      LEFT JOIN members m ON m.id = l.member_id
      LEFT JOIN members g ON g.id = l.guarantor_member_id
      WHERE m.id IS NULL
         OR (
           l.guarantor_member_id IS NOT NULL
           AND g.id IS NULL
         )
    `)
    .all();

  const orphanedTransactions = db
    .prepare(`
      SELECT
        t.id,
        t.member_id,
        t.loan_id,
        t.recorded_by
      FROM transactions t
      LEFT JOIN members m ON m.id = t.member_id
      LEFT JOIN loans l ON l.id = t.loan_id
      LEFT JOIN administrators a ON a.id = t.recorded_by
      WHERE (t.member_id IS NOT NULL AND m.id IS NULL)
         OR (t.loan_id IS NOT NULL AND l.id IS NULL)
         OR a.id IS NULL
    `)
    .all();

  return {
    administrators,
    pendingLoans,
    duplicateBorrowers,
    duplicateGuarantors,
    orphanedLoans,
    orphanedTransactions,
  };
}

function validateMappings(roleMap, loanStageMap) {
  const errors = [];

  for (const [adminId, role] of Object.entries(roleMap)) {
    if (!ROLE_VALUES.includes(role)) {
      errors.push(
        `Invalid administrator role "${role}" for ${adminId}.`
      );
    }
  }

  for (const [loanId, status] of Object.entries(loanStageMap)) {
    if (!VALID_LEGACY_STAGE_STATUSES.includes(status)) {
      errors.push(
        `Invalid legacy loan status "${status}" for ${loanId}.`
      );
    }
  }

  return errors;
}

function validateLegacyData(report, roleMap, loanStageMap) {
  const errors = [];

  for (const admin of report.administrators) {
    if (admin.id === KNOWN_GENERAL_MANAGER_ID) {
      continue;
    }

    if (!roleMap[admin.id]) {
      errors.push(
        `Administrator ${admin.id} (${admin.username}) requires an explicit role mapping.`
      );
    }
  }

  for (const [loanId] of Object.entries(loanStageMap)) {
    const loan = db
      .prepare('SELECT id, status FROM loans WHERE id = ?')
      .get(loanId);

    if (!loan) {
      errors.push(
        `Legacy loan exception references nonexistent loan ${loanId}.`
      );
    }
  }

  if (report.duplicateBorrowers.length) {
    errors.push(
      'Duplicate live borrower loans must be resolved before migration.'
    );
  }

  if (report.duplicateGuarantors.length) {
    errors.push(
      'Duplicate live guarantor loans must be resolved before migration.'
    );
  }

  if (report.orphanedLoans.length) {
    errors.push(
      'Orphaned loan references must be resolved before migration.'
    );
  }

  if (report.orphanedTransactions.length) {
    errors.push(
      'Orphaned transaction references must be resolved before migration.'
    );
  }

  return errors;
}

function printDryRun(report, roleMap, loanStageMap) {
  console.log('\n=== DATABASE MIGRATION DRY RUN ===\n');

  console.log('Administrators:');

  for (const admin of report.administrators) {
    const role =
      admin.id === KNOWN_GENERAL_MANAGER_ID
        ? 'general_manager (automatic)'
        : roleMap[admin.id] ?? 'UNMAPPED';

    console.log(
      `  ${admin.id} | ${admin.username} | ${admin.status} | ${role}`
    );
  }

  console.log('\nLegacy pending loans:');

  if (!report.pendingLoans.length) {
    console.log('  None');
  }

  for (const loan of report.pendingLoans) {
    const exception = loanStageMap[loan.id];

    const targetStatus = exception
      ?? (
        loan.guarantor_member_id
          ? 'awaiting_guarantor'
          : 'awaiting_recommendation'
      );

    console.log(
      `  ${loan.id} | pending -> ${targetStatus} | ` +
      `guarantor=${loan.guarantor_member_id ?? 'none'}`
    );
  }

  console.log(
    `\nDuplicate live borrower loans: ${report.duplicateBorrowers.length}`
  );

  for (const row of report.duplicateBorrowers) {
    console.log(`  member=${row.member_id} | count=${row.count}`);
  }

  console.log(
    `\nDuplicate live guarantor loans: ${report.duplicateGuarantors.length}`
  );

  for (const row of report.duplicateGuarantors) {
    console.log(`  guarantor=${row.guarantor_member_id} | count=${row.count}`);
  }

  console.log(
    `\nOrphaned loan references: ${report.orphanedLoans.length}`
  );

  for (const row of report.orphanedLoans) {
    console.log(
      `  loan=${row.id} | member=${row.member_id} | ` +
      `guarantor=${row.guarantor_member_id ?? 'none'}`
    );
  }

  console.log(
    `\nOrphaned transaction references: ${report.orphanedTransactions.length}`
  );

  for (const row of report.orphanedTransactions) {
    console.log(
      `  transaction=${row.id} | member=${row.member_id ?? 'none'} | ` +
      `loan=${row.loan_id ?? 'none'} | admin=${row.recorded_by}`
    );
  }

  const errors = validateLegacyData(
    report,
    roleMap,
    loanStageMap
  );

  console.log('\n----------------------------------');

  if (errors.length) {
    console.log('RESULT: BLOCKED');
    console.log('\nRequired actions:');

    for (const error of errors) {
      console.log(`  - ${error}`);
    }
  } else {
    console.log('RESULT: READY TO MIGRATE');
  }

  console.log('');
}

function populateLegacyMaps(roleMap, loanStageMap) {
  db.exec(`
    DROP TABLE IF EXISTS migration_admin_role_map;
    DROP TABLE IF EXISTS migration_loan_stage_map;
    
    CREATE TEMP TABLE migration_admin_role_map (
      admin_id TEXT PRIMARY KEY,
      role TEXT NOT NULL
    );

    CREATE TEMP TABLE migration_loan_stage_map (
      loan_id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
  `);

  const insertAdmin = db.prepare(`
    INSERT INTO migration_admin_role_map (admin_id, role)
    VALUES (?, ?)
  `);

  insertAdmin.run(
    KNOWN_GENERAL_MANAGER_ID,
    'general_manager'
  );

  for (const [adminId, role] of Object.entries(roleMap)) {
    insertAdmin.run(adminId, role);
  }

  const insertLoan = db.prepare(`
    INSERT INTO migration_loan_stage_map (loan_id, status)
    VALUES (?, ?)
  `);

  for (const [loanId, status] of Object.entries(loanStageMap)) {
    insertLoan.run(loanId, status);
  }
}

ensureMigrationTable();

if (initializeCleanInstall()) process.exit(0);

const roleMap = parseJsonEnv('ADMIN_ROLE_MAP');
const loanStageMap = parseJsonEnv('LEGACY_LOAN_STAGE_MAP');

const mappingErrors = validateMappings(
  roleMap,
  loanStageMap
);

if (mappingErrors.length) {
  throw new Error(mappingErrors.join('\n'));
}

const report = getLegacyReport();

if (isDryRun) {
  printDryRun(
    report,
    roleMap,
    loanStageMap
  );

  process.exit(
    validateLegacyData(
      report,
      roleMap,
      loanStageMap
    ).length
      ? 1
      : 0
  );
}

const validationErrors = validateLegacyData(
  report,
  roleMap,
  loanStageMap
);

if (validationErrors.length) {
  printDryRun(
    report,
    roleMap,
    loanStageMap
  );

  throw new Error(
    'Migration blocked because legacy-data issues must be resolved first.'
  );
}

const applied = getAppliedMigrations();
const files = getMigrationFiles();

let ranCount = 0;

for (const file of files) {
  if (applied.has(file)) {
    continue;
  }

  const sql = fs.readFileSync(
    path.join(migrationsDir, file),
    'utf8'
  );

  console.log(`Applying ${file}...`);

  db.pragma('foreign_keys = OFF');

  try {
    const runMigration = db.transaction(() => {
      populateLegacyMaps(
        roleMap,
        loanStageMap
      );

      db.exec(sql);

      db.prepare(`
        INSERT INTO schema_migrations (filename)
        VALUES (?)
      `).run(file);
    });

    runMigration();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const foreignKeyErrors = db
    .prepare('PRAGMA foreign_key_check')
    .all();

  if (foreignKeyErrors.length) {
    throw new Error(
      `Foreign-key validation failed after ${file}.`
    );
  }

  ranCount++;
}

console.log(
  ranCount > 0
    ? `Applied ${ranCount} migration(s).`
    : 'No new migrations to apply.'
);
