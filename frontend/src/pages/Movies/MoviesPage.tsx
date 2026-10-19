import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { Navbar } from '../../components/Navbar';
import { MovieInfoModal } from '../../components/MovieInfoModal/MovieInfoModal';
import './MoviesPage.css';

interface Movie {
  tmdb_id: number;
  title: string;
  release_year: number | null;
  poster_path: string | null;
  genres: number[];
  overview: string;
}

const GENRES = [
  { id: 0,     name: 'All' },
  { id: 28,    name: 'Action' },
  { id: 12,    name: 'Adventure' },
  { id: 16,    name: 'Animation' },
  { id: 35,    name: 'Comedy' },
  { id: 80,    name: 'Crime' },
  { id: 18,    name: 'Drama' },
  { id: 14,    name: 'Fantasy' },
  { id: 27,    name: 'Horror' },
  { id: 9648,  name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878,   name: 'Sci-Fi' },
  { id: 53,    name: 'Thriller' },
];

function MovieCard({ movie, onClick }: { movie: Movie; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="movies-grid-card" onClick={onClick} style={{ cursor: 'pointer' }} title={movie.title}>
      <div className="movies-grid-card__poster">
        {movie.poster_path && !imgFailed ? (
          <img
            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
            alt={movie.title}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="movies-grid-card__fallback">
            <span>{movie.title}</span>
          </div>
        )}
        {movie.release_year && (
          <span className="movies-grid-card__year">{movie.release_year}</span>
        )}
      </div>
      <div className="movies-grid-card__info">
        <h3 className="movies-grid-card__title">{movie.title}</h3>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="movies-grid-card movies-grid-card--skeleton">
          <div className="movies-grid-card__poster skeleton" />
          <div className="movies-grid-card__info">
            <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 6, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </>
  );
}

export function MoviesPage() {
  const [movies, setMovies]             = useState<Movie[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [searchQuery, setSearchQuery]   = useState('');
  const [isSearching, setIsSearching]   = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPopular = useCallback(async (p: number, genre: number, replace: boolean) => {
    try {
      const data = await api.getPopularMovies(p, genre || undefined);
      setMovies(prev => replace ? data.movies : [...prev, ...data.movies]);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503) {
        setError('The movie service is temporarily unavailable. Please try again shortly.');
      } else {
        setError('Failed to load movies. Please try again.');
      }
    }
  }, []);

  const performSearch = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.searchMovies(query);
      setMovies(data.movies);
      setTotalPages(1);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503) {
        setError('The movie search service is temporarily unavailable. Please try again shortly.');
      } else {
        setError('Search failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and genre change
  useEffect(() => {
    if (searchQuery) return;
    setLoading(true);
    setPage(1);
    setError(null);
    fetchPopular(1, selectedGenre, true).finally(() => setLoading(false));
  }, [selectedGenre, fetchPopular, searchQuery]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(() => {
      performSearch(searchQuery.trim());
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, performSearch]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    await fetchPopular(nextPage, selectedGenre, false);
    setPage(nextPage);
    setLoadingMore(false);
  };

  const handleGenreChange = (id: number) => {
    setSelectedGenre(id);
    setSearchQuery('');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!e.target.value.trim()) {
      setIsSearching(false);
    }
  };

  return (
    <div className="movies-scene">
      <div className="movies-glow--purple" />
      <div className="movies-glow--cyan" />

      <Navbar />

      <main className="movies-main">
        <div className="movies-header">
          <div>
            <div className="movies-eyebrow">Browse</div>
            <h1 className="movies-title">
              All <span className="movies-title__accent">Movies</span>
            </h1>
          </div>
          <Link to="/" className="cv-btn cv-btn--ghost cv-btn--sm">
            ← Back to Home
          </Link>
        </div>

        {/* Search + Filters */}
        <div className="movies-controls">
          <div className="movies-search-wrap">
            <span className="movies-search-icon">🔍</span>
            <input
              className="movies-search-input"
              type="text"
              placeholder="Search movies…"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <button
                className="movies-search-clear"
                onClick={() => { setSearchQuery(''); setIsSearching(false); }}
              >
                ✕
              </button>
            )}
          </div>

          {!isSearching && (
            <div className="movies-genre-chips">
              {GENRES.map(g => (
                <button
                  key={g.id}
                  className={`movies-genre-chip${selectedGenre === g.id ? ' movies-genre-chip--active' : ''}`}
                  onClick={() => handleGenreChange(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="cv-alert cv-alert--error movies-error-bar">
            <span>{error}</span>
            <button
              className="cv-btn cv-btn--ghost cv-btn--sm"
              onClick={() => {
                setError(null);
                if (isSearching && searchQuery.trim()) {
                  performSearch(searchQuery.trim());
                } else {
                  setLoading(true);
                  fetchPopular(1, selectedGenre, true).finally(() => setLoading(false));
                }
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Movie Grid */}
        <div className="movies-grid">
          {loading ? (
            <SkeletonGrid />
          ) : movies.length === 0 ? (
            <div className="movies-empty">
              <p>No movies found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
            </div>
          ) : (
            movies.map(m => <MovieCard key={m.tmdb_id} movie={m} onClick={() => setSelectedMovie(m)} />)
          )}
        </div>

        {/* Load More */}
        {!loading && !isSearching && page < totalPages && movies.length > 0 && (
          <div className="movies-load-more">
            <button
              className="cv-btn cv-btn--secondary"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load More'}
            </button>
          </div>
        )}
      </main>

      {selectedMovie && (
        <MovieInfoModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}
    </div>
  );
}
