import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.js';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const status = typeof err.status === 'number' ? err.status
    : typeof err.statusCode === 'number' ? err.statusCode
    : 500;

  if (status >= 400 && status < 500) {
    res.status(status).json({
      error: err.message || 'Bad request',
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
