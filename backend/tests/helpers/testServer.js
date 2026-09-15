import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '../..');
const tmpDir = path.join(backendRoot, '.tmp');
const masterSqlPath = path.join(backendRoot, 'src/db/migrations/sqlite/master.sql');

/**
 * Boots an isolated instance of the backend for one test file: a fresh
 * on-disk SQLite database (built straight from master.sql, independent of
 * migrate-local.js's incremental-file logic — that has its own dedicated
 * test) and the real Express app listening on an ephemeral port. Every
 * test file gets its own database and port, so files can run concurrently
 * without seeing each other's data.
 */
export async function startTestServer() {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `test-${randomUUID()}.db`);

  process.env.LOCAL_DB_PATH = dbPath;
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
  process.env.DATABASE_URL = process.env.DATABASE_URL || '';

  // Dynamic imports: config/sqlite.js opens its connection using
  // LOCAL_DB_PATH at import time, so the env vars above must be set first.
  const { default: db } = await import('../../src/config/sqlite.js');
  db.exec(fs.readFileSync(masterSqlPath, 'utf8'));

  const { default: app } = await import('../../src/app.js');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, urlPath, { token, body } = {}) {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { status: res.status, body: json };
  }

  const ROLES = [
    'chairperson',
    'vice_chairperson',
    'loan_committee',
    'cashier',
    'accountant',
    'general_manager',
    'control_audit_committee',
  ];

  async function seedAdmin({ name = 'Test Admin', username, password = 'testpass123', role }) {
    const password_hash = await bcrypt.hash(password, 4); // low cost factor: tests only
    const id = randomUUID();
    db.prepare(
      `INSERT INTO administrators (id, name, username, password_hash, role, synced_at) VALUES (?, ?, ?, ?, ?, NULL)`
    ).run(id, name, username, password_hash, role);
    return { id, username, password, role };
  }

  async function seedAllRoles(usernamePrefix = 'u') {
    const admins = {};
    for (const role of ROLES) {
      const username = `${usernamePrefix}_${role}`;
      admins[role] = await seedAdmin({ username, role });
    }
    return admins;
  }

  async function login(username, password = 'testpass123') {
    const res = await request('POST', '/api/auth/login', { body: { username, password } });
    if (res.status !== 200) throw new Error(`login failed for ${username}: ${JSON.stringify(res.body)}`);
    return res.body.token;
  }

  function seedMember({ name = 'Test Member', gender = 'male', phone_number, dateJoined } = {}) {
    const id = randomUUID();
    const phone = phone_number ?? `09${Math.floor(10000000 + Math.random() * 89999999)}`;
    db.prepare(
      `INSERT INTO members (id, name, gender, phone_number, date_joined, status, synced_at) VALUES (?, ?, ?, ?, ?, 'active', NULL)`
    ).run(id, name, gender, phone, dateJoined ?? new Date().toISOString().slice(0, 10));
    return id;
  }

  function grantShares(memberId, amount, recordedBy) {
    db.prepare(
      `INSERT INTO transactions (id, member_id, recorded_by, type, amount, date, synced_at)
       VALUES (?, ?, ?, 'opening_share_balance', ?, date('now'), NULL)`
    ).run(randomUUID(), memberId, recordedBy, amount);
  }

  function grantSavings(memberId, amount, recordedBy) {
    db.prepare(
      `INSERT INTO transactions (id, member_id, recorded_by, type, amount, date, synced_at)
       VALUES (?, ?, ?, 'opening_savings_balance', ?, date('now'), NULL)`
    ).run(randomUUID(), memberId, recordedBy, amount);
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true });
    }
  }

  return {
    baseUrl,
    db,
    request,
    seedAdmin,
    seedAllRoles,
    seedMember,
    grantShares,
    grantSavings,
    login,
    close,
    ROLES,
  };
}
