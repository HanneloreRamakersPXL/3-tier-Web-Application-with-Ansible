import { PoolClient } from 'pg';
import { pool } from '@cinevote/storage';
import { logger } from './logger.js';
import { withRetry, withAdvisoryLock } from './concurrency.js';

export interface CastVoteRequest {
  round_id: string;
  member_id: string;
  proposal_id: string;
}

export interface VoteResponse {
  id: string;
  round_id: string;
  proposal_id: string;
  member_id: string;
  created_at: string;
}

export interface VotingStatus {
  has_voted: boolean;
  voted_proposal_id: string | null;
  votes_cast: number;
  total_eligible: number;
  voting_closed: boolean;
}

export async function castVote(data: CastVoteRequest): Promise<VoteResponse> {
  return withRetry(async () => {
    return withAdvisoryLock(`vote:${data.round_id}`, async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Get round and verify state with lock
        const roundResult = await client.query(
          `SELECT id, status, voting_started_at FROM rounds WHERE id = $1 FOR UPDATE`,
          [data.round_id]
        );

        if (roundResult.rows.length === 0) {
          throw new Error('Round not found');
        }

        const round = roundResult.rows[0];
        if (round.status !== 'voting') {
          throw new Error('Round is not in voting state');
        }

        const memberResult = await client.query(
          `SELECT id, joined_at FROM members WHERE id = $1`,
          [data.member_id]
        );

        if (memberResult.rows.length === 0) {
          throw new Error('Member not found');
        }

        const member = memberResult.rows[0];

        // Check eligibility (BR-14)
        if (round.voting_started_at && new Date(member.joined_at) >= new Date(round.voting_started_at)) {
          throw new Error('You joined after voting started and cannot vote in this round');
        }

        const proposalResult = await client.query(
          `SELECT id FROM proposals WHERE id = $1 AND round_id = $2`,
          [data.proposal_id, data.round_id]
        );

        if (proposalResult.rows.length === 0) {
          throw new Error('Proposal not found in this round');
        }

        // UPSERT: insert new vote or replace an existing one (vote change)
        const voteResult = await client.query(
          `INSERT INTO votes (round_id, proposal_id, member_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (round_id, member_id)
           DO UPDATE SET proposal_id = EXCLUDED.proposal_id
           RETURNING *`,
          [data.round_id, data.proposal_id, data.member_id]
        );

        const vote = voteResult.rows[0];

        await checkAutoTransition(client, data.round_id);

        await client.query('COMMIT');

        logger.info('Vote cast', { voteId: vote.id, memberId: data.member_id });

        return {
          id: vote.id,
          round_id: vote.round_id,
          proposal_id: vote.proposal_id,
          member_id: vote.member_id,
          created_at: vote.created_at,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  });
}

async function checkAutoTransition(client: PoolClient, roundId: string): Promise<void> {
  const roundResult = await client.query(
    `SELECT r.id, r.status, r.voting_started_at,
            (SELECT COUNT(*) FROM votes WHERE round_id = r.id)::int as votes_cast,
            (SELECT COUNT(*) FROM members WHERE group_id = r.group_id AND joined_at < r.voting_started_at)::int as eligible_voters
     FROM rounds r WHERE r.id = $1
     FOR UPDATE`,
    [roundId]
  );

  const round = roundResult.rows[0];

  if (round.status !== 'voting') return;

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
        `UPDATE rounds SET status = 'winner_selected', winning_proposal_id = $1 WHERE id = $2`,
        [winnerResult.rows[0].proposal_id, roundId]
      );

      await client.query(
        `INSERT INTO state_transition_log (round_id, from_state, to_state, actor_id)
         VALUES ($1, 'voting', 'winner_selected', 'SYSTEM')`,
        [roundId]
      );

      logger.info('Auto-transition to winner_selected', { roundId });
    }
  }
}

export async function getVotingStatus(roundId: string, memberId?: string): Promise<VotingStatus> {
  const roundResult = await pool.query(
    `SELECT status, voting_started_at FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error('Round not found');
  }

  const round = roundResult.rows[0];

  const eligibleResult = await pool.query(
    `SELECT COUNT(*) as count FROM members m
     JOIN rounds r ON m.group_id = r.group_id
     WHERE r.id = $1 AND m.joined_at < r.voting_started_at`,
    [roundId]
  );

  const votesResult = await pool.query(
    `SELECT COUNT(*) as count FROM votes WHERE round_id = $1`,
    [roundId]
  );

  let hasVoted = false;
  let votedProposalId: string | null = null;
  if (memberId) {
    const memberVote = await pool.query(
      `SELECT id, proposal_id FROM votes WHERE round_id = $1 AND member_id = $2`,
      [roundId, memberId]
    );
    hasVoted = memberVote.rows.length > 0;
    votedProposalId = hasVoted ? memberVote.rows[0].proposal_id : null;
  }

  return {
    has_voted: hasVoted,
    voted_proposal_id: votedProposalId,
    votes_cast: parseInt(votesResult.rows[0].count),
    total_eligible: parseInt(eligibleResult.rows[0].count),
    voting_closed: round.status !== 'voting',
  };
}