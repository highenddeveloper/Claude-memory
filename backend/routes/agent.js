import { Router } from 'express';
import { z } from 'zod';
import { runAgent, getTaskStatus, listTasks } from '../agent/engine.js';

const router = Router();

const runSchema = z.object({
  type: z.enum(['research', 'monitor', 'automation', 'memory']),
  input: z.string().min(1),
  options: z.object({
    timeout: z.number().int().positive().optional(),
    maxSteps: z.number().int().positive().optional(),
  }).optional(),
});

// Start an agent task
router.post('/run', async (req, res, next) => {
  try {
    const params = runSchema.parse(req.body);
    const task = await runAgent(params.type, params.input, params.options);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors });
    }
    next(err);
  }
});

// Get task status
router.get('/status/:id', async (req, res, next) => {
  try {
    const task = await getTaskStatus(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
});

// List recent tasks
router.get('/tasks', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const tasks = await listTasks(limit);
    res.json({ success: true, data: tasks });
  } catch (err) {
    next(err);
  }
});

export default router;
