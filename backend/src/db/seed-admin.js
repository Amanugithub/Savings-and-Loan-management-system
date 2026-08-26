// Run this ONCE to create your first administrator account, since
// POST /api/administrators requires being logged in as an admin
// already — this script is how you get the very first one.
//
// Usage: node src/db/seed-admin.js <name> <username> <password>

import bcrypt from 'bcrypt';
import db from '../config/sqlite.js';

// seed.sql records every imported transaction against this administrator.
const seedAdministratorId = '8469f799-0d87-44b4-84e9-b18f6a443ba3';

const [, , name, username, password] = process.argv;

if (!name || !username || !password) {
  console.error('Usage: node src/db/seed-admin.js "<name>" <username> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = db
  .prepare('SELECT id, username FROM administrators WHERE username = ?')
  .get(username);
if (existing) {
  if (existing.id === seedAdministratorId) {
    console.log(`Administrator "${username}" already exists (id: ${seedAdministratorId}).`);
    process.exit(0);
  }

  console.error(`Username "${username}" already exists with a different id.`);
  process.exit(1);
}

const existingSeedAdministrator = db
  .prepare('SELECT username FROM administrators WHERE id = ?')
  .get(seedAdministratorId);
if (existingSeedAdministrator) {
  console.error(
    `The required seed administrator id is already assigned to username "${existingSeedAdministrator.username}".`
  );
  process.exit(1);
}

const password_hash = await bcrypt.hash(password, 10);

db.prepare(
  `INSERT INTO administrators (id, name, username, password_hash, synced_at)
   VALUES (?, ?, ?, ?, NULL)`
).run(seedAdministratorId, name, username, password_hash);

console.log(`Created admin "${username}" (id: ${seedAdministratorId}).`);
