import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import pino from 'pino';
import config from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import healthRoutes from './routes/health.js';
import searchRoutes from './routes/search.js';
import browseRoutes from './routes/browse.js';
import memoryRoutes from './routes/memory.js';
import agentRoutes from './routes/agent.js';
import workflowRoutes from './routes/workflow.js';
import dashboardRoutes from './routes/dashboard.js';
import { initPostgres, getPool } from './services/postgres.js';
import { initValkey, getClient } from './services/valkey.js';

const logger = pino({ level: config.logLevel });

const app = express();

// --- Security ---
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for dashboard
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// --- Health + Dashboard (no auth) ---
app.use('/health', healthRoutes);
app.use('/dashboard', dashboardRoutes);

// --- Rate limit + Auth for all other routes ---
app.use(createRateLimiter());
app.use(authMiddleware);

// --- Routes ---
app.use('/search', searchRoutes);
app.use('/browse', browseRoutes);
app.use('/memory', memoryRoutes);
app.use('/agent', agentRoutes);
app.use('/workflow', workflowRoutes);

// --- Error handler ---
app.use(errorHandler);

// --- Start ---
let server;

async function start() {
  await initPostgres();
  await initValkey();
  server = app.listen(config.port, '0.0.0.0', () => {
    logger.info(`Backend running on port ${config.port} [${config.nodeEnv}]`);
  });
}

// --- Graceful Shutdown ---
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received, draining connections...');

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // Drain database pool
  try {
    const pool = getPool();
    await pool.end();
    logger.info('PostgreSQL pool drained');
  } catch { /* pool may not be initialized */ }

  // Disconnect Valkey
  try {
    const valkey = getClient();
    await valkey.quit();
    logger.info('Valkey disconnected');
  } catch { /* client may not be initialized */ }

  // Force exit after 10s if drain stalls
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal(err, 'Failed to start server');
  process.exit(1);
});

export default app;
