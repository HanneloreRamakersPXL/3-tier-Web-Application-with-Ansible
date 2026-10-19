import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { resumeSession } from '../services/session-service.js';
import { logger } from '../services/logger.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { rateLimitConfig } from '../config/rate-limit.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { pool } from '@cinevote/storage';

const sessionResumeSchema = z.object({
  invite_code: z
    .string()
    .min(1, 'Invite code is required'),
  member_code: z
    .string()
    .min(1, 'Member code is required. If you have lost your code, you must rejoin as a new member.'),
});

const router = Router();

const sessionRateLimiter = createRateLimiter(rateLimitConfig.sessionResume);

router.post('/', sessionRateLimiter, async (req: Request, res: Response) => {
  try {
    const validationResult = sessionResumeSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    const { invite_code, member_code } = validationResult.data;

    const result = await resumeSession(invite_code, member_code);

    res.json(result);
  } catch (error) {
    logger.error('Error resuming session', error);

    if (error instanceof Error) {
      if (error.message.includes('Invalid') || error.message.includes('not found')) {
        res.status(404).json({
          error: 'Invalid invite code or member code',
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

router.post('/by-user', requireAuth, async (req: AuthRequest, res: Response) => {
  const { invite_code } = req.body;
  if (!invite_code) {
    res.status(400).json({ error: 'invite_code is required' });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT m.id AS member_id, m.role, m.display_name,
              g.id AS group_id, g.name AS group_name, g.invite_code,
              r.id AS round_id, r.round_number, r.status AS round_status
       FROM groups g
       JOIN members m ON m.group_id = g.id AND m.user_id = $1
       LEFT JOIN rounds r ON r.group_id = g.id AND r.status::text NOT IN ('completed', 'cancelled', 'watched')
       WHERE g.invite_code = $2
       ORDER BY r.round_number DESC
       LIMIT 1`,
      [req.user!.userId, invite_code.toUpperCase()]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Group not found or you are not a member' });
      return;
    }
    const row = result.rows[0];
    res.json({
      member_id: row.member_id,
      role: row.role,
      display_name: row.display_name,
      group_id: row.group_id,
      group_name: row.group_name,
      invite_code: row.invite_code,
      current_round: row.round_id ? {
        round_id: row.round_id,
        round_number: row.round_number,
        status: row.round_status,
      } : null,
    });
  } catch (error) {
    logger.error('Error resuming session by user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
