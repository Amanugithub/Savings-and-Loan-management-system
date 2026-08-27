import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
  statement_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres error', err);
});

export default pool;
