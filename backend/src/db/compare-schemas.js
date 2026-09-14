// Diffs the table/column shape of migrations/sqlite/master.sql against
// migrations/postgres/master.sql. The two are maintained by hand as
// parallel files (see #40) — nothing enforces they stay in sync, so this
// is a static, no-database-connection-needed check that catches drift
// (a column added to one and forgotten in the other) before it surfaces
// as a sync failure in production.
//
// This is deliberately a simple regex parse, not a real SQL parser: it's
// good enough for the CREATE TABLE / column-name shape these two files
// actually use, and has no dependency to install.
//
// Usage: node src/db/compare-schemas.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = path.join(__dirname, 'migrations/sqlite/master.sql');
const postgresPath = path.join(__dirname, 'migrations/postgres/master.sql');

function parseTables(sql) {
  const tables = new Map();
  const tableRegex = /CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g;
  let match;
  while ((match = tableRegex.exec(sql))) {
    const [, tableName, body] = match;
    const columns = new Set();
    // A new column/constraint definition only starts at paren depth 0 (the
    // table's own parens). Generated columns wrap a CASE...END expression
    // in its own nested (...) — e.g. fiscal_year's "GENERATED ALWAYS AS
    // (CASE WHEN ... END) STORED" — whose inner lines must NOT be read as
    // sibling column definitions.
    let depth = 0;
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const opens = (line.match(/\(/g) || []).length;
      const closes = (line.match(/\)/g) || []).length;

      if (depth === 0) {
        const trimmed = line.replace(/,$/, '');
        if (!/^(CHECK|UNIQUE|CONSTRAINT|FOREIGN KEY|PRIMARY KEY)\b/i.test(trimmed)) {
          const columnMatch = trimmed.match(/^(\w+)\s/);
          if (columnMatch) columns.add(columnMatch[1]);
        }
      }

      depth += opens - closes;
    }
    tables.set(tableName, columns);
  }
  return tables;
}

const sqliteTables = parseTables(fs.readFileSync(sqlitePath, 'utf8'));
const postgresTables = parseTables(fs.readFileSync(postgresPath, 'utf8'));

// Local-only sync bookkeeping — these track the SQLite→Postgres push/pull
// cursor itself and have no reason to exist on the Postgres side.
const SQLITE_ONLY_TABLES = new Set(['sync_id_map', 'sync_state']);

const allTableNames = new Set([...sqliteTables.keys(), ...postgresTables.keys()]);
let anyMismatch = false;

console.log('\n=== SQLITE vs POSTGRES SCHEMA COMPARISON ===\n');

for (const table of [...allTableNames].sort()) {
  if (SQLITE_ONLY_TABLES.has(table)) { console.log(`PASS  ${table} (SQLite-only sync bookkeeping, expected)`); continue; }

  const sqliteColumns = sqliteTables.get(table);
  const postgresColumns = postgresTables.get(table);

  if (!sqliteColumns) { console.log(`FAIL  ${table}: present in Postgres, missing from SQLite`); anyMismatch = true; continue; }
  if (!postgresColumns) { console.log(`FAIL  ${table}: present in SQLite, missing from Postgres`); anyMismatch = true; continue; }

  // synced_at is deliberately SQLite-only (it's local sync-tracking state
  // with no Postgres equivalent — see backend/src/sync/PushToRemote.js).
  const onlyInSqlite = [...sqliteColumns].filter((c) => !postgresColumns.has(c) && c !== 'synced_at');
  const onlyInPostgres = [...postgresColumns].filter((c) => !sqliteColumns.has(c));

  if (onlyInSqlite.length === 0 && onlyInPostgres.length === 0) {
    console.log(`PASS  ${table}`);
    continue;
  }

  anyMismatch = true;
  console.log(`FAIL  ${table}`);
  if (onlyInSqlite.length) console.log(`        SQLite-only columns: ${onlyInSqlite.join(', ')}`);
  if (onlyInPostgres.length) console.log(`        Postgres-only columns: ${onlyInPostgres.join(', ')}`);
}

console.log(`\n${anyMismatch ? 'Schema drift found — review before releasing.' : 'Schemas match.'}\n`);
process.exitCode = anyMismatch ? 1 : 0;
