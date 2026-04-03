import config from '../config.js';
import pino from 'pino';

const logger = pino({ level: config.logLevel });

/**
 * Client for the Rust embedding server (all-MiniLM-L6-v2).
 * Runs inside Docker — no external API calls.
 */

export async function embed(texts) {
  if (!texts?.length) return [];

  const res = await fetch(`${config.embedding.url}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(config.embedding.timeout),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Embedding server error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.vectors;
}

export async function embedSingle(text) {
  const vectors = await embed([text]);
  return vectors[0] || null;
}

export async function embeddingHealth() {
  try {
    const res = await fetch(`${config.embedding.url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
