import { Router } from 'express';
import config from '../config.js';
import { getPool } from '../services/postgres.js';
import { getClient } from '../services/valkey.js';
import { embeddingHealth } from '../services/embedding.js';

const router = Router();

async function checkService(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

router.get('/', async (req, res) => {
  const checks = {};

  // PostgreSQL
  try {
    await getPool().query('SELECT 1');
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'error';
  }

  // Valkey
  try {
    await getClient().ping();
    checks.valkey = 'ok';
  } catch {
    checks.valkey = 'error';
  }

  // Qdrant
  checks.qdrant = await checkService(`${config.qdrant.url}/readyz`);

  // Rust embedding server
  checks.embedding = (await embeddingHealth()) ? 'ok' : 'error';

  // Core services required for healthy status (embedding is optional)
  const coreChecks = ['postgres', 'valkey', 'qdrant'];
  const allOk = coreChecks.every((k) => checks[k] === 'ok');

  res.status(allOk ? 200 : 503).json({
    success: allOk,
    data: {
      status: allOk ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      checks,
    },
  });
});

export default router;
