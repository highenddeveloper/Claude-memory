import { Router } from 'express';
import { z } from 'zod';
import { search } from '../services/searxng.js';

const router = Router();

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  categories: z.string().optional(),
  language: z.string().optional(),
  timeRange: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const params = searchSchema.parse(req.body);
    const result = await search(params.query, params);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

export default router;
