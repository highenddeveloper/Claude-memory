import Redis from 'ioredis';
import config from '../config.js';
import pino from 'pino';

const logger = pino({ level: config.logLevel });
let client;

export async function initValkey() {
  client = new Redis(config.redis.url, {
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    lazyConnect: true,
  });
  client.on('error', (err) => logger.error(err, 'Valkey connection error'));
  await client.connect();
  logger.info('Valkey connected');
}

export function getClient() {
  if (!client) throw new Error('Valkey not initialized');
  return client;
}

export async function cacheGet(key) {
  const val = await client.get(key);
  return val ? JSON.parse(val) : null;
}

export async function cacheSet(key, value, ttlSeconds) {
  await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key) {
  await client.del(key);
}
