import { pool } from '@cinevote/storage';
import { getMovieDetails, getGenreNames } from './tmdb.js';
import { logger } from './logger.js';

export interface ProposalSummary {
  id: string;
  round_id: string;
  member_id: string;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  genres: string[];
  overview: string;
  release_year: number | null;
  created_at: Date;
  proposing_member_name: string;
  vote_count: number | null;
}

export async function submitProposal(data: {
  groupId: string;
  roundId: string;
  memberId: string;
  tmdbMovieId: number;
}): Promise<ProposalSummary> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roundResult = await client.query(
      `SELECT id, status FROM rounds WHERE id = $1 AND group_id = $2`,
      [data.roundId, data.groupId]
    );

    if (roundResult.rows.length === 0) {
      throw new Error('Round not found');
    }

    const round = roundResult.rows[0];
    if (round.status !== 'proposing') {
      throw new Error('Round is not in proposing state');
    }

    const memberResult = await client.query(
      `SELECT id, display_name FROM members WHERE id = $1 AND group_id = $2`,
      [data.memberId, data.groupId]
    );

    if (memberResult.rows.length === 0) {
      throw new Error('Member not found');
    }

    const proposalCountResult = await client.query(
      `SELECT COUNT(*) as count FROM proposals WHERE round_id = $1 AND member_id = $2`,
      [data.roundId, data.memberId]
    );

    if (parseInt(proposalCountResult.rows[0].count) >= 2) {
      throw new Error('Member has reached proposal limit (2)');
    }

    let tmdbMovie;
    try {
      tmdbMovie = await getMovieDetails(data.tmdbMovieId);
    } catch {
      throw new Error('Invalid TMDB movie ID');
    }

    const duplicateResult = await client.query(
      `SELECT id FROM proposals WHERE round_id = $1 AND tmdb_id = $2`,
      [data.roundId, data.tmdbMovieId]
    );

    if (duplicateResult.rows.length > 0) {
      throw new Error('Movie already proposed in this round');
    }

    const releaseYear = tmdbMovie.release_date
      ? parseInt(tmdbMovie.release_date.split('-')[0])
      : null;

    const genres = getGenreNames(tmdbMovie.genre_ids);

    const insertResult = await client.query(
      `INSERT INTO proposals (round_id, member_id, tmdb_id, title, poster_path, genres, overview, release_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.roundId,
        data.memberId,
        data.tmdbMovieId,
        tmdbMovie.title,
        tmdbMovie.poster_path,
        genres,
        tmdbMovie.overview?.substring(0, 2000),
        releaseYear,
      ]
    );

    const proposal = insertResult.rows[0];

    await client.query('COMMIT');

    logger.info('Proposal created', { proposalId: proposal.id, memberId: data.memberId });

    return {
      id: proposal.id,
      round_id: proposal.round_id,
      member_id: proposal.member_id,
      tmdb_id: proposal.tmdb_id,
      title: proposal.title,
      poster_path: proposal.poster_path,
      genres: proposal.genres,
      overview: proposal.overview,
      release_year: proposal.release_year,
      created_at: proposal.created_at,
      proposing_member_name: memberResult.rows[0].display_name,
      vote_count: null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listProposals(roundId: string, currentMemberId?: string): Promise<ProposalSummary[]> {
  const roundResult = await pool.query(
    `SELECT status FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error('Round not found');
  }

  const roundStatus = roundResult.rows[0].status;
  const isProposing = roundStatus === 'proposing';

  const proposalsResult = await pool.query(
    `SELECT p.*, m.display_name as proposing_member_name
     FROM proposals p
     JOIN members m ON p.member_id = m.id
     WHERE p.round_id = $1
     ORDER BY p.created_at ASC`,
    [roundId]
  );

  let proposals = proposalsResult.rows;

  if (!isProposing) {
    const proposalIds = proposals.map(p => p.id);

    if (proposalIds.length > 0) {
      const votesResult = await pool.query(
        `SELECT proposal_id, COUNT(*) as vote_count
         FROM votes
         WHERE proposal_id = ANY($1)
         GROUP BY proposal_id`,
        [proposalIds]
      );

      const voteCounts = new Map(
        votesResult.rows.map(v => [v.proposal_id, parseInt(v.vote_count)])
      );

      proposals = proposals.map(p => ({
        ...p,
        vote_count: voteCounts.get(p.id) || 0,
      }));
    }
  }

  return proposals.map(p => ({
    id: p.id,
    round_id: p.round_id,
    member_id: p.member_id,
    tmdb_id: p.tmdb_id,
    title: p.title,
    poster_path: p.poster_path,
    genres: p.genres,
    overview: p.overview,
    release_year: p.release_year,
    created_at: p.created_at,
    proposing_member_name: p.proposing_member_name,
    vote_count: isProposing ? null : p.vote_count,
  }));
}

export interface RoundRow {
  id: string;
  group_id: string;
  round_number: number;
  status: string;
  voting_started_at: Date | null;
  winning_proposal_id: string | null;
  watched_at: Date | null;
  created_at: Date;
  closed_at: Date | null;
}

export async function closeProposals(
  groupId: string,
  roundId: string,
  userId: string
): Promise<RoundRow> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const memberResult = await client.query(
      `SELECT role FROM members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    if (!memberResult.rows.length || memberResult.rows[0].role !== 'admin') {
      throw new Error('You are not an admin of this group');
    }

    const groupResult = await client.query(
      `SELECT id FROM groups WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      throw new Error('Group not found');
    }

    const roundResult = await client.query(
      `SELECT id, status FROM rounds WHERE id = $1`,
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      throw new Error('Round not found');
    }

    const round = roundResult.rows[0];
    if (round.status !== 'proposing') {
      throw new Error('Round is not in proposing state');
    }

    const proposalCountResult = await client.query(
      `SELECT COUNT(*) as count FROM proposals WHERE round_id = $1`,
      [roundId]
    );

    const proposalCount = parseInt(proposalCountResult.rows[0].count);
    if (proposalCount < 2) {
      throw new Error('At least 2 proposals are required to begin voting');
    }

    const updateResult = await client.query(
      `UPDATE rounds SET status = 'voting', voting_started_at = NOW() WHERE id = $1 RETURNING *`,
      [roundId]
    );

    await client.query('COMMIT');

    logger.info('Proposals closed, voting started', { roundId });

    return updateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}