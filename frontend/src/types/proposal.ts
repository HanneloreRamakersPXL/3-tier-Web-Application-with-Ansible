export interface SearchMovie {
  tmdb_id: number;
  title: string;
  release_year: number | null;
  poster_path: string | null;
  genres: number[];
  overview: string;
}

export interface SearchMoviesResponse {
  movies: SearchMovie[];
}

export interface SubmitProposalRequest {
  group_id: string;
  member_id: string;
  tmdb_movie_id: number;
}

export interface ProposalResponse {
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
}

export interface ListProposalsResponse {
  proposals: ProposalResponse[];
}

export interface CloseProposalsRequest {
  group_id: string;
}