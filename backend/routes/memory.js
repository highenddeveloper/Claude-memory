import { Router } from 'express';
import { z } from 'zod';
import { query } from '../services/postgres.js';
import { embed, embedSingle } from '../services/embedding.js';
import config from '../config.js';

const router = Router();

const storeSchema = z.object({
  content: z.string().min(1).max(100000),
  summary: z.string().max(1000).optional(),
  metadata: z.record(z.any()).optional(),
  sourceUrl: z.string().url().optional(),
});

const searchMemorySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

// Store memory (+ generate embedding for vector search)
router.post('/', async (req, res, next) => {
  try {
    const params = storeSchema.parse(req.body);
    const result = await query(
      `INSERT INTO memory_entries (content, summary, metadata, source_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [params.content, params.summary || null, params.metadata || {}, params.sourceUrl || null]
    );
    const entry = result.rows[0];

    // Best-effort: embed and store vector in Qdrant
    try {
      const vector = await embedSingle(params.content.slice(0, 8000));
      if (vector) {
        await fetch(`${config.qdrant.url}/collections/${config.qdrant.collectionName}/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{ id: entry.id, vector, payload: { summary: params.summary || '', source_url: params.sourceUrl || '' } }],
          }),
          signal: AbortSignal.timeout(5000),
        });
      }
    } catch { /* vector store is best-effort */ }

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

// Search memory (full-text search using tsvector index)
router.get('/search', async (req, res, next) => {
  try {
    const params = searchMemorySchema.parse({
      query: req.query.q,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    });
    const result = await query(
      `SELECT id, content, summary, metadata, source_url, created_at,
             ts_rank(to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, '')),
                     websearch_to_tsquery('english', $1)) AS rank
       FROM memory_entries
       WHERE to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, ''))
             @@ websearch_to_tsquery('english', $1)
       ORDER BY rank DESC, created_at DESC
       LIMIT $2`,
      [params.query, params.limit || 10]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

// Get single memory entry
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM memory_entries WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Vector-based semantic search via Rust embedding server + Qdrant
router.post('/vector-search', async (req, res, next) => {
  try {
    const params = searchMemorySchema.parse(req.body);
    const vector = await embedSingle(params.query);
    if (!vector) {
      return res.status(503).json({ success: false, error: 'Embedding service unavailable' });
    }

    const qdrantRes = await fetch(
      `${config.qdrant.url}/collections/${config.qdrant.collectionName}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector,
          limit: params.limit || 10,
          with_payload: true,
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!qdrantRes.ok) {
      return res.status(503).json({ success: false, error: 'Vector search failed' });
    }

    const qdrantData = await qdrantRes.json();
    const ids = (qdrantData.result || []).map((r) => r.id);

    if (!ids.length) {
      return res.json({ success: true, data: [] });
    }

    // Fetch full entries from PostgreSQL
    const result = await query(
      `SELECT * FROM memory_entries WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    // Preserve Qdrant score ordering
    const scoreMap = new Map((qdrantData.result || []).map((r) => [r.id, r.score]));
    const rows = result.rows
      .map((r) => ({ ...r, similarity: scoreMap.get(r.id) || 0 }))
      .sort((a, b) => b.similarity - a.similarity);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Delete memory entry
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM memory_entries WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, data: { deleted: result.rows[0].id } });
  } catch (err) {
    next(err);
  }
});

export default router;
