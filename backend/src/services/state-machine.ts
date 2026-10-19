import { pool } from '@cinevote/storage';
import { logger } from './logger.js';
import { withRetry } from './concurrency.js';

export type RoundStatus =
  | 'proposing'
  | 'voting'
  | 'winner_selected'
  | 'watched'
  | 'completed'
  | 'cancelled';

export interface Round {
  id: string;
  group_id: string;
  status: RoundStatus;
  voting_started_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
}

const VALID_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  proposing: ['voting', 'cancelled'],
  voting: ['winner_selected', 'cancelled'],
  winner_selected: ['watched', 'completed', 'cancelled'],
  watched: ['completed', 'cancelled'],
  completed: ['cancelled'],
  cancelled: [],
};

export function isValidTransition(
  currentState: RoundStatus,
  targetState: RoundStatus
): boolean {
  return VALID_TRANSITIONS[currentState]?.includes(targetState) ?? false;
}

export async function getAvailableTransitions(roundId: string): Promise<RoundStatus[]> {
  const result = await pool.query(
    'SELECT status FROM rounds WHERE id = $1',
    [roundId]
  );

  if (result.rows.length === 0) {
    throw new Error('Round not found');
  }

  const currentState = result.rows[0].status as RoundStatus;
  return VALID_TRANSITIONS[currentState] || [];
}

export async function transitionRound(
  roundId: string,
  newState: RoundStatus,
  actorId: string
): Promise<Round> {
  return withRetry(async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const roundResult = await client.query(
        `SELECT id, group_id, status FROM rounds WHERE id = $1 FOR UPDATE`,
        [roundId]
      );

      if (roundResult.rows.length === 0) {
        throw new Error('Round not found');
      }

      const round = roundResult.rows[0];
      const currentState = round.status as RoundStatus;

      if (!isValidTransition(currentState, newState)) {
        throw new Error(`Invalid transition from ${currentState} to ${newState}`);
      }

      if (currentState === 'proposing' && newState === 'voting') {
        const proposalCount = await client.query(
          `SELECT COUNT(*) as count FROM proposals WHERE round_id = $1`,
          [roundId]
        );

        if (parseInt(proposalCount.rows[0].count) === 0) {
          throw new Error('Cannot start voting with no proposals');
        }
      }

      if (currentState === 'voting' && newState === 'winner_selected') {
        const voteCount = await client.query(
          `SELECT COUNT(*) as count FROM votes WHERE round_id = $1`,
          [roundId]
        );

        if (parseInt(voteCount.rows[0].count) === 0) {
          throw new Error('Cannot end voting with no votes');
        }
      }

      // Build update — only columns that exist in the schema
      const updateFields: string[] = ['status = $1'];
      const updateParams: (string | number)[] = [newState];
      let nextParamIndex = 2;

      if (newState === 'voting') {
        updateFields.push(`voting_started_at = NOW()`);
      } else if (newState === 'winner_selected') {
        updateFields.push(`closed_at = NOW()`);
        const winnerResult = await client.query(
          `SELECT proposal_id FROM votes WHERE round_id = $1
           GROUP BY proposal_id ORDER BY COUNT(*) DESC, RANDOM() LIMIT 1`,
          [roundId]
        );
        if (winnerResult.rows.length > 0) {
          updateFields.push(`winning_proposal_id = $${nextParamIndex}`);
          updateParams.push(winnerResult.rows[0].proposal_id);
          nextParamIndex++;
        }
      }

      const updateResult = await client.query(
        `UPDATE rounds SET ${updateFields.join(', ')} WHERE id = $${nextParamIndex} RETURNING *`,
        [...updateParams, roundId]
      );

      const updatedRound = updateResult.rows[0];

      await client.query(
        `INSERT INTO state_transition_log (round_id, from_state, to_state, actor_id)
         VALUES ($1, $2, $3, $4)`,
        [roundId, currentState, newState, actorId]
      );

      await client.query('COMMIT');

      logger.info('Round state transition', {
        roundId,
        from: currentState,
        to: newState,
        actorId,
      });

      return updatedRound;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function checkAutoTransition(roundId: string): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roundResult = await client.query(
      `SELECT r.id, r.status, r.voting_started_at,
              (SELECT COUNT(*) FROM votes WHERE round_id = r.id)::int as votes_cast,
              (SELECT COUNT(*) FROM members WHERE group_id = r.group_id AND joined_at < r.voting_started_at)::int as eligible_voters
       FROM rounds r WHERE r.id = $1
       FOR UPDATE`,
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      throw new Error('Round not found');
    }

    const round = roundResult.rows[0];

    if (round.status !== 'voting') {
      await client.query('COMMIT');
      return false;
    }

    if (round.votes_cast > 0 && round.votes_cast >= round.eligible_voters && round.eligible_voters > 0) {
      const winnerResult = await client.query(
        `SELECT proposal_id, COUNT(*) as vote_count
         FROM votes WHERE round_id = $1
         GROUP BY proposal_id
         ORDER BY vote_count DESC, RANDOM()
         LIMIT 1`,
        [roundId]
      );

      if (winnerResult.rows.length > 0) {
        await client.query(
          `UPDATE rounds SET status = 'winner_selected', winning_proposal_id = $1, closed_at = NOW() WHERE id = $2`,
          [winnerResult.rows[0].proposal_id, roundId]
        );

        await client.query(
          `INSERT INTO state_transition_log (round_id, from_state, to_state, actor_id)
           VALUES ($1, 'voting', 'winner_selected', 'SYSTEM')`,
          [roundId]
        );

        logger.info('Auto-transition to winner_selected', { roundId });

        await client.query('COMMIT');
        return true;
      }
    }

    await client.query('COMMIT');
    return false;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}