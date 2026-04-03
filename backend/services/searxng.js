import crypto from 'crypto';
import config from '../config.js';
import { cacheGet, cacheSet } from './valkey.js';

export async function search(queryText, options = {}) {
  const cacheKey = `search:web:${crypto.createHash('sha256').update(queryText).digest('hex').slice(0, 32)}`;

  // Cache-aside: check first
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams({
    q: queryText,
    format: 'json',
    categories: options.categories || 'general',
    language: options.language || 'en',
    time_range: options.timeRange || '',
    safesearch: '1',
  });

  const res = await fetch(`${config.searxng.url}/search?${params}`, {
    signal: AbortSignal.timeout(config.searxng.timeout),
  });

  if (!res.ok) throw new Error(`SearXNG error: ${res.status}`);

  const data = await res.json();
  const result = {
    query: queryText,
    results: (data.results || []).slice(0, options.maxResults || 10).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      engine: r.engine,
    })),
    infoboxes: data.infoboxes || [],
  };

  await cacheSet(cacheKey, result, config.cache.searchTTL);
  return { ...result, cached: false };
}
