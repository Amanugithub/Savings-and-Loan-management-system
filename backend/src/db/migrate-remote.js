import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations/postgres');

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

function getMigrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`
    SELECT filename
    FROM schema_migrations
  `);

  return new Set(result.rows.map((row) => row.filename));
}

async function getLegacyReport(client) {
  const administratorsResult = await client.query(`
    SELECT id, name, username, status
    FROM administrators
    ORDER BY created_at
  `);

  const pendingLoansResult = await client.query(`
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
  `);

  const duplicateBorrowersResult = await client.query(`
    SELECT member_id, COUNT(*) AS count
    FROM loans
    WHERE status IN (${LIVE_LOAN_STATUSES.map((_, i) => `$${i + 1}`).join(',')})
    GROUP BY member_id
    HAVING COUNT(*) > 1
  `, LIVE_LOAN_STATUSES);

  const duplicateGuarantorsResult = await client.query(`
    SELECT guarantor_member_id, COUNT(*) AS count
    FROM loans
    WHERE guarantor_member_id IS NOT NULL
      AND status IN (${LIVE_LOAN_STATUSES.map((_, i) => `$${i + 1}`).join(',')})
    GROUP BY guarantor_member_id
    HAVING COUNT(*) > 1
  `, LIVE_LOAN_STATUSES);

  const orphanedLoansResult = await client.query(`
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
  `);

  const orphanedTransactionsResult = await client.query(`
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
  `);

  return {
    administrators: administratorsResult.rows,
    pendingLoans: pendingLoansResult.rows,
    duplicateBorrowers: duplicateBorrowersResult.rows,
    duplicateGuarantors: duplicateGuarantorsResult.rows,
    orphanedLoans: orphanedLoansResult.rows,
    orphanedTransactions: orphanedTransactionsResult.rows,
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
    if (String(admin.id) === KNOWN_GENERAL_MANAGER_ID) {
      continue;
    }

    if (!roleMap[admin.id]) {
      errors.push(
        `Administrator ${admin.id} (${admin.username}) requires an explicit role mapping.`
      );
    }
  }

  for (const loanId of Object.keys(loanStageMap)) {
    const exists = report.pendingLoans.some(
      (loan) => String(loan.id) === loanId
    );

    if (!exists) {
      errors.push(
        `Legacy loan exception references nonexistent or non-pending loan ${loanId}.`
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
  console.log('\n=== REMOTE DATABASE MIGRATION DRY RUN ===\n');

  console.log('Administrators:');

  for (const admin of report.administrators) {
    const role =
      String(admin.id) === KNOWN_GENERAL_MANAGER_ID
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

    const targetStatus =
      exception ??
      (
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

  console.log(
    `\nOrphaned transaction references: ${report.orphanedTransactions.length}`
  );

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

async function createMappingTables(client, roleMap, loanStageMap) {
  await client.query(`
    CREATE TEMP TABLE migration_admin_role_map (
      admin_id UUID PRIMARY KEY,
      role VARCHAR(30) NOT NULL
    ) ON COMMIT DROP;

    CREATE TEMP TABLE migration_loan_stage_map (
      loan_id UUID PRIMARY KEY,
      status VARCHAR(40) NOT NULL
    ) ON COMMIT DROP;
  `);

  for (const [adminId, role] of Object.entries(roleMap)) {
    await client.query(
      `
        INSERT INTO migration_admin_role_map (admin_id, role)
        VALUES ($1, $2)
      `,
      [adminId, role]
    );
  }

  await client.query(
    `
      INSERT INTO migration_admin_role_map (admin_id, role)
      VALUES ($1, $2)
      ON CONFLICT (admin_id) DO NOTHING
    `,
    [KNOWN_GENERAL_MANAGER_ID, 'general_manager']
  );

  for (const [loanId, status] of Object.entries(loanStageMap)) {
    await client.query(
      `
        INSERT INTO migration_loan_stage_map (loan_id, status)
        VALUES ($1, $2)
      `,
      [loanId, status]
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for remote PostgreSQL migration.'
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);

    const roleMap = parseJsonEnv('ADMIN_ROLE_MAP');
    const loanStageMap = parseJsonEnv('LEGACY_LOAN_STAGE_MAP');

    const mappingErrors = validateMappings(
      roleMap,
      loanStageMap
    );

    if (mappingErrors.length) {
      throw new Error(mappingErrors.join('\n'));
    }

    const report = await getLegacyReport(client);

    if (isDryRun) {
      printDryRun(
        report,
        roleMap,
        loanStageMap
      );

      const errors = validateLegacyData(
        report,
        roleMap,
        loanStageMap
      );

      process.exitCode = errors.length ? 1 : 0;
      return;
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

    const applied = await getAppliedMigrations(client);
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

      await client.query('BEGIN');

      try {
        await createMappingTables(
          client,
          roleMap,
          loanStageMap
        );

        await client.query(sql);

        await client.query(
          `
            INSERT INTO schema_migrations (filename)
            VALUES ($1)
          `,
          [file]
        );

        await client.query('COMMIT');

        console.log(`Applied ${file}.`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      ranCount++;
    }

    console.log(
      ranCount > 0
        ? `Applied ${ranCount} migration(s).`
        : 'No new migrations to apply.'
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\nRemote migration failed:\n');
  console.error(error);
  process.exitCode = 1;
});