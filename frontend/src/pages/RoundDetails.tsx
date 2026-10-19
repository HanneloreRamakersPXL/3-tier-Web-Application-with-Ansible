import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { getSocket, joinRound } from '../services/socket';
import { Round, Proposal } from '../types/dashboard';
import { ProposalCard } from '../components/ProposalCard';
import { PageWrapper } from '../components/PageWrapper';
import MovieSearchModal from '../components/MovieSearchModal/MovieSearchModal';
import './RoundDetails.css';

export function RoundDetails() {
  const { roundId } = useParams<{ roundId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const memberId = searchParams.get('memberId');

  const [round, setRound] = useState<Round | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<'admin' | 'member' | null>(null);
  const [showPropose, setShowPropose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!roundId) return;
    try {
      const [roundData, proposalsData] = await Promise.all([
        api.getRound(roundId),
        api.getProposals(roundId),
      ]);
      setRound(roundData);
      setProposals(proposalsData);

      try {
        const memberData = await api.getMyMember(roundData.group_id);
        setMyMemberId(memberData.member_id);
        setMyRole(memberData.role);
      } catch {
        // not a member or not authenticated
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load round');
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (round?.status === 'winner_selected' && roundId) {
      navigate(`/rounds/${roundId}/winner${memberId ? `?memberId=${memberId}` : ''}`, { replace: true });
    }
  }, [round?.status, roundId, memberId, navigate]);

  // Live socket: herlaad data bij nieuwe proposals of statuswijziging
  useEffect(() => {
    if (!roundId) return;

    const socket = getSocket();

    const handleProposalAdded = (data: { roundId: string }) => {
      if (data.roundId === roundId) loadData();
    };
    const handleStateChanged = (data: { roundId: string }) => {
      if (data.roundId === roundId) loadData();
    };
    const handleReconnect = () => joinRound(roundId);

    joinRound(roundId);
    socket.on('proposal_added', handleProposalAdded);
    socket.on('round_state_changed', handleStateChanged);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('proposal_added', handleProposalAdded);
      socket.off('round_state_changed', handleStateChanged);
      socket.off('connect', handleReconnect);
    };
  }, [roundId, loadData]);

  const handleRate = (proposalId: string) => async (rating: number) => {
    if (!myMemberId) return;
    await api.rateProposal({ proposal_id: proposalId, member_id: myMemberId, rating });
    if (roundId) {
      const updated = await api.getProposals(roundId);
      setProposals(updated);
    }
  };

  const handleCloseProposals = async () => {
    if (!round) return;
    setClosing(true);
    setCloseError(null);
    try {
      await api.closeProposals(round.id, { group_id: round.group_id });
      await loadData();
    } catch (err: any) {
      setCloseError(err?.response?.data?.error ?? err?.message ?? 'Failed to close proposals');
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <LoadingSkeleton />
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <div className="error-message"><p>{error}</p></div>
      </PageWrapper>
    );
  }

  const isProposing = round?.status === 'proposing';
  const isVoting = round?.status === 'voting';
  const canCloseProposals = myRole === 'admin' && isProposing && proposals.length >= 2;
  const myProposalCount = proposals.filter(p => p.member_id === myMemberId).length;
  const proposalLimitReached = myProposalCount >= 2;

  return (
    <PageWrapper>
      <div className="round-details">
        <header className="round-header">
          <h1>Round {round?.round_number}</h1>
          <span className={`status-badge ${round?.status}`}>{round?.status}</span>
        </header>

        <div className="round-actions">
          {isProposing && myMemberId && !proposalLimitReached && (
            <button className="btn-primary" onClick={() => setShowPropose(true)}>
              Propose a Movie
            </button>
          )}
          {isProposing && myMemberId && proposalLimitReached && (
            <p className="proposal-limit-notice">
              You have proposed {myProposalCount}/2 movies — limit reached.
            </p>
          )}

          {isVoting && myMemberId && (
            <Link to={`/rounds/${roundId}/voting?memberId=${myMemberId}`} className="btn-primary">
              Go to Voting
            </Link>
          )}

          {canCloseProposals && (
            <button
              className="btn-danger"
              onClick={handleCloseProposals}
              disabled={closing}
            >
              {closing ? 'Closing…' : 'Close Proposals & Start Voting'}
            </button>
          )}
        </div>

        {closeError && <p className="error-inline">{closeError}</p>}

        <section className="proposals-section">
          <h2>Proposals ({proposals.length})</h2>
          {proposals.length === 0 && (
            <p className="empty-state">No proposals yet.</p>
          )}
          <div className="proposals-grid">
            {proposals.map(proposal => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                showRating={true}
                onRate={myMemberId ? handleRate(proposal.id) : undefined}
              />
            ))}
          </div>
        </section>
      </div>

      {showPropose && round && myMemberId && (
        <MovieSearchModal
          groupId={round.group_id}
          roundId={round.id}
          memberId={myMemberId}
          onProposed={() => {
            setShowPropose(false);
            loadData();
          }}
          onClose={() => setShowPropose(false)}
        />
      )}
    </PageWrapper>
  );
}

function LoadingSkeleton() {
  return (
    <div className="round-details round-details-loading">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </div>
  );
}
