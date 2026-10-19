import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageWrapper } from '../../components/PageWrapper';
import './Login.css';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to continue to CineVote</p>

          {error && <div className="cv-alert cv-alert--error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="cv-form-group">
              <label className="cv-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="cv-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="cv-form-group">
              <label className="cv-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="cv-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="cv-btn cv-btn--primary cv-btn--full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/register" state={{ from }} className="auth-switch__link">Create one</Link>
          </p>
        </div>
      </div>
    </PageWrapper>
  );
}
