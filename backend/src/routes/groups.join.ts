import { Router, Response } from 'express';
import { z } from 'zod';
import { joinGroup } from '../services/group-service.js';
import { logger } from '../services/logger.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const joinGroupSchema = z.object({
  invite_code: z
    .string()
    .min(1, 'Invite code is required')
    .max(20, 'Invalid invite code'),
});

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const validationResult = joinGroupSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const { invite_code } = validationResult.data;
    const username = req.user!.username;
    const userId = req.user!.userId;

    const result = await joinGroup(invite_code, username, userId);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error joining group', error);

    if (error instanceof Error) {
      if (error.message.includes('Group not found')) {
        res.status(404).json({ error: 'Invalid invite code' });
        return;
      }

      if (error.message.includes('Failed to generate unique code')) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to generate unique code. Please try again.',
        });
        return;
      }
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
