import db from '../config/sqlite.js';
import pool from '../config/postgres.js';

// Order matters: a child row (e.g. a loan) references a parent row
// (a member) via foreign key. If we tried to push loans before their
// member exists on the remote side, the insert would fail. Parents
// first, children after.
const SYNC_TABLES = [
  {
    name: 'administrators',
    columns: ['id', 'name', 'username', 'password_hash', 'status', 'created_at'],
  },
  {
    name: 'members',
    columns: [
      'id', 'name', 'gender', 'address', 'age', 'heir_info', 'id_card_number',
      'phone_number', 'password_hash', 'date_joined', 'status', 'created_at', 'updated_at',
    ],
  },
  {
    name: 'loans',
    columns: [
      'id', 'member_id', 'guarantor_member_id', 'type', 'principal_amount', 'term_years',
      'interest_rate', 'monthly_installment', 'monthly_interest_amount', 'insurance_amount',
      'collateral_type', 'disbursement_date', 'status', 'created_at',
    ],
  },
  {
    name: 'transactions',
    // fiscal_year / fiscal_month are excluded on purpose — they're
    // GENERATED ALWAYS columns on both sides. Postgres computes its own
    // from `date`; sending SQLite's precomputed values would fail
    // (a generated column can't be assigned directly).
    columns: ['id', 'member_id', 'loan_id', 'recorded_by', 'type', 'amount', 'date', 'notes', 'created_at'],
  },
  {
    name: 'expenses',
    columns: ['id', 'category', 'description', 'amount', 'date', 'recorded_by', 'created_at'],
  },
  {
    name: 'dividend_history',
    columns: ['id', 'member_id', 'fiscal_year', 'savings_dividend', 'share_dividend', 'date_calculated'],
  },
  {
    name: 'member_exits',
    columns: [
      'id', 'member_id', 'exit_date', 'savings_returned', 'shares_returned',
      'dividend_owed', 'government_withholding', 'net_amount_paid',
    ],
  },
  {
    name: 'notifications',
    columns: ['id', 'member_id', 'loan_id', 'title', 'message', 'type', 'is_read', 'created_at'],
    // SQLite has no boolean type -- is_read is stored as 0/1. Postgres's
    // column is a real BOOLEAN, so it needs an explicit conversion.
    coerce: (row) => ({ ...row, is_read: Boolean(row.is_read) }),
  },
];

async function pushTable({ name, columns, coerce }) {
  const unsyncedRows = db.prepare(`SELECT * FROM ${name} WHERE synced_at IS NULL`).all();

  const result = { table: name, found: unsyncedRows.length, pushed: 0, failed: [] };
  if (unsyncedRows.length === 0) return result;

  const markSynced = db.prepare(`UPDATE ${name} SET synced_at = datetime('now') WHERE id = ?`);

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = columns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');

  // ON CONFLICT DO UPDATE (not DO NOTHING): a row can be pushed once,
  // edited locally later (which resets synced_at to NULL), and needs
  // to overwrite the remote copy on its second push. Local is the
  // source of truth for money data, so "last local push wins" is correct.
  const sql = `
    INSERT INTO ${name} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (id) DO UPDATE SET ${updateSet}
  `;

  for (const rawRow of unsyncedRows) {
    const row = coerce ? coerce(rawRow) : rawRow;
    const values = columns.map((c) => row[c] ?? null);

    try {
      await pool.query(sql, values);
      markSynced.run(row.id);
      result.pushed++;
    } catch (err) {
      // One bad row (e.g. a stale FK reference) shouldn't block the
      // rest of the batch -- record it and keep going.
      result.failed.push({ id: row.id, error: err.message });
    }
  }

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