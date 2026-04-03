import crypto from 'crypto';
import config from '../config.js';
import { cacheGet, cacheSet } from './valkey.js';

// SSRF protection: block internal/reserved networks and non-HTTP schemes
const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'postgres', 'valkey', 'searxng', 'browserless', 'qdrant', 'n8n',
  'ai-postgres', 'ai-valkey', 'ai-searxng', 'ai-browserless', 'ai-qdrant', 'ai-n8n',
  'metadata.google.internal', '169.254.169.254',
];

const BLOCKED_IP_PREFIXES = [
  '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
  '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '127.', '0.', '169.254.', 'fd', 'fe80',
];

function validateUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw Object.assign(new Error('Invalid URL'), { status: 400 });
  }

  // Only allow HTTP(S)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Only HTTP/HTTPS URLs are allowed'), { status: 400 });
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block internal hostnames
  if (BLOCKED_HOSTS.includes(hostname)) {
    throw Object.assign(new Error('URL points to a blocked internal host'), { status: 403 });
  }

  // Block internal IP ranges
  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      throw Object.assign(new Error('URL points to a private/reserved IP range'), { status: 403 });
    }
  }

  // Block ports commonly used by internal services
  const port = parsed.port ? parseInt(parsed.port, 10) : null;
  if (port && [5432, 6379, 6333, 6334, 8080, 3000].includes(port)) {
    throw Object.assign(new Error('URL targets a blocked port'), { status: 403 });
  }

  return parsed;
}

export async function browse(url, options = {}) {
  validateUrl(url);

  const cacheKey = `browse:page:${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}`;

  const cached = await cacheGet(cacheKey);
  if (cached && !options.noCache) return { ...cached, cached: true };

  const endpoint = `${config.browserless.url}/content`;
  const body = {
    url,
    gotoOptions: {
      waitUntil: 'networkidle2',
      timeout: config.browserless.timeout,
    },
    rejectResourceTypes: ['image', 'font', 'media'],
  };

  const headers = { 'Content-Type': 'application/json' };
  if (config.browserless.token) {
    headers['Authorization'] = `Bearer ${config.browserless.token}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.browserless.timeout),
  });

  if (!res.ok) throw new Error(`Browserless error: ${res.status}`);

  const html = await res.text();

  // Extract text content — strip tags for a clean summary
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, options.maxLength || 50000);

  const result = {
    url,
    contentLength: text.length,
    text,
  };

  await cacheSet(cacheKey, result, config.cache.browseTTL);
  return { ...result, cached: false };
}

export async function browseParallel(urls, options = {}) {
  const concurrency = Math.min(urls.length, config.browserless.concurrent);
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((u) => browse(u, options))
    );
    results.push(...batchResults.map((r, idx) => ({
      url: batch[idx],
      success: r.status === 'fulfilled',
      data: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason.message : null,
    })));
  }
  return results;
}
