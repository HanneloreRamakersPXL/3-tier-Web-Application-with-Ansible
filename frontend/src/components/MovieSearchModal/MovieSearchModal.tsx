import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { SearchMovie } from '../../types/proposal';
import './MovieSearchModal.css';

interface MovieSearchModalProps {
  groupId: string;
  roundId: string;
  memberId: string;
  onProposed: () => void;
  onClose: () => void;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';

export default function MovieSearchModal({
  groupId,
  roundId,
  memberId,
  onProposed,
  onClose,
}: MovieSearchModalProps) {
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<SearchMovie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [proposingId, setProposingId] = useState<number | null>(null);
  const [proposeError, setProposeError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setMovies([]);
      setSearchError('');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const result = await api.searchMovies(query.trim());
        setMovies(result.movies);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 503) {
          setSearchError('The movie search service is temporarily unavailable.');
        } else {
          setSearchError('Failed to search movies. Please try again.');
        }
        setMovies([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, retryCount]);

  async function handlePropose(movie: SearchMovie) {
    setProposingId(movie.tmdb_id);
    setProposeError('');
    try {
      await api.submitProposal(roundId, {
        group_id: groupId,
        member_id: memberId,
        tmdb_movie_id: movie.tmdb_id,
      });
      onProposed();
    } catch (err: any) {
      const message =
        err?.response?.data?.error ?? 'Failed to propose movie. Please try again.';
      setProposeError(message);
    } finally {
      setProposingId(null);
    }
  }

  const handleRetry = () => {
    setSearchError('');
    setRetryCount(c => c + 1);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Search Movies</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-search">
          <input
            type="text"
            className="search-input"
            placeholder="Type a movie title..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {proposeError && (
          <p className="modal-error">{proposeError}</p>
        )}

        <div className="modal-results">
          {searching && <p className="modal-status">Searching...</p>}

          {!searching && searchError && (
            <div className="modal-error-block">
              <p className="modal-error">{searchError}</p>
              {query.trim() && (
                <button className="modal-retry-btn" onClick={handleRetry}>
                  Retry
                </button>
              )}
            </div>
          )}

          {!searching && !searchError && movies.length === 0 && query.trim() && (
            <p className="modal-status">No movies found.</p>
          )}

          {movies.map(movie => (
            <div key={movie.tmdb_id} className="movie-item">
              {movie.poster_path ? (
                <img
                  className="movie-poster"
                  src={`${TMDB_IMAGE_BASE}${movie.poster_path}`}
                  alt={movie.title}
                />
              ) : (
                <div className="movie-poster movie-poster--placeholder" />
              )}
              <div className="movie-info">
                <p className="movie-title">{movie.title}</p>
                {movie.release_year && (
                  <p className="movie-year">{movie.release_year}</p>
                )}
                {movie.overview && (
                  <p className="movie-overview">{movie.overview}</p>
                )}
              </div>
              <button
                className="propose-btn"
                onClick={() => handlePropose(movie)}
                disabled={proposingId === movie.tmdb_id}
              >
                {proposingId === movie.tmdb_id ? 'Proposing...' : 'Propose'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
