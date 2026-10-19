import { Router, Request, Response } from 'express';
import { pool } from '@cinevote/storage';
import { logger } from '../services/logger.js';

const router = Router();

router.get('/rounds/:roundId', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;

    const result = await pool.query(
      `SELECT id, group_id, round_number, status, created_at,
              voting_started_at, winning_proposal_id, watched_at
       FROM rounds WHERE id = $1`,
      [roundId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Round not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get round error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
