import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { SessionResumeResponse } from '../../types/group';
import { PageWrapper } from '../../components/PageWrapper';
import '../JoinGroup/JoinGroup.css';

export function ResumeSessionPage() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<SessionResumeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const data = await api.resumeSessionByUser(inviteCode.trim());
      setResult(data);
      setStatus('success');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Group not found or you are not a member.');
      setStatus('error');
    }
  };

  if (status === 'success' && result) {
    return (
      <PageWrapper>
        <div className="resume-success">
          <h2>Welcome back, {result.display_name}!</h2>
          <p>Group: <strong style={{ color: '#a78bfa' }}>{result.group_name}</strong></p>
          <button className="cv-btn cv-btn--primary" onClick={() => navigate(`/dashboard/${result.group_id}`)}>
            Go to Dashboard
          </button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="resume-session-page">
        <h1>Continue Session</h1>
        <p className="page-subtitle">Enter your group's invite code to pick up where you left off.</p>

        <div className="join-form-card">
          <form onSubmit={handleSubmit}>
            <div className="cv-form-group">
              <label className="cv-label" htmlFor="inviteCode">Invite Code</label>
              <input
                id="inviteCode"
                type="text"
                className="cv-input"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                required
              />
            </div>

            <button type="submit" className="cv-btn cv-btn--primary cv-btn--full" disabled={status === 'loading'}>
              {status === 'loading' ? 'Finding session…' : 'Continue Session'}
            </button>
          </form>

          {status === 'error' && (
            <div className="cv-alert cv-alert--error" style={{ marginTop: '16px' }}>{error}</div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
