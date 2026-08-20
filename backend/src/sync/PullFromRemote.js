import db from '../config/sqlite.js';
import pool from '../config/postgres.js';

// Pull parents before children so remote UUID foreign keys can be translated
// to the local UUIDs recorded in sync_id_map.
const PULL_TABLES = [
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
      'collateral_type', 'disbursement_date', 'status', 'created_at', 'updated_at',
    ],
    identity: 'id',
  },
  {
    name: 'transactions',
    columns: ['id', 'member_id', 'loan_id', 'recorded_by', 'type', 'amount', 'date', 'notes', 'created_at', 'updated_at'],
    identity: 'id',
  },
  {
    name: 'expenses',
    columns: ['id', 'category', 'description', 'amount', 'date', 'recorded_by', 'created_at', 'updated_at'],
    identity: 'id',
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
      'dividend_owed', 'government_withholding', 'net_amount_paid', 'updated_at',
    ],
    identity: 'exit',
  },
  {
    name: 'notifications',
    columns: ['id', 'member_id', 'loan_id', 'title', 'message', 'type', 'is_read', 'created_at', 'updated_at'],
    identity: 'id',
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

const BATCH_SIZE = 500;

function localIdForRemote(tableName, remoteId) {
  return db.prepare(
    'SELECT local_id FROM sync_id_map WHERE local_table = ? AND remote_id = ?'
  ).get(tableName, remoteId)?.local_id;
}

function findLocalId(table, row) {
  const mapped = localIdForRemote(table.name, row.id);
  if (mapped) return mapped;

  if (table.identity === 'username') {
    return db.prepare('SELECT id FROM administrators WHERE id = ? OR username = ? LIMIT 1')
      .get(row.id, row.username)?.id;
  }
  if (table.identity === 'member') {
    return db.prepare(
      `SELECT id FROM members
       WHERE id = ? OR phone_number = ? OR (id_card_number IS NOT NULL AND id_card_number = ?)
       ORDER BY CASE WHEN id = ? THEN 0 WHEN phone_number = ? THEN 1 ELSE 2 END
       LIMIT 1`
    ).get(row.id, row.phone_number, row.id_card_number, row.id, row.phone_number)?.id;
  }
  if (table.identity === 'dividend') {
    const memberId = localIdForRemote('members', row.member_id) || row.member_id;
    return db.prepare(
      'SELECT id FROM dividend_history WHERE id = ? OR (member_id = ? AND fiscal_year = ?) LIMIT 1'
    ).get(row.id, memberId, row.fiscal_year)?.id;
  }
  if (table.identity === 'exit') {
    const memberId = localIdForRemote('members', row.member_id) || row.member_id;
    return db.prepare('SELECT id FROM member_exits WHERE id = ? OR member_id = ? LIMIT 1')
      .get(row.id, memberId)?.id;
  }
  return db.prepare(`SELECT id FROM ${table.name} WHERE id = ?`).get(row.id)?.id;
}

function recordMapping(tableName, localId, remoteId) {
  db.prepare(`
    INSERT INTO sync_id_map (local_table, local_id, remote_id)
    VALUES (?, ?, ?)
    ON CONFLICT(local_table, local_id) DO UPDATE SET remote_id = excluded.remote_id
  `).run(tableName, localId, remoteId);
}

function toSqliteValue(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function cursorValue(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function localForeignKey(tableName, value) {
  if (!value) return value;
  return localIdForRemote(tableName, value) || value;
}

function getCursor(tableName) {
  return db.prepare(
    'SELECT cursor_updated_at, cursor_id FROM sync_state WHERE table_name = ?'
  ).get(tableName);
}

function saveCursor(tableName, row) {
  db.prepare(`
    INSERT INTO sync_state (table_name, cursor_updated_at, cursor_id)
    VALUES (?, ?, ?)
    ON CONFLICT(table_name) DO UPDATE SET
      cursor_updated_at = excluded.cursor_updated_at,
      cursor_id = excluded.cursor_id
  `).run(tableName, cursorValue(row.updated_at), row.id);
}

function fetchRows(table, cursor) {
  const columns = table.columns.join(', ');
  if (!cursor) {
    return pool.query(
      `SELECT ${columns} FROM ${table.name}
       ORDER BY updated_at ASC, id ASC LIMIT $1`,
      [BATCH_SIZE]
    );
  }
  return pool.query(
    `SELECT ${columns} FROM ${table.name}
     WHERE (updated_at, id) > ($1::timestamptz, $2::uuid)
     ORDER BY updated_at ASC, id ASC LIMIT $3`,
    [cursor.cursor_updated_at, cursor.cursor_id, BATCH_SIZE]
  );
}

function buildLocalRow(table, remoteRow, localId) {
  const row = { ...remoteRow, id: localId };
  for (const [column, referencedTable] of Object.entries(FOREIGN_KEYS[table.name] || {})) {
    if (row[column]) row[column] = localForeignKey(referencedTable, row[column]);
  }
  for (const column of table.columns) row[column] = toSqliteValue(row[column]);
  return row;
}

function upsertLocal(table, row) {
  const columns = [...table.columns, 'synced_at'];
  const placeholders = columns.map(() => '?').join(', ');
  const updateSet = table.columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  const values = columns.map((column) => column === 'synced_at' ? new Date().toISOString() : row[column] ?? null);

  return db.prepare(`
    INSERT INTO ${table.name} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updateSet}
      WHERE ${table.name}.updated_at IS NULL OR excluded.updated_at >= ${table.name}.updated_at
  `).run(...values);
}

function pendingLocalRow(tableName, localId) {
  return db.prepare(`SELECT id, synced_at FROM ${tableName} WHERE id = ?`).get(localId);
}

async function pullTable(table) {
  const cursor = getCursor(table.name);
  const remoteResult = await fetchRows(table, cursor);
  const result = { table: table.name, found: remoteResult.rows.length, pulled: 0, skipped: 0, failed: [] };

  for (const remoteRow of remoteResult.rows) {
    const localId = findLocalId(table, remoteRow) || remoteRow.id;
    recordMapping(table.name, localId, remoteRow.id);

    const local = pendingLocalRow(table.name, localId);
    if (local?.synced_at === null) {
      result.skipped++;
      saveCursor(table.name, remoteRow);
      continue;
    }

    try {
      const localRow = buildLocalRow(table, remoteRow, localId);
      upsertLocal(table, localRow);
      result.pulled++;
    } catch (error) {
      result.failed.push({ id: remoteRow.id, error: error.message });
      continue;
    }

    saveCursor(table.name, remoteRow);
  }

  return result;
}

// Pulls remote-created and remotely-updated rows in FK-safe order.
// Pulled rows are marked synced locally and therefore are not echoed back.
export async function runPull() {
  const results = [];
  for (const table of PULL_TABLES) {
    try {
      results.push(await pullTable(table));
    } catch (error) {
      results.push({ table: table.name, found: 0, pulled: 0, skipped: 0, failed: [{ error: error.message }] });
    }
  }
  return results;
}
