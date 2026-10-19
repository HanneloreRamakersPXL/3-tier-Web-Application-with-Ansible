import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { JoinGroupResponse } from '../../types/group';
import { PageWrapper } from '../../components/PageWrapper';
import './JoinGroup.css';

export function JoinGroupPage() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<JoinGroupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [maxMembers, setMaxMembers] = useState<number>(0);

  useEffect(() => {
    if (status !== 'success' || !result) return;

    const poll = async () => {
      try {
        const data = await api.getMemberCount(result.group_id);
        setMemberCount(data.count);
        setMaxMembers(data.max_members);
        if (data.count >= data.max_members) {
          navigate(`/dashboard/${result.group_id}`);
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [status, result, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const data = await api.joinGroup({ invite_code: inviteCode.trim() });
      setResult(data);
      setStatus('success');
    } catch (err: any) {
      setError(err.response?.data?.error ?? (err instanceof Error ? err.message : 'Failed to join group'));
      setStatus('error');
    }
  };

  if (status === 'success' && result) {
    return (
      <PageWrapper>
        <div className="join-success">
          <h2>Joined {result.group_name}!</h2>
          <p className="member-status">
            Waiting for members… {memberCount} / {maxMembers} joined
          </p>
          <button className="cv-btn cv-btn--primary" onClick={() => navigate(`/dashboard/${result.group_id}`)}>
            Go to Dashboard
          </button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="join-group-page">
        <h1>Join a Group</h1>
        <p className="page-subtitle">Enter your invite code to join an existing session.</p>

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
              {status === 'loading' ? 'Joining…' : 'Join Group'}
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
