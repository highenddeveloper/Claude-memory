import { Router } from 'express';
import { z } from 'zod';
import { triggerWebhook } from '../services/n8n.js';

const router = Router();

const triggerSchema = z.object({
  webhook: z.string().min(1),
  payload: z.record(z.any()).optional(),
});

router.post('/trigger', async (req, res, next) => {
  try {
    const params = triggerSchema.parse(req.body);
    const result = await triggerWebhook(params.webhook, params.payload || {});
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

export default router;
