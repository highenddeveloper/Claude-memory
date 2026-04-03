import pg from 'pg';
import config from '../config.js';
import pino from 'pino';

const logger = pino({ level: config.logLevel });
let pool;

export async function initPostgres() {
  pool = new pg.Pool(config.postgres);
  pool.on('error', (err) => logger.error(err, 'PostgreSQL pool error'));
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('PostgreSQL connected');
}

export function getPool() {
  if (!pool) throw new Error('PostgreSQL not initialized');
  return pool;
}

export async function query(text, params) {
  return pool.query(text, params);
}
