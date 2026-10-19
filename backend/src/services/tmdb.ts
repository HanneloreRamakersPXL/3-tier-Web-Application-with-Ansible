import axios from 'axios';
import config from '../config/tmdb.js';
import { logger } from './logger.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function requireApiKey(): void {
  if (!config.TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not configured');
  }
}

function handleTmdbError(error: unknown, context: string): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    logger.error(`TMDB ${context} error`, { status: status ?? 'network', message: error.message });
    if (status === 401) throw new Error('TMDB API key is invalid or missing');
    if (status === 429) throw new Error('TMDB rate limit exceeded — try again later');
    if (status && status >= 500) throw new Error('TMDB service is currently unavailable');
  } else {
    logger.error(`TMDB ${context} error`, { error });
  }
  throw new Error(`Failed to ${context}`);
}

export interface TMDBSearchResult {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
}

interface RawTMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  vote_average: number;
  vote_count: number;
}

export const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

export async function discoverMovies(page = 1, genreId?: number): Promise<TMDBSearchResult> {
  requireApiKey();
  try {
    const params: Record<string, unknown> = {
      api_key: config.TMDB_API_KEY,
      sort_by: 'popularity.desc',
      include_adult: false,
      page,
    };
    if (genreId) params.with_genres = genreId;

    const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, { params });
    return {
      page: response.data.page,
      results: response.data.results.map(transformMovie),
      total_pages: response.data.total_pages,
      total_results: response.data.total_results,
    };
  } catch (error) {
    handleTmdbError(error, 'fetch movies');
  }
}

export async function searchMovies(query: string): Promise<TMDBSearchResult> {
  requireApiKey();
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: {
        api_key: config.TMDB_API_KEY,
        query,
        include_adult: false,
      },
    });

    return {
      page: response.data.page,
      results: response.data.results.slice(0, 10).map(transformMovie),
      total_pages: response.data.total_pages,
      total_results: response.data.total_results,
    };
  } catch (error) {
    handleTmdbError(error, 'search movies');
  }
}

export async function getMovieDetails(tmdbId: number): Promise<TMDBMovie> {
  requireApiKey();
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}`, {
      params: {
        api_key: config.TMDB_API_KEY,
      },
    });

    return transformMovie(response.data);
  } catch (error) {
    handleTmdbError(error, 'get movie details');
  }
}

function transformMovie(movie: RawTMDBMovie): TMDBMovie {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title,
    overview: movie.overview,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date,
    genre_ids: movie.genre_ids ?? movie.genres?.map(g => g.id) ?? [],
    vote_average: movie.vote_average,
    vote_count: movie.vote_count,
  };
}

export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map(id => GENRE_MAP[id] || 'Unknown').filter(Boolean);
}