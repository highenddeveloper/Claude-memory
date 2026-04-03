import config from '../config.js';
import pino from 'pino';

const logger = pino({ level: config.logLevel });

async function qdrantFetch(path, options = {}) {
  const res = await fetch(`${config.qdrant.url}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function ensureCollection() {
  try {
    await qdrantFetch(`/collections/${config.qdrant.collectionName}`);
  } catch {
    await qdrantFetch(`/collections/${config.qdrant.collectionName}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: config.qdrant.vectorSize,
          distance: 'Cosine',
        },
      }),
    });
    logger.info(`Created Qdrant collection: ${config.qdrant.collectionName}`);
  }
}

export async function upsertVectors(points) {
  return qdrantFetch(`/collections/${config.qdrant.collectionName}/points`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  });
}

export async function searchVectors(vector, limit = 5, filter = {}) {
  return qdrantFetch(`/collections/${config.qdrant.collectionName}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      filter: Object.keys(filter).length ? filter : undefined,
    }),
  });
}

export async function deleteVectors(ids) {
  return qdrantFetch(`/collections/${config.qdrant.collectionName}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({ points: ids }),
  });
}
