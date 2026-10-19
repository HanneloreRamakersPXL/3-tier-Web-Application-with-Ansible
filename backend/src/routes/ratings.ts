import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { rateProposal, getProposalRatings } from '../services/rating-service.js';
import { logger } from '../services/logger.js';

const router = Router();

// Rate a proposal
router.post('/proposals/:proposalId/rating', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      member_id: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
      return;
    }

    const { member_id, rating } = validation.data;
    const { proposalId } = req.params;

    const result = await rateProposal({
      proposal_id: proposalId,
      member_id,
      rating,
    });

    res.json(result);
  } catch (error) {
    logger.error('Rate proposal error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('can only rate proposals from your group')) {
      res.status(403).json({ error: message });
      return;
    }

    if (message.includes('must be between')) {
      res.status(400).json({ error: message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get proposal ratings
router.get('/proposals/:proposalId/ratings', async (req: Request, res: Response) => {
  try {
    const { proposalId } = req.params;
    const memberId = req.query.memberId as string | undefined;

    const proposal = await getProposalRatings(proposalId, memberId);
    res.json(proposal);
  } catch (error) {
    logger.error('Get proposal ratings error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
