import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations/sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const applied = new Set(
  db.prepare('SELECT filename FROM schema_migrations').all().map((r) => r.filename)
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let ranCount = 0;

for (const file of files) {
  if (applied.has(file)) continue;

  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  console.log(`Applying ${file}...`);

  const runMigration = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
  });

  runMigration();
  ranCount++;
}

console.log(ranCount > 0 ? `Applied ${ranCount} migration(s).` : 'No new migrations to apply.');
