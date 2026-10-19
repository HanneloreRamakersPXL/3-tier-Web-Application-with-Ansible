import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { transitionRound, getAvailableTransitions, checkAutoTransition } from '../services/state-machine.js';
import { logger } from '../services/logger.js';
import { emitToRound, emitToGroup } from '../services/socket.js';

const router = Router();

router.post('/rounds/:roundId/transition', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      target_state: z.enum(['proposing', 'voting', 'winner_selected', 'completed', 'cancelled']),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
      return;
    }

    const { target_state } = validation.data;
    const { roundId } = req.params;
    const actorId = req.headers['x-actor-id'] as string;

    if (!actorId) {
      res.status(401).json({ error: 'Actor ID required' });
      return;
    }

    const round = await transitionRound(roundId, target_state, actorId);

    const statePayload = { roundId, groupId: round.group_id, new_status: round.status };
    emitToRound(roundId, 'round_state_changed', statePayload);
    emitToGroup(round.group_id, 'round_state_changed', statePayload);

    res.json(round);
  } catch (error) {
    logger.error('Transition round error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('Invalid transition')) {
      res.status(400).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rounds/:roundId/transitions', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const transitions = await getAvailableTransitions(roundId);
    res.json({ available_transitions: transitions });
  } catch (error) {
    logger.error('Get transitions error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/rounds/:roundId/check-auto-transition', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const transitioned = await checkAutoTransition(roundId);
    res.json({ auto_transitioned: transitioned });
  } catch (error) {
    logger.error('Auto transition check error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;