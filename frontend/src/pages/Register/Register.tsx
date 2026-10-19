import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageWrapper } from '../../components/PageWrapper';
import '../Login/Login.css';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register({ email, username, password });
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('[Register] error:', err.response?.status, err.response?.data, err.message);
      const data = err.response?.data;
      const message =
        (data && typeof data === 'object' && data.error) ||
        (err.code === 'ERR_NETWORK' || !err.response
          ? 'Cannot connect to the server. Make sure the backend is running.'
          : null) ||
        (err.response?.status === 500 && !data
          ? 'Server error — the backend may be down or misconfigured.'
          : null) ||
        err.message ||
        'Registration failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Create account</h1>
          <p className="auth-subtitle">Join CineVote to start watching together</p>

          {error && <div className="cv-alert cv-alert--error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="cv-form-group">
              <label className="cv-label" htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="cv-input"
                placeholder="lowercase, no spaces"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                required
                maxLength={100}
                autoComplete="username"
              />
            </div>

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
                placeholder="at least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <button type="submit" className="cv-btn cv-btn--primary cv-btn--full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/login" className="auth-switch__link">Sign in</Link>
          </p>
        </div>
      </div>
    </PageWrapper>
  );
}
