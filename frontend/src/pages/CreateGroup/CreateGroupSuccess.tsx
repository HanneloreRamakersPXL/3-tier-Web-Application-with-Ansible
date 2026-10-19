import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateGroupResponse } from '../../types/group';
import { api } from '../../services/api';

interface Props {
  data: CreateGroupResponse;
  onReset: () => void;
}

export function CreateGroupSuccess({ data, onReset }: Props) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(1);

  useEffect(() => {
    const poll = async () => {
      try {
        const result = await api.getMemberCount(data.group_id);
        setMemberCount(result.count);
        if (result.count >= result.max_members) {
          navigate(`/dashboard/${data.group_id}`);
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [data.group_id, navigate]);

  const copyToClipboard = async (code: string, type: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback for HTTP (non-secure context): clipboard API unavailable
        const el = document.createElement('textarea');
        el.value = code;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="create-group-success">
      <div className="success-header">
        <h2>🎉 Group Created!</h2>
        <p>Share the invite code with your friends to get them in.</p>
      </div>

      <div className="codes-display">
        <div className="code-item">
          <label>Invite Code (share with friends)</label>
          <div className="code-value">
            <code>{data.invite_code}</code>
            <button
              type="button"
              onClick={() => copyToClipboard(data.invite_code, 'invite')}
            >
              {copied === 'invite' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

      </div>

      <div className="waiting-room">
        <p className="member-status">
          Waiting for members to join… {memberCount} / {data.max_members} joined
        </p>
        <button
          className="go-to-dashboard"
          onClick={() => navigate(`/dashboard/${data.group_id}`)}
        >
          Go to Dashboard now
        </button>
      </div>

      <div className="success-actions">
        <button onClick={onReset}>Create Another Group</button>
      </div>
    </div>
  );
}
