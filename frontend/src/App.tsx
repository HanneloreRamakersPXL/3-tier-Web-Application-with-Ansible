import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api } from './services/api';
import { SearchMovie } from './types/proposal';
import { CreateGroupPage } from './pages/CreateGroup/CreateGroup';
import { JoinGroupPage } from './pages/JoinGroup/JoinGroup';
import { ResumeSessionPage } from './pages/ResumeSession/ResumeSession';
import { Dashboard } from './pages/Dashboard';
import { RoundDetails } from './pages/RoundDetails';
import { VotingInterface } from './pages/VotingInterface';
import { WinnerPage } from './pages/WinnerPage';
import { Login } from './pages/Login/Login';
import { Register } from './pages/Register/Register';
import { MyDashboard } from './pages/MyDashboard/MyDashboard';
import { MoviesPage } from './pages/Movies/MoviesPage';
import { PlayerProfile } from './pages/PlayerProfile';
import { MyProfile } from './pages/MyProfile';
import { Navbar } from './components/Navbar';
import { MovieInfoModal } from './components/MovieInfoModal/MovieInfoModal';
import './pages/Home/HomePage.css';

function MoviePosterCard({ movie, onClick }: { movie: SearchMovie; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="movie-poster" onClick={onClick} style={{ cursor: 'pointer' }} title={movie.title}>
      {movie.poster_path && !imgFailed ? (
        <img
          src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
          alt={movie.title}
          className="movie-poster__img"
          onError={() => setImgFailed(true)}
          loading="lazy"
        />
      ) : (
        <div className="movie-poster__img movie-poster__img--fallback" />
      )}
      <div className="movie-poster__label">
        <span className="movie-poster__title">{movie.title}</span>
        {movie.release_year && <span className="movie-poster__year">{movie.release_year}</span>}
      </div>
    </div>
  );
}

function HomePage() {
  const { user } = useAuth();
  const [popularMovies, setPopularMovies] = useState<SearchMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SearchMovie | null>(null);

  useEffect(() => {
    api.getPopularMovies(1).then(data => setPopularMovies(data.movies.slice(0, 10))).catch(() => {});
  }, []);

  return (
    <div className="home-scene">
      <div className="home-glow--purple" />
      <div className="home-glow--cyan" />
      <div className="home-stars" />

      {/* Cinema-themed decorative background elements */}
      <div className="home-decor" aria-hidden="true">
        <span className="home-decor__item home-decor__item--1">🍿</span>
        <span className="home-decor__item home-decor__item--2">🎞️</span>
        <span className="home-decor__item home-decor__item--3">🎬</span>
        <span className="home-decor__item home-decor__item--4">🍿</span>
        <span className="home-decor__item home-decor__item--5">🎥</span>
        <span className="home-decor__item home-decor__item--6">📽️</span>
        <span className="home-decor__item home-decor__item--7">🍿</span>
        <span className="home-decor__item home-decor__item--8">🌮</span>
        <span className="home-decor__item home-decor__item--9">🎞️</span>
        <span className="home-decor__item home-decor__item--10">🎬</span>
        <span className="home-decor__item home-decor__item--11">🍿</span>
        <span className="home-decor__item home-decor__item--12">⭐</span>
      </div>

      <Navbar />

      <main className="home-hero">
        <div className="home-hero__eyebrow">Group Movie Voting</div>
        <h1 className="home-title">
          Pick a movie<br />
          <span className="home-title__accent">together.</span>
        </h1>
        <p className="home-subtitle">
          Create a group, nominate films, and vote as a crew.
          No more endless debates — let the votes decide.
        </p>
      </main>

      <section className="home-cards">
        <Link to="/create" className="action-card action-card--primary">
          <span className="action-card__icon">🎬</span>
          <span className="action-card__label">Create a Group</span>
          <span className="action-card__desc">Start a session and invite your friends to vote</span>
        </Link>
        <Link to="/join" className="action-card">
          <span className="action-card__icon">📽️</span>
          <span className="action-card__label">Join a Group</span>
          <span className="action-card__desc">Enter an invite code to join an existing session</span>
        </Link>
        <Link to={user ? '/my-dashboard' : '/resume'} className="action-card">
          <span className="action-card__icon">🍿</span>
          <span className="action-card__label">Continue Session</span>
          <span className="action-card__desc">
            {user ? 'View all your groups and pick up where you left off' : 'Enter your code to resume a session'}
          </span>
        </Link>
      </section>

      <section className="home-section">
        <div className="home-section__header">
          <h2 className="home-section__title">Popular Picks</h2>
          <Link to="/movies" className="home-section__more">Browse all →</Link>
        </div>
        <div className="movie-row">
          {popularMovies.map((m) => (
            <MoviePosterCard key={m.tmdb_id} movie={m} onClick={() => setSelectedMovie(m)} />
          ))}
        </div>
      </section>

      {selectedMovie && (
        <MovieInfoModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/"              element={<HomePage />} />
          <Route path="/login"         element={<Login />} />
          <Route path="/register"      element={<Register />} />
          <Route path="/movies"        element={<MoviesPage />} />
          <Route path="/create"        element={<RequireAuth><CreateGroupPage /></RequireAuth>} />
          <Route path="/join"          element={<RequireAuth><JoinGroupPage /></RequireAuth>} />
          <Route path="/resume"        element={<RequireAuth><ResumeSessionPage /></RequireAuth>} />
          <Route path="/my-dashboard"  element={<RequireAuth><MyDashboard /></RequireAuth>} />
          <Route path="/dashboard/:groupId"     element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/rounds/:roundId"          element={<RequireAuth><RoundDetails /></RequireAuth>} />
          <Route path="/rounds/:roundId/voting"  element={<RequireAuth><VotingInterface /></RequireAuth>} />
          <Route path="/rounds/:roundId/winner"  element={<RequireAuth><WinnerPage /></RequireAuth>} />
          <Route path="/members/:memberId"       element={<RequireAuth><PlayerProfile /></RequireAuth>} />
          <Route path="/my-profile"              element={<RequireAuth><MyProfile /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
