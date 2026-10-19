import { Router, Response } from 'express';
import { getGroupDashboard, getGenreStats, getGenreSuggestions } from '../services/dashboard-service.js';
import { logger } from '../services/logger.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/groups/:groupId/dashboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const dashboard = await getGroupDashboard(groupId, req.user!.userId);
    res.json(dashboard);
  } catch (error) {
    logger.error('Get dashboard error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('Access denied')) {
      res.status(403).json({ error: message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:groupId/stats/genres', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const stats = await getGenreStats(groupId);
    res.json(stats);
  } catch (error) {
    logger.error('Get genre stats error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:groupId/suggestions/genres', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const suggestions = await getGenreSuggestions(groupId);
    res.json(suggestions);
  } catch (error) {
    logger.error('Get genre suggestions error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
