import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MyWatchedMovie } from '../types/dashboard';
import { PageWrapper } from '../components/PageWrapper';
import { RatingInput } from '../components/RatingInput';
import './PlayerProfile.css';

export function MyProfile() {
  const { user } = useAuth();
  const [watchedMovies, setWatchedMovies] = useState<MyWatchedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [moviesLoadFailed, setMoviesLoadFailed] = useState(false);

  useEffect(() => {
    api.getMyProfile()
      .then(data => setWatchedMovies(data.watched_movies ?? []))
      .catch(() => setMoviesLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PageWrapper>
        <div className="player-profile-loading">Loading profile…</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="player-profile">
        <div className="player-profile__header">
          <div className="player-avatar">
            {user?.username[0].toUpperCase()}
          </div>
          <div className="player-info">
            <h1 className="player-name">{user?.username}</h1>
            <p className="player-joined">{user?.email}</p>
          </div>
        </div>

        <section className="player-watched-section">
          <h2 className="player-section-title">
            Watched Movies
            {!moviesLoadFailed && <span className="player-watched-count">{watchedMovies.length}</span>}
          </h2>

          {moviesLoadFailed || watchedMovies.length === 0 ? (
            <div className="player-empty">
              <p>You haven't watched any movies yet.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>
                After a round's winner is selected, mark it as watched on the winner page.
              </p>
            </div>
          ) : (
            <div className="player-watched-grid">
              {watchedMovies.map(movie => (
                <MyWatchedMovieCard
                  key={movie.round_id}
                  movie={movie}
                  onRate={async (rating) => {
                    await api.rateProposal({ proposal_id: movie.proposal_id, member_id: movie.member_id, rating });
                    setWatchedMovies(prev =>
                      prev.map(m => m.round_id === movie.round_id ? { ...m, user_rating: rating } : m)
                    );
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}

function MyWatchedMovieCard({ movie, onRate }: { movie: MyWatchedMovie; onRate: (rating: number) => Promise<void> }) {
  return (
    <div className="watched-movie-card">
      <div className="watched-movie-poster-wrap">
        {movie.poster_path ? (
          <img
            src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
            alt={movie.title}
            className="watched-movie-poster"
            loading="lazy"
          />
        ) : (
          <div className="watched-movie-poster watched-movie-poster--empty" />
        )}
        <div className="watched-movie-round">Round {movie.round_number}</div>
      </div>
      <div className="watched-movie-info">
        <h3 className="watched-movie-title">{movie.title}</h3>
        {movie.release_year && (
          <p className="watched-movie-year">{movie.release_year}</p>
        )}
        {movie.genres?.length > 0 && (
          <div className="watched-movie-genres">
            {movie.genres.slice(0, 3).map(g => (
              <span key={g} className="genre-tag">{g}</span>
            ))}
          </div>
        )}
        <div className="watched-movie-rating">
          <RatingInput currentRating={movie.user_rating ?? null} onRate={onRate} />
        </div>
        <Link to={`/dashboard/${movie.group_id}`} className="watched-movie-group">
          {movie.group_name}
        </Link>
        <p className="watched-movie-date">
          Watched {new Date(movie.watched_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
