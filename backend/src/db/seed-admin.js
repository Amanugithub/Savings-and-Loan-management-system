// Run this ONCE to create your first administrator account, since
// POST /api/administrators requires being logged in as an admin
// already — this script is how you get the very first one.
//
// Usage: node src/db/seed-admin.js <name> <username> <password>

import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from '../config/sqlite.js';

const [, , name, username, password] = process.argv;

if (!name || !username || !password) {
  console.error('Usage: node src/db/seed-admin.js "<name>" <username> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM administrators WHERE username = ?').get(username);
if (existing) {
  console.error(`Username "${username}" already exists.`);
  process.exit(1);
}

const password_hash = await bcrypt.hash(password, 10);
const id = randomUUID();

db.prepare(
  `INSERT INTO administrators (id, name, username, password_hash, synced_at)
   VALUES (?, ?, ?, ?, NULL)`
).run(id, name, username, password_hash);

console.log(`Created admin "${username}" (id: ${id}).`);
