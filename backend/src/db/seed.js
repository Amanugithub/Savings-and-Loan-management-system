import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, 'data/seed.sql');
const seedSql = fs.readFileSync(seedPath, 'utf8');

// seed.sql records every transaction against this administrator. The row
// must exist before the SQL is executed because transactions.recorded_by is
// a required foreign key.
const seedAdministratorId = '8469f799-0d87-44b4-84e9-b18f6a443ba3';
const administrator = db
  .prepare('SELECT id FROM administrators WHERE id = ?')
  .get(seedAdministratorId);

if (!administrator) {
  console.error(
    `Cannot run ${path.basename(seedPath)}: administrator ${seedAdministratorId} does not exist. ` +
      'Create that administrator first, then run npm run seed:local again.'
  );
  process.exit(1);
}

try {
  db.exec(seedSql);
} catch (error) {
  console.error(`Failed to execute ${path.basename(seedPath)}.`);
  console.error(error.message);
  process.exit(1);
}

const memberCount = db.prepare('SELECT COUNT(*) AS count FROM members').get().count;
const transactionCount = db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;

console.log(
  `Executed ${path.basename(seedPath)}: ${memberCount} member(s), ${transactionCount} transaction(s).`
);
