const env = process.env;

export default {
  port: parseInt(env.PORT || '3001', 10),
  nodeEnv: env.NODE_ENV || 'development',
  apiKey: env.API_KEY || '',
  logLevel: env.LOG_LEVEL || 'info',

  searxng: {
    url: env.SEARXNG_URL || 'http://localhost:8080',
    timeout: 15000,
  },

  browserless: {
    url: env.BROWSERLESS_URL || 'http://localhost:3000',
    token: env.BROWSERLESS_TOKEN || '',
    timeout: 60000,
    concurrent: 5,
  },

  postgres: {
    connectionString: env.POSTGRES_URL || 'postgres://ai:ai@localhost:5432/ai',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  redis: {
    url: env.REDIS_URL || 'redis://localhost:6379',
    maxRetriesPerRequest: 3,
  },

  qdrant: {
    url: env.QDRANT_URL || 'http://localhost:6333',
    collectionName: 'memory_vectors',
    vectorSize: 384,
  },

  n8n: {
    url: env.N8N_URL || 'http://localhost:5678',
    webhookUrl: env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
  },

  embedding: {
    url: env.EMBEDDING_URL || 'http://localhost:8000',
    timeout: 15000,
  },

  monitor: {
    url: env.MONITOR_URL || 'http://localhost:8001',
  },

  agent: {
    maxConcurrency: parseInt(env.AGENT_MAX_CONCURRENCY || '3', 10),
    timeoutMs: parseInt(env.AGENT_TIMEOUT_MS || '300000', 10),
    stepTimeoutMs: 60000,
    maxRetries: 1,
  },

  cache: {
    searchTTL: 3600,       // 1 hour
    browseTTL: 86400,      // 24 hours
    agentContextTTL: 7200, // 2 hours
  },
};
