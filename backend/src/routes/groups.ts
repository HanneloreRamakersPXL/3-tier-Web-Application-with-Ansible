import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '@cinevote/storage';
import { createGroup } from '../services/group-service.js';
import { logger } from '../services/logger.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { emitToGroup } from '../services/socket.js';

const createGroupSchema = z.object({
  group_name: z
    .string()
    .min(1, 'Group name is required')
    .max(255, 'Group name must be 255 characters or less')
    .trim(),
  max_members: z
    .number()
    .int()
    .min(2, 'Group must have at least 2 members')
    .max(20, 'Group can have at most 20 members'),
});

const router = Router();

router.get('/my-groups', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        g.id            AS group_id,
        g.name          AS group_name,
        g.invite_code,
        g.max_members,
        m.id            AS member_id,
        m.role,
        COUNT(m2.id)::int AS member_count,
        r.id            AS active_round_id,
        r.status        AS round_status,
        r.round_number
       FROM members m
       JOIN groups g ON g.id = m.group_id
       LEFT JOIN members m2 ON m2.group_id = g.id
       LEFT JOIN LATERAL (
         SELECT id, status, round_number
         FROM rounds
         WHERE group_id = g.id AND status::text NOT IN ('completed', 'cancelled')
         ORDER BY round_number DESC
         LIMIT 1
       ) r ON true
       WHERE m.user_id = $1
       GROUP BY g.id, g.name, g.invite_code, g.max_members,
                m.id, m.role, r.id, r.status, r.round_number
       ORDER BY g.id DESC`,
      [req.user!.userId]
    );
    res.json({ groups: result.rows });
  } catch (error) {
    logger.error('Get my groups error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const validationResult = createGroupSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const { group_name, max_members } = validationResult.data;
    const username = req.user!.username;
    const userId = req.user!.userId;

    const result = await createGroup(group_name, username, max_members, userId);

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating group', error);

    if (error instanceof Error && error.message.includes('Failed to generate unique code')) {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to generate unique code. Please try again.',
      });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:groupId/my-member', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT id, role FROM members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user!.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not a member of this group' });
      return;
    }
    res.json({ member_id: result.rows[0].id, role: result.rows[0].role });
  } catch (error) {
    logger.error('Get my-member error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:groupId/members', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const result = await pool.query(
      `SELECT COUNT(m.id)::int AS count, g.max_members
       FROM groups g
       LEFT JOIN members m ON m.group_id = g.id
       WHERE g.id = $1
       GROUP BY g.max_members`,
      [groupId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    res.json({ count: result.rows[0].count, max_members: result.rows[0].max_members });
  } catch (error) {
    logger.error('Error fetching member count', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:groupId/members/list', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const check = await pool.query(
      `SELECT id FROM members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user!.userId]
    );
    if (check.rows.length === 0) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }
    const result = await pool.query(
      `SELECT m.id, m.display_name, m.role, m.joined_at
       FROM members m
       WHERE m.group_id = $1
       ORDER BY CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END, m.joined_at ASC`,
      [groupId]
    );
    res.json({ members: result.rows });
  } catch (error) {
    logger.error('Get members list error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:groupId/rounds', requireAuth, async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { groupId } = req.params;

    await client.query('BEGIN');

    const memberResult = await client.query(
      `SELECT role FROM members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user!.userId]
    );
    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }
    if (memberResult.rows[0].role !== 'admin') {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Only admins can start a new round' });
      return;
    }

    const activeResult = await client.query(
      `SELECT id FROM rounds
       WHERE group_id = $1
         AND status::text NOT IN ('completed', 'cancelled', 'watched')
         AND watched_at IS NULL
       LIMIT 1`,
      [groupId]
    );
    if (activeResult.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'A round is still in progress', active_round_id: activeResult.rows[0].id });
      return;
    }

    const maxResult = await client.query(
      `SELECT COALESCE(MAX(round_number), 0) AS max_round FROM rounds WHERE group_id = $1`,
      [groupId]
    );
    const nextNumber = maxResult.rows[0].max_round + 1;

    const roundResult = await client.query(
      `INSERT INTO rounds (group_id, round_number, status) VALUES ($1, $2, 'proposing') RETURNING id, round_number, status`,
      [groupId, nextNumber]
    );

    await client.query('COMMIT');

    logger.info('New round started', { groupId, roundNumber: nextNumber });

    emitToGroup(groupId, 'round_started', { groupId, roundId: roundResult.rows[0].id });

    res.status(201).json(roundResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Start new round error', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.delete('/:groupId', requireAuth, async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { groupId } = req.params;

    await client.query('BEGIN');

    const memberResult = await client.query(
      `SELECT role FROM members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user!.userId]
    );
    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }
    if (memberResult.rows[0].role !== 'admin') {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Only admins can delete groups' });
      return;
    }

    // state_transition_log has ON DELETE NO ACTION — delete it first before rounds cascade
    await client.query(
      `DELETE FROM state_transition_log
       WHERE round_id IN (SELECT id FROM rounds WHERE group_id = $1)`,
      [groupId]
    );

    await client.query('DELETE FROM groups WHERE id = $1', [groupId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete group error', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
