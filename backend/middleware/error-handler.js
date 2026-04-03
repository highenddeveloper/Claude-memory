import { z } from 'zod';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export function errorHandler(err, req, res, _next) {
  // Zod validation errors — always safe to expose details
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  const status = err.status || err.statusCode || 500;
  const isOperational = status < 500;

  // Log server errors with full context; skip expected client errors
  if (!isOperational) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  }

  res.status(status).json({
    success: false,
    error: isOperational || process.env.NODE_ENV !== 'production'
      ? err.message
      : 'Internal server error',
  });
}
