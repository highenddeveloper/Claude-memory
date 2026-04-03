import { Router } from 'express';
import { z } from 'zod';
import { browse, browseParallel } from '../services/browserless.js';

const router = Router();

const browseSchema = z.object({
  url: z.string().url(),
  maxLength: z.number().int().positive().optional(),
  noCache: z.boolean().optional(),
});

const browseMultiSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
  maxLength: z.number().int().positive().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const params = browseSchema.parse(req.body);
    const result = await browse(params.url, params);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

router.post('/multi', async (req, res, next) => {
  try {
    const params = browseMultiSchema.parse(req.body);
    const results = await browseParallel(params.urls, params);
    res.json({ success: true, data: results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

export default router;
