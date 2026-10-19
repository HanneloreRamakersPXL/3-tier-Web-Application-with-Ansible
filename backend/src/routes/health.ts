import { Router, Request, Response } from 'express';
import { pool, checkDatabaseHealth } from '@cinevote/storage';
import { logger } from '../services/logger.js';

const router = Router();

const serverStartTime = Date.now();

router.get('/', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await checkDatabaseHealth();

    const response = {
      status: 'ok',
      db: dbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
    };

    if (process.env.NODE_ENV === 'development') {
      logger.debug('Health check performed', { db: response.db });
    }

    if (!dbHealthy) {
      res.status(503).json(response);
      return;
    }

    res.json(response);
  } catch (error) {
    logger.error('Health check error', error);

    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      error: 'Health check failed',
    });
  }
});

router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await checkDatabaseHealth();
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };

    res.json({
      status: 'ok',
      db: dbHealthy ? 'connected' : 'disconnected',
      pool: poolStats,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    });
  } catch (error) {
    res.status(503).json({ error: 'Health check failed' });
  }
});

export default router;
