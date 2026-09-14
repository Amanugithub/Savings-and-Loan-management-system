// Snapshots local.db before a migration or release. Uses better-sqlite3's
// .backup() API rather than copying the file directly — a plain file copy
// can capture a half-written page while WAL mode is active; .backup() is
// SQLite's own online-backup API and is safe to run against a live,
// in-use database.
//
// Usage: node src/db/backup-local.js [destination-directory]
// Defaults to backend/backups/.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, '../../backups');

fs.mkdirSync(destDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destPath = path.join(destDir, `local-${timestamp}.db`);

await db.backup(destPath);

const { size } = fs.statSync(destPath);
console.log(`Backed up local.db to ${destPath} (${(size / 1024).toFixed(1)} KB).`);
