import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { castVote, getVotingStatus } from '../services/vote-service.js';
import { logger } from '../services/logger.js';
import { pool } from '@cinevote/storage';
import { emitToRound, emitToGroup } from '../services/socket.js';

const router = Router();

router.post('/rounds/:roundId/votes', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      member_id: z.string().uuid(),
      proposal_id: z.string().uuid(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
      return;
    }

    const { member_id, proposal_id } = validation.data;
    const { roundId } = req.params;

    const vote = await castVote({
      round_id: roundId,
      member_id,
      proposal_id,
    });

    const status = await getVotingStatus(roundId);
    emitToRound(roundId, 'vote_cast', {
      roundId,
      votes_cast: status.votes_cast,
      total_eligible: status.total_eligible,
      voting_closed: status.voting_closed,
    });

    if (status.voting_closed) {
      const roundRow = await pool.query('SELECT group_id FROM rounds WHERE id = $1', [roundId]);
      if (roundRow.rows.length > 0) {
        const groupId = roundRow.rows[0].group_id;
        const statePayload = { roundId, groupId, new_status: 'winner_selected' };
        emitToRound(roundId, 'round_state_changed', statePayload);
        emitToGroup(groupId, 'round_state_changed', statePayload);
      }
    }

    res.status(201).json(vote);
  } catch (error) {
    logger.error('Cast vote error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not in voting state')) {
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('joined after voting started')) {
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

router.get('/rounds/:roundId/votes/status', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const memberId = req.query.memberId as string | undefined;

    const status = await getVotingStatus(roundId, memberId);
    res.json(status);
  } catch (error) {
    logger.error('Get voting status error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;