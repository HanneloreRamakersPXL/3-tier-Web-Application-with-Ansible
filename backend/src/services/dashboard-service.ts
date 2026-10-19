import { pool } from '@cinevote/storage';
import { logger } from './logger.js';
import { GENRE_MAP } from './tmdb.js';

export interface MyMember {
  id: string;
  role: 'admin' | 'member';
}

export interface ActiveRound {
  id: string;
  status: string;
  round_number: number;
  proposal_count: number;
}

export interface GroupDashboard {
  group_id: string;
  group_name: string;
  member_count: number;
  max_members: number;
  my_member: MyMember | null;
  active_round: ActiveRound | null;
  rounds: RoundSummary[];
  recent_activity: Activity[];
}

export interface RoundSummary {
  id: string;
  round_number: number;
  status: string;
  proposal_count: number;
  vote_count: number;
  winner_title: string | null;
  created_at: string;
}

export interface Activity {
  type: string;
  description: string;
  timestamp: string;
}

export interface GenreStats {
  group_id: string;
  genres: GenreCount[];
  total_votes: number;
}

export interface GenreCount {
  genre_id: number;
  genre_name: string;
  vote_count: number;
  proposal_count: number;
  average_rating: number;
}

export interface GenreSuggestions {
  group_id: string;
  suggestions: GenreRecommendation[];
}

export interface GenreRecommendation {
  genre_id: number;
  genre_name: string;
  score: number;
  reason: string;
}

const GENRE_NAME_TO_ID: Record<string, number> = Object.fromEntries(
  Object.entries(GENRE_MAP).map(([id, name]) => [name, parseInt(id)])
);

export async function getGroupDashboard(groupId: string, userId?: string): Promise<GroupDashboard> {
  const groupResult = await pool.query(
    `SELECT id, name, max_members FROM groups WHERE id = $1`,
    [groupId]
  );

  if (groupResult.rows.length === 0) {
    throw new Error('Group not found');
  }

  const group = groupResult.rows[0];

  let myMember: MyMember | null = null;
  if (userId) {
    const memberResult = await pool.query(
      `SELECT id, role FROM members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (memberResult.rows.length > 0) {
      myMember = { id: memberResult.rows[0].id, role: memberResult.rows[0].role };
    }
  }

  const memberCountResult = await pool.query(
    `SELECT COUNT(*)::int as count FROM members WHERE group_id = $1`,
    [groupId]
  );

  const activeRoundResult = await pool.query(
    `SELECT r.id, r.status, r.round_number,
            (SELECT COUNT(*)::int FROM proposals WHERE round_id = r.id) AS proposal_count
     FROM rounds r
     WHERE r.group_id = $1 AND r.status::text NOT IN ('completed', 'cancelled', 'watched')
     ORDER BY r.round_number DESC
     LIMIT 1`,
    [groupId]
  );

  const activeRound: ActiveRound | null = activeRoundResult.rows.length > 0
    ? {
        id: activeRoundResult.rows[0].id,
        status: activeRoundResult.rows[0].status,
        round_number: activeRoundResult.rows[0].round_number,
        proposal_count: activeRoundResult.rows[0].proposal_count,
      }
    : null;

  const roundsResult = await pool.query(
    `SELECT
       r.id, r.status, r.round_number, r.created_at,
       (SELECT COUNT(*)::int FROM proposals WHERE round_id = r.id) as proposal_count,
       (SELECT COUNT(*)::int FROM votes WHERE round_id = r.id) as vote_count,
       (SELECT title FROM proposals WHERE id = r.winning_proposal_id) as winner_title
     FROM rounds r
     WHERE r.group_id = $1
     ORDER BY r.round_number DESC
     LIMIT 20`,
    [groupId]
  );

  const activityResult = await pool.query(
    `SELECT 'round' as type,
            'Round #' || r.round_number || ' started' as description,
            r.created_at
     FROM rounds r WHERE r.group_id = $1
     UNION ALL
     SELECT 'proposal' as type,
            m.display_name || ' proposed ' || p.title as description,
            p.created_at
     FROM proposals p
     JOIN rounds r ON p.round_id = r.id
     JOIN members m ON p.member_id = m.id
     WHERE r.group_id = $1
     UNION ALL
     SELECT 'vote' as type,
            'Someone voted in round #' || r.round_number as description,
            v.created_at
     FROM votes v
     JOIN rounds r ON v.round_id = r.id
     WHERE r.group_id = $1
     UNION ALL
     SELECT 'winner' as type,
            'Round #' || r.round_number || ' — ' || p.title || ' won!' as description,
            r.closed_at
     FROM rounds r
     JOIN proposals p ON p.id = r.winning_proposal_id
     WHERE r.group_id = $1 AND r.winning_proposal_id IS NOT NULL AND r.closed_at IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 10`,
    [groupId]
  );

  logger.info('Dashboard fetched', { groupId, userId });

  return {
    group_id: group.id,
    group_name: group.name,
    member_count: memberCountResult.rows[0].count,
    max_members: group.max_members,
    my_member: myMember,
    active_round: activeRound,
    rounds: roundsResult.rows.map(r => ({
      id: r.id,
      round_number: r.round_number,
      status: r.status,
      proposal_count: r.proposal_count,
      vote_count: r.vote_count,
      winner_title: r.winner_title,
      created_at: r.created_at,
    })),
    recent_activity: activityResult.rows.map(a => ({
      type: a.type,
      description: a.description,
      timestamp: a.created_at,
    })),
  };
}

export async function getGenreStats(groupId: string): Promise<GenreStats> {
  const statsResult = await pool.query(
    `SELECT
       genre,
       COUNT(DISTINCT v.id)::int AS vote_count,
       COUNT(DISTINCT p.id)::int AS proposal_count,
       COALESCE(AVG(r.rating)::numeric(3,2), 0) AS average_rating
     FROM votes v
     JOIN rounds rnd ON v.round_id = rnd.id
     JOIN proposals p ON v.proposal_id = p.id
     LEFT JOIN ratings r ON p.id = r.proposal_id
     CROSS JOIN LATERAL unnest(p.genres) AS genre
     WHERE rnd.group_id = $1
       AND p.genres IS NOT NULL
     GROUP BY genre
     ORDER BY vote_count DESC`,
    [groupId]
  );

  const totalVotesResult = await pool.query(
    `SELECT COUNT(*) as count FROM votes v
     JOIN rounds r ON v.round_id = r.id
     WHERE r.group_id = $1`,
    [groupId]
  );

  return {
    group_id: groupId,
    genres: statsResult.rows.map(row => ({
      genre_id: GENRE_NAME_TO_ID[row.genre] ?? 0,
      genre_name: row.genre,
      vote_count: row.vote_count,
      proposal_count: row.proposal_count,
      average_rating: parseFloat(row.average_rating),
    })),
    total_votes: parseInt(totalVotesResult.rows[0].count),
  };
}

export async function getGenreSuggestions(groupId: string): Promise<GenreSuggestions> {
  const historyResult = await pool.query(
    `SELECT
       genre,
       COUNT(v.id)::int AS vote_count,
       SUM(CASE WHEN p.id = rnd.winning_proposal_id THEN 1 ELSE 0 END)::int AS win_count
     FROM votes v
     JOIN rounds rnd ON v.round_id = rnd.id
     JOIN proposals p ON v.proposal_id = p.id
     CROSS JOIN LATERAL unnest(p.genres) AS genre
     WHERE rnd.group_id = $1
       AND p.genres IS NOT NULL
     GROUP BY genre`,
    [groupId]
  );

  const suggestions: GenreRecommendation[] = [];

  for (const row of historyResult.rows) {
    const voteCount: number = row.vote_count;
    const winCount: number = row.win_count;
    if (voteCount >= 3) {
      suggestions.push({
        genre_id: GENRE_NAME_TO_ID[row.genre] ?? 0,
        genre_name: row.genre,
        score: Math.round((winCount / voteCount) * 100),
        reason: `${voteCount} votes, ${winCount} wins`,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  return {
    group_id: groupId,
    suggestions: suggestions.slice(0, 5),
  };
}
