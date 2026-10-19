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

export interface Round {
  id: string;
  group_id: string;
  round_number: number;
  status: string;
  created_at: string;
  voting_started_at: string | null;
  winning_proposal_id: string | null;
  watched_at: string | null;
}

export interface WatchedMovie {
  round_id: string;
  round_number: number;
  watched_at: string;
  proposal_id: string;
  title: string;
  poster_path: string | null;
  genres: string[];
  overview: string;
  release_year: number | null;
  tmdb_id: number;
  user_rating: number | null;
}

export interface MyWatchedMovie extends WatchedMovie {
  group_id: string;
  group_name: string;
  member_id: string;
}

export interface MemberProfile {
  member: {
    id: string;
    display_name: string;
    role: 'admin' | 'member';
    joined_at: string;
    group_id: string;
    group_name: string;
  };
  watched_movies: MyWatchedMovie[];
}

export interface Proposal {
  id: string;
  round_id: string;
  member_id: string;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  genres: string[];
  overview: string;
  release_year: number | null;
  created_at: string;
  proposing_member_name: string;
  vote_count: number | null;
  average_rating?: number;
  total_ratings?: number;
  user_rating?: number | null;
}

export interface Vote {
  id: string;
  round_id: string;
  proposal_id: string;
  member_id: string;
  created_at: string;
}

export interface Rating {
  proposal_id: string;
  member_id: string;
  rating: number;
  updated_at: string;
}

export interface VotingStatus {
  has_voted: boolean;
  voted_proposal_id: string | null;
  votes_cast: number;
  total_eligible: number;
  voting_closed: boolean;
}
