import { useEffect } from 'react';
import './MovieInfoModal.css';

export interface MovieInfo {
  tmdb_id: number;
  title: string;
  release_year: number | null;
  poster_path: string | null;
  genres: number[];
  overview: string;
}

interface MovieInfoModalProps {
  movie: MovieInfo;
  onClose: () => void;
}

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 18: 'Drama', 14: 'Fantasy', 27: 'Horror',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
};

export function MovieInfoModal({ movie, onClose }: MovieInfoModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const genreNames = movie.genres.map(id => GENRE_MAP[id]).filter(Boolean);

  return (
    <div className="mim-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={movie.title}>
      <div className="mim-card" onClick={e => e.stopPropagation()}>
        <button className="mim-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="mim-body">
          <div className="mim-poster">
            {movie.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                alt={movie.title}
              />
            ) : (
              <div className="mim-poster__fallback">
                <span>{movie.title}</span>
              </div>
            )}
          </div>
          <div className="mim-info">
            <h2 className="mim-title">{movie.title}</h2>
            {movie.release_year && (
              <span className="mim-year">{movie.release_year}</span>
            )}
            {genreNames.length > 0 && (
              <div className="mim-genres">
                {genreNames.map(g => (
                  <span key={g} className="mim-genre-chip">{g}</span>
                ))}
              </div>
            )}
            {movie.overview ? (
              <p className="mim-overview">{movie.overview}</p>
            ) : (
              <p className="mim-overview mim-overview--empty">No description available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
