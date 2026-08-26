import db from '../config/sqlite.js';
import pool from '../config/postgres.js';

// Order matters: a child row (e.g. a loan) references a parent row
// (a member) via foreign key. If we tried to push loans before their
// member exists on the remote side, the insert would fail. Parents
// first, children after.
const SYNC_TABLES = [
  {
    name: 'administrators',
    columns: ['id', 'name', 'username', 'password_hash', 'status', 'created_at', 'updated_at'],
    identity: 'username',
  },
  {
    name: 'members',
    columns: [
      'id', 'name', 'gender', 'address', 'age', 'heir_info', 'id_card_number',
      'phone_number', 'password_hash', 'date_joined', 'status', 'created_at', 'updated_at',
    ],
    identity: 'member',
  },
  {
    name: 'loans',
    columns: [
      'id', 'member_id', 'guarantor_member_id', 'type', 'principal_amount', 'term_years',
      'interest_rate', 'monthly_installment', 'monthly_interest_amount', 'insurance_amount',
      'collateral_type', 'disbursement_date', 'status', 'created_at',
      'updated_at',
    ],
  },
  {
    name: 'transactions',
    // fiscal_year / fiscal_month are excluded on purpose — they're
    // GENERATED ALWAYS columns on both sides. Postgres computes its own
    // from `date`; sending SQLite's precomputed values would fail
    // (a generated column can't be assigned directly).
    columns: ['id', 'member_id', 'loan_id', 'recorded_by', 'type', 'amount', 'date', 'notes', 'created_at', 'updated_at'],
  },
  {
    name: 'expenses',
    columns: ['id', 'category', 'description', 'amount', 'date', 'recorded_by', 'created_at', 'updated_at'],
  },
  {
    name: 'dividend_history',
    columns: ['id', 'member_id', 'fiscal_year', 'savings_dividend', 'share_dividend', 'date_calculated', 'updated_at'],
    identity: 'dividend',
  },
  {
    name: 'member_exits',
    columns: [
      'id', 'member_id', 'exit_date', 'savings_returned', 'shares_returned',
      'dividend_owed', 'government_withholding', 'net_amount_paid',
      'updated_at',
    ],
    identity: 'exit',
  },
  {
    name: 'notifications',
    columns: ['id', 'member_id', 'loan_id', 'title', 'message', 'type', 'is_read', 'created_at', 'updated_at'],
    // SQLite has no boolean type -- is_read is stored as 0/1. Postgres's
    // column is a real BOOLEAN, so it needs an explicit conversion.
    coerce: (row) => ({ ...row, is_read: Boolean(row.is_read) }),
  },
];

const FOREIGN_KEYS = {
  loans: { member_id: 'members', guarantor_member_id: 'members' },
  transactions: { member_id: 'members', loan_id: 'loans', recorded_by: 'administrators' },
  expenses: { recorded_by: 'administrators' },
  dividend_history: { member_id: 'members' },
  member_exits: { member_id: 'members' },
  notifications: { member_id: 'members', loan_id: 'loans' },
};

// Keep the remote writes concurrent enough to make initial sync practical,
// while bounding load on Supabase and preserving table-level FK ordering.
const PUSH_CONCURRENCY = 10;

function mappedId(table, localId) {
  if (!localId) return localId;
  return db.prepare(
    'SELECT remote_id FROM sync_id_map WHERE local_table = ? AND local_id = ?'
  ).get(table, localId)?.remote_id || localId;
}

function getRemoteIdentity(table, row) {
  if (table.identity === 'username') {
    return pool.query('SELECT id FROM administrators WHERE username = $1', [row.username]);
  }
  if (table.identity === 'member') {
    return pool.query(
      `SELECT id FROM members
       WHERE id = $1 OR phone_number = $2 OR (id_card_number IS NOT NULL AND id_card_number = $3)
       ORDER BY CASE WHEN id = $1 THEN 0 WHEN phone_number = $2 THEN 1 ELSE 2 END
       LIMIT 1`,
      [row.id, row.phone_number, row.id_card_number]
    );
  }
  if (table.identity === 'dividend') {
    return pool.query(
      'SELECT id FROM dividend_history WHERE member_id = $1 AND fiscal_year = $2',
      [mappedId('members', row.member_id), row.fiscal_year]
    );
  }
  if (table.identity === 'exit') {
    return pool.query(
      'SELECT id FROM member_exits WHERE member_id = $1',
      [mappedId('members', row.member_id)]
    );
  }
  return pool.query(`SELECT id FROM ${table.name} WHERE id = $1`, [row.id]);
}

function recordMapping(table, localId, remoteId) {
  db.prepare(`
    INSERT INTO sync_id_map (local_table, local_id, remote_id)
    VALUES (?, ?, ?)
    ON CONFLICT(local_table, local_id) DO UPDATE SET remote_id = excluded.remote_id
  `).run(table.name, localId, remoteId);
}

function getPendingCounts() {
  return Object.fromEntries(
    SYNC_TABLES.map((table) => {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM ${table.name} WHERE synced_at IS NULL`)
        .get();
      return [table.name, Number(row?.count || 0)];
    })
  );
}

async function checkRemoteHealth() {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    return {
      ok: true,
      checked_at: new Date().toISOString(),
      details: result.rows[0],
    };
  } catch (error) {
    return {
      ok: false,
      checked_at: new Date().toISOString(),
      error: error.message,
    };
  }
}

async function pushTable({ name, columns, coerce }) {
  const table = SYNC_TABLES.find((candidate) => candidate.name === name);
  const versionExpression = name === 'member_exits'
    ? 'COALESCE(updated_at, exit_date)'
    : name === 'dividend_history'
      ? 'COALESCE(updated_at, date_calculated)'
    : 'COALESCE(updated_at, created_at)';
  const pendingRows = db
    .prepare(`SELECT * FROM ${name} WHERE synced_at IS NULL ORDER BY ${name === 'member_exits' ? 'exit_date' : 'created_at'} ASC, id ASC`)
    .all();

  const result = { table: name, found: pendingRows.length, pushed: 0, skipped: 0, failed: [] };
  if (pendingRows.length === 0) return result;

  const markSynced = db.prepare(`
    UPDATE ${name}
    SET synced_at = datetime('now')
    WHERE id = ? AND synced_at IS NULL AND ${versionExpression} IS ?
  `);

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updateSet = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  const hasUpdatedAt = columns.includes('updated_at');
  const conflictGuard = hasUpdatedAt
    ? ` WHERE ${name}.updated_at IS NULL OR EXCLUDED.updated_at >= ${name}.updated_at`
    : '';

  const sql = `
    INSERT INTO ${name} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT DO UPDATE SET ${updateSet}${conflictGuard}
    RETURNING id
  `;

  let nextIndex = 0;
  async function pushNext() {
    while (true) {
      const index = nextIndex++;
      if (index >= pendingRows.length) return;

      const rawRow = pendingRows[index];
      const row = coerce ? coerce(rawRow) : rawRow;
      const remoteRow = { ...row, id: mappedId(name, row.id) };
      for (const [column, referencedTable] of Object.entries(FOREIGN_KEYS[name] || {})) {
        if (remoteRow[column]) remoteRow[column] = mappedId(referencedTable, remoteRow[column]);
      }
      if (hasUpdatedAt && !remoteRow.updated_at) remoteRow.updated_at = remoteRow.created_at;
      const values = columns.map((column) => remoteRow[column] ?? null);

      try {
        const queryResult = await pool.query(sql, values);
        let remoteId = queryResult.rows[0]?.id;

        // For tables that track updated_at, a stale local row can be safely
        // skipped if the remote row already has a newer state.
        if (!remoteId && hasUpdatedAt) {
          const identityResult = await getRemoteIdentity(table, remoteRow);
          remoteId = identityResult.rows[0]?.id;
          if (!remoteId) {
            result.failed.push({ id: row.id, error: 'Remote row was not returned after conflict check' });
            continue;
          }
        }

        if (remoteId) recordMapping(table, row.id, remoteId);
        const snapshotVersion = rawRow.updated_at
          ?? rawRow.created_at
          ?? rawRow.date_calculated;
        const updateResult = markSynced.run(row.id, snapshotVersion);
        if (updateResult.changes === 0) {
          result.skipped++;
          continue;
        }

        result.pushed++;
      } catch (error) {
        // One bad row (e.g. a stale FK reference) shouldn't block the
        // rest of the batch -- record it and keep going.
        result.failed.push({ id: row.id, error: error.message });
      }
    }
  }

  const workerCount = Math.min(PUSH_CONCURRENCY, pendingRows.length);
  await Promise.all(Array.from({ length: workerCount }, () => pushNext()));

  return result;
}

// Pushes every table's pending rows to remote, in FK-safe order.
// Returns a per-table summary -- always check `failed` on each table,
// a non-throwing result does not mean everything succeeded.
export async function runSync() {
  const results = [];
  for (const table of SYNC_TABLES) {
    results.push(await pushTable(table));
  }
  return results;
}

export async function getSyncStatus() {
  const tables = getPendingCounts();
  const totalPending = Object.values(tables).reduce((sum, count) => sum + count, 0);
  const remote = await checkRemoteHealth();

  return {
    ok: remote.ok,
    checked_at: new Date().toISOString(),
    pending_rows: totalPending,
    tables,
    remote,
  };
}

export async function getSyncHealth() {
  return getSyncStatus();
}
