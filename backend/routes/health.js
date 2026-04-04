import { Router } from 'express';
import config from '../config.js';
import { getPool } from '../services/postgres.js';
import { getClient } from '../services/valkey.js';
import { embeddingHealth } from '../services/embedding.js';
import { llmHealth, isLLMConfigured } from '../services/llm.js';

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

  // Groq LLM
  if (isLLMConfigured()) {
    const groqStatus = await llmHealth();
    checks.llm = groqStatus.ok ? 'ok' : 'error';
  } else {
    checks.llm = 'not_configured';
  }

  // Core services required for healthy status (llm and embedding are optional)
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
