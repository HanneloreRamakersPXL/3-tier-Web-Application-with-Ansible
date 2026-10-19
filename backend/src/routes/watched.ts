import { Router, Response } from 'express';
import { pool } from '@cinevote/storage';
import { logger } from '../services/logger.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { emitToRound, emitToGroup } from '../services/socket.js';

const router = Router();

// PATCH /rounds/:roundId/mark-watched — any member of the group can mark the winner as watched
router.patch('/rounds/:roundId/mark-watched', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { roundId } = req.params;

    const roundResult = await pool.query(
      `SELECT r.id, r.group_id, r.status, r.winning_proposal_id, r.watched_at
       FROM rounds r WHERE r.id = $1`,
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      res.status(404).json({ error: 'Round not found' });
      return;
    }

    const round = roundResult.rows[0];

    if (
      round.status !== 'winner_selected' &&
      round.status !== 'completed' &&
      round.status !== 'watched'
    ) {
      res.status(409).json({ error: 'Round does not have a winner yet' });
      return;
    }

    if (!round.winning_proposal_id) {
      res.status(409).json({ error: 'No winner selected for this round' });
      return;
    }

    // Verify caller is a member of this group
    const memberResult = await pool.query(
      `SELECT id FROM members WHERE group_id = $1 AND user_id = $2`,
      [round.group_id, req.user!.userId]
    );

    if (memberResult.rows.length === 0) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const updated = await pool.query(
      `UPDATE rounds SET watched_at = NOW(), status = 'watched' WHERE id = $1 RETURNING id, status, watched_at`,
      [roundId]
    );

    await pool.query(
      `INSERT INTO state_transition_log (round_id, from_state, to_state, actor_id)
       VALUES ($1, $2, 'watched', $3)`,
      [roundId, round.status, req.user!.userId]
    );

    logger.info('Round marked as watched', { roundId });

    const payload = {
      roundId,
      groupId: round.group_id,
      new_status: 'watched',
      watched_at: updated.rows[0].watched_at,
    };
    emitToRound(roundId, 'round_state_changed', payload);
    emitToGroup(round.group_id, 'round_state_changed', payload);

    res.json({ id: updated.rows[0].id, status: updated.rows[0].status, watched_at: updated.rows[0].watched_at });
  } catch (error) {
    logger.error('Mark watched error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /me/profile — current user's watched movies across all their groups
router.get('/me/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const watchedResult = await pool.query(
      `SELECT r.id AS round_id, r.round_number, r.watched_at,
              g.id AS group_id, g.name AS group_name,
              mem.id AS member_id,
              p.id AS proposal_id, p.title, p.poster_path, p.genres, p.overview,
              p.release_year, p.tmdb_id,
              rat.rating AS user_rating
       FROM members mem
       JOIN groups g ON g.id = mem.group_id
       JOIN rounds r ON r.group_id = g.id AND r.watched_at IS NOT NULL
       JOIN proposals p ON p.id = r.winning_proposal_id
       LEFT JOIN ratings rat ON rat.proposal_id = p.id AND rat.member_id = mem.id
       WHERE mem.user_id = $1
       ORDER BY r.watched_at DESC`,
      [req.user!.userId]
    );

    res.json({ watched_movies: watchedResult.rows });
  } catch (error) {
    logger.error('My profile error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /members/:memberId/profile — public profile with watched movies
router.get('/members/:memberId/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { memberId } = req.params;

    const memberResult = await pool.query(
      `SELECT m.id, m.display_name, m.role, m.joined_at, g.id AS group_id, g.name AS group_name
       FROM members m
       JOIN groups g ON g.id = m.group_id
       WHERE m.id = $1`,
      [memberId]
    );

    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const member = memberResult.rows[0];

    // Caller must be in the same group
    const callerResult = await pool.query(
      `SELECT id FROM members WHERE group_id = $1 AND user_id = $2`,
      [member.group_id, req.user!.userId]
    );

    if (callerResult.rows.length === 0) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    // Get all watched winner movies across ALL groups the target user belongs to
    const watchedResult = await pool.query(
      `SELECT r.id AS round_id, r.round_number, r.watched_at,
              g.id AS group_id, g.name AS group_name,
              mem.id AS member_id,
              p.id AS proposal_id, p.title, p.poster_path, p.genres, p.overview,
              p.release_year, p.tmdb_id,
              rat.rating AS user_rating
       FROM members mem
       JOIN groups g ON g.id = mem.group_id
       JOIN rounds r ON r.group_id = g.id AND r.watched_at IS NOT NULL
       JOIN proposals p ON p.id = r.winning_proposal_id
       LEFT JOIN ratings rat ON rat.proposal_id = p.id AND rat.member_id = mem.id
       WHERE mem.user_id = (SELECT user_id FROM members WHERE id = $1)
       ORDER BY r.watched_at DESC`,
      [memberId]
    );

    res.json({
      member: {
        id: member.id,
        display_name: member.display_name,
        role: member.role,
        joined_at: member.joined_at,
        group_id: member.group_id,
        group_name: member.group_name,
      },
      watched_movies: watchedResult.rows,
    });
  } catch (error) {
    logger.error('Member profile error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
