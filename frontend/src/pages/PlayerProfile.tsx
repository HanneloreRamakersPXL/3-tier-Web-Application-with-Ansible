import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { MemberProfile, MyWatchedMovie } from '../types/dashboard';
import { PageWrapper } from '../components/PageWrapper';
import './PlayerProfile.css';

export function PlayerProfile() {
  const { memberId } = useParams<{ memberId: string }>();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) return;
    api.getMemberProfile(memberId)
      .then(setProfile)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [memberId]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="player-profile-loading">Loading profile…</div>
      </PageWrapper>
    );
  }

  if (error || !profile) {
    return (
      <PageWrapper>
        <div className="player-profile-error">
          <p>{error ?? 'Profile not found.'}</p>
        </div>
      </PageWrapper>
    );
  }

  const { member, watched_movies } = profile;

  return (
    <PageWrapper>
      <div className="player-profile">
        <div className="player-profile__header">
          <div className="player-avatar">{member.display_name[0].toUpperCase()}</div>
          <div className="player-info">
            <h1 className="player-name">{member.display_name}</h1>
            <div className="player-meta">
              <span className={`member-role-badge ${member.role}`}>{member.role}</span>
              <Link to={`/dashboard/${member.group_id}`} className="player-group-link">
                {member.group_name}
              </Link>
            </div>
            <p className="player-joined">
              Joined {new Date(member.joined_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <section className="player-watched-section">
          <h2 className="player-section-title">
            Watched Movies
            <span className="player-watched-count">{watched_movies.length}</span>
          </h2>

          {watched_movies.length === 0 ? (
            <p className="player-empty">This member hasn't watched any movies yet.</p>
          ) : (
            <div className="player-watched-grid">
              {watched_movies.map(movie => (
                <WatchedMovieCard key={`${movie.group_id}-${movie.round_id}`} movie={movie} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}

function WatchedMovieCard({ movie }: { movie: MyWatchedMovie }) {
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
          {movie.user_rating != null ? (
            <span className="watched-star-row">
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} className={n <= movie.user_rating! ? 'star star--filled' : 'star star--empty'}>★</span>
              ))}
              <span className="watched-rating-value">{movie.user_rating}/5</span>
            </span>
          ) : (
            <span className="watched-no-rating">Not rated</span>
          )}
        </div>
        <p className="watched-movie-date">
          {movie.group_name} · Watched {new Date(movie.watched_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
