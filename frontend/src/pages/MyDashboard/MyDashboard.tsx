import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { MyGroup } from '../../types/group';
import { PageWrapper } from '../../components/PageWrapper';
import './MyDashboard.css';

const STATUS_LABEL: Record<string, string> = {
  proposing: 'Proposing',
  voting: 'Voting',
  winner_selected: 'Winner Selected',
  rating: 'Rating',
  watched: 'Watched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusClass(status: string | null): string {
  if (!status) return '';
  if (status === 'proposing') return 'proposing';
  if (status === 'voting') return 'voting';
  if (status === 'winner_selected') return 'winner_selected';
  if (status === 'rating') return 'winner_selected';
  if (status === 'watched') return 'completed';
  if (status === 'completed') return 'completed';
  return 'cancelled';
}

interface GroupCardProps {
  group: MyGroup;
  onDelete: (groupId: string) => void;
}

function GroupCard({ group, onDelete }: GroupCardProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteGroup(group.group_id);
      onDelete(group.group_id);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete group');
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="my-group-card">
      <div className="my-group-card__header">
        <div className="my-group-card__name-row">
          <h3 className="my-group-card__name">{group.group_name}</h3>
          {group.role === 'admin' && (
            <span className="my-group-card__role">Admin</span>
          )}
        </div>
        {group.round_status && (
          <span className={`status-badge ${statusClass(group.round_status)}`}>
            {STATUS_LABEL[group.round_status] ?? group.round_status}
          </span>
        )}
      </div>

      <div className="my-group-card__meta">
        <span className="my-group-card__members">
          {group.member_count} / {group.max_members} members
        </span>
        {group.round_number && (
          <span className="my-group-card__round">
            Round {group.round_number}
          </span>
        )}
      </div>

      {deleteError && (
        <p className="my-group-card__delete-error">{deleteError}</p>
      )}

      {confirming ? (
        <div className="my-group-card__confirm">
          <span className="my-group-card__confirm-text">
            Delete "{group.group_name}"? This cannot be undone.
          </span>
          <div className="my-group-card__confirm-actions">
            <button
              className="cv-btn cv-btn--danger cv-btn--sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              className="cv-btn cv-btn--ghost cv-btn--sm"
              onClick={() => { setConfirming(false); setDeleteError(null); }}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="my-group-card__actions">
          <button
            className="cv-btn cv-btn--primary cv-btn--sm"
            onClick={() => navigate(`/dashboard/${group.group_id}`)}
          >
            Open Group
          </button>
          {group.active_round_id && group.round_status === 'voting' && (
            <Link
              to={`/rounds/${group.active_round_id}/voting?memberId=${group.member_id}`}
              className="cv-btn cv-btn--secondary cv-btn--sm"
            >
              Go to Voting
            </Link>
          )}
          {group.active_round_id && group.round_status === 'proposing' && (
            <Link
              to={`/rounds/${group.active_round_id}`}
              className="cv-btn cv-btn--ghost cv-btn--sm"
            >
              Propose a Movie
            </Link>
          )}
          {group.role === 'admin' && (
            <button
              className="cv-btn cv-btn--danger cv-btn--sm"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonCards() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="my-group-card my-group-card--skeleton">
          <div className="skeleton" style={{ height: 24, width: '55%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: '35%', marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 36, width: 120 }} />
        </div>
      ))}
    </>
  );
}

export function MyDashboard() {
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyGroups()
      .then(data => setGroups(data ?? []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDeleteGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.group_id !== groupId));
  };

  return (
    <PageWrapper>
      <div className="my-dashboard">
        <div className="my-dashboard__header">
          <div>
            <h1 className="cv-page-title">My Groups</h1>
            <p className="cv-page-subtitle">Pick up where you left off</p>
          </div>
          <div className="my-dashboard__header-actions">
            <Link to="/create" className="cv-btn cv-btn--primary cv-btn--sm">
              + New Group
            </Link>
            <Link to="/join" className="cv-btn cv-btn--ghost cv-btn--sm">
              Join Group
            </Link>
          </div>
        </div>

        <div className="my-group-list">
          {loading ? (
            <SkeletonCards />
          ) : groups.length === 0 ? (
            <div className="my-dashboard__empty">
              <div className="my-dashboard__empty-icon">🎬</div>
              <h3>You're not in any groups yet</h3>
              <p>Create a group or join one with an invite code to get started.</p>
              <div className="my-dashboard__empty-actions">
                <Link to="/create" className="cv-btn cv-btn--primary">
                  Create a Group
                </Link>
                <Link to="/join" className="cv-btn cv-btn--ghost">
                  Join a Group
                </Link>
              </div>
            </div>
          ) : (
            groups.map(g => (
              <GroupCard key={g.group_id} group={g} onDelete={handleDeleteGroup} />
            ))
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
