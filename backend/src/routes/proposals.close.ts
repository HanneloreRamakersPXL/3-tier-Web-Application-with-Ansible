import { Router, Response } from 'express';
import { z } from 'zod';
import { closeProposals } from '../services/proposal-service.js';
import { logger } from '../services/logger.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { emitToRound, emitToGroup } from '../services/socket.js';

const router = Router();

router.patch('/:roundId/close-proposals', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      group_id: z.string().uuid(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
      return;
    }

    const { group_id } = validation.data;
    const { roundId } = req.params;

    const round = await closeProposals(group_id, roundId, req.user!.userId);

    const statePayload = { roundId, groupId: group_id, new_status: round.status };
    emitToRound(roundId, 'round_state_changed', statePayload);
    emitToGroup(group_id, 'round_state_changed', statePayload);

    res.json(round);
  } catch (error) {
    logger.error('Close proposals error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not an admin') || message.includes('not found')) {
      res.status(403).json({ error: message });
      return;
    }

    if (message.includes('not in proposing state')) {
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('At least 2 proposals')) {
      res.status(409).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
