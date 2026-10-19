import { pool } from '@cinevote/storage';
import { logger } from './logger.js';

export interface RateProposalRequest {
  proposal_id: string;
  member_id: string;
  rating: number;
}

export interface RatingResponse {
  id: string;
  proposal_id: string;
  member_id: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalWithRating {
  id: string;
  round_id: string;
  member_id: string;
  tmdb_id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  release_year: number | null;
  average_rating: number;
  total_ratings: number;
  user_rating: number | null;
}

/**
 * Rate a proposal
 */
export async function rateProposal(data: RateProposalRequest): Promise<RatingResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validate rating range (BR-15)
    if (data.rating < 1 || data.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Get proposal and verify group
    const proposalResult = await client.query(
      `SELECT p.id, p.round_id, r.group_id
       FROM proposals p
       JOIN rounds r ON p.round_id = r.id
       WHERE p.id = $1`,
      [data.proposal_id]
    );

    if (proposalResult.rows.length === 0) {
      throw new Error('Proposal not found');
    }

    const proposal = proposalResult.rows[0];

    // Verify member belongs to same group (BR-17, BR-18)
    const memberResult = await client.query(
      `SELECT id, group_id FROM members WHERE id = $1`,
      [data.member_id]
    );

    if (memberResult.rows.length === 0) {
      throw new Error('Member not found');
    }

    const member = memberResult.rows[0];

    if (member.group_id !== proposal.group_id) {
      throw new Error('You can only rate proposals from your group');
    }

    // Upsert rating (BR-16)
    const ratingResult = await client.query(
      `INSERT INTO ratings (proposal_id, member_id, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (proposal_id, member_id)
       DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()
       RETURNING *`,
      [data.proposal_id, data.member_id, data.rating]
    );

    const rating = ratingResult.rows[0];

    await client.query('COMMIT');

    logger.info('Rating submitted', {
      proposalId: data.proposal_id,
      memberId: data.member_id,
      rating: data.rating
    });

    return {
      id: rating.id,
      proposal_id: rating.proposal_id,
      member_id: rating.member_id,
      rating: rating.rating,
      created_at: rating.created_at,
      updated_at: rating.updated_at,
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get proposal with ratings
 */
export async function getProposalRatings(
  proposalId: string,
  memberId?: string
): Promise<ProposalWithRating> {
  const proposalResult = await pool.query(
    `SELECT
       p.id, p.round_id, p.member_id as proposal_member_id,
       p.tmdb_id, p.title, p.overview, p.poster_path, p.release_year,
       COALESCE(AVG(r.rating)::numeric(3,2), 0) as average_rating,
       COUNT(r.id) as total_ratings
     FROM proposals p
     LEFT JOIN ratings r ON p.id = r.proposal_id
     WHERE p.id = $1
     GROUP BY p.id`,
    [proposalId]
  );

  if (proposalResult.rows.length === 0) {
    throw new Error('Proposal not found');
  }

  const proposal = proposalResult.rows[0];

  let userRating: number | null = null;
  if (memberId) {
    const userRatingResult = await pool.query(
      `SELECT rating FROM ratings WHERE proposal_id = $1 AND member_id = $2`,
      [proposalId, memberId]
    );

    if (userRatingResult.rows.length > 0) {
      userRating = userRatingResult.rows[0].rating;
    }
  }

  return {
    id: proposal.id,
    round_id: proposal.round_id,
    member_id: proposal.proposal_member_id,
    tmdb_id: proposal.tmdb_id,
    title: proposal.title,
    overview: proposal.overview,
    poster_path: proposal.poster_path,
    release_year: proposal.release_year,
    average_rating: parseFloat(proposal.average_rating),
    total_ratings: parseInt(proposal.total_ratings),
    user_rating: userRating,
  };
}
