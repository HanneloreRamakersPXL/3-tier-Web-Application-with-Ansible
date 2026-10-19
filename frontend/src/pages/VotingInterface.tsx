import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { getSocket, joinRound } from '../services/socket';
import { Proposal, VotingStatus } from '../types/dashboard';
import { PageWrapper } from '../components/PageWrapper';
import './VotingInterface.css';

export function VotingInterface() {
  const { roundId } = useParams<{ roundId: string }>();
  const [searchParams] = useSearchParams();
  const memberId = searchParams.get('memberId');
  const navigate = useNavigate();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votingStatus, setVotingStatus] = useState<VotingStatus | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    Promise.all([
      api.getProposals(roundId),
      api.getVotingStatus(roundId, memberId ?? undefined),
    ])
      .then(([proposalsData, statusData]) => {
        setProposals(proposalsData);
        setVotingStatus(statusData);
        if (statusData.voted_proposal_id && !selectedProposal) {
          setSelectedProposal(statusData.voted_proposal_id);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load voting data'));
  }, [roundId, memberId]);

  useEffect(() => {
    if (!roundId) return;

    const socket = getSocket();

    const handleVoteCast = (data: { roundId: string; votes_cast: number; total_eligible: number; voting_closed: boolean }) => {
      if (data.roundId !== roundId) return;
      setVotingStatus(prev =>
        prev ? { ...prev, votes_cast: data.votes_cast, total_eligible: data.total_eligible, voting_closed: data.voting_closed } : prev
      );
      if (data.voting_closed) {
        navigate(`/rounds/${roundId}/winner?memberId=${memberId}`);
      }
    };

    const handleStateChanged = (data: { roundId: string; new_status: string }) => {
      if (data.roundId !== roundId) return;
      if (data.new_status === 'winner_selected') {
        navigate(`/rounds/${roundId}/winner?memberId=${memberId}`);
      }
    };

    const handleReconnect = () => joinRound(roundId);

    joinRound(roundId);
    socket.on('vote_cast', handleVoteCast);
    socket.on('round_state_changed', handleStateChanged);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('vote_cast', handleVoteCast);
      socket.off('round_state_changed', handleStateChanged);
      socket.off('connect', handleReconnect);
    };
  }, [roundId, memberId, navigate]);

  const handleVote = async () => {
    if (!selectedProposal || !roundId || !memberId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.castVote({ round_id: roundId, member_id: memberId, proposal_id: selectedProposal });
      const newStatus = await api.getVotingStatus(roundId, memberId);
      setVotingStatus(newStatus);
      if (newStatus.voting_closed) {
        navigate(`/rounds/${roundId}/winner?memberId=${memberId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  };

  if (error && proposals.length === 0) {
    return (
      <PageWrapper>
        <div className="error-message"><p>{error}</p></div>
      </PageWrapper>
    );
  }

  const alreadyVoted = votingStatus?.has_voted ?? false;
  const buttonLabel = submitting
    ? 'Submitting…'
    : alreadyVoted
    ? 'Change Vote'
    : 'Submit Vote';

  return (
    <PageWrapper>
      <div className="voting-interface">
        <header>
          <h1>Cast Your Vote</h1>
          <p>{alreadyVoted ? 'You have voted. Select a different film to change your vote.' : 'Select one film to vote for'}</p>
          {votingStatus && (
            <div className="voting-progress-wrap">
              <div className="voting-progress-label">
                <span className="voting-progress-text">
                  {votingStatus.votes_cast} / {votingStatus.total_eligible} voted
                </span>
                {votingStatus.has_voted && (
                  <span className="voting-progress-done">✓ You voted</span>
                )}
              </div>
              <div className="voting-progress-bar">
                <div
                  className="voting-progress-fill"
                  style={{
                    width: votingStatus.total_eligible > 0
                      ? `${(votingStatus.votes_cast / votingStatus.total_eligible) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}
        </header>

        <div className="proposals-list">
          {proposals.map(proposal => (
            <div
              key={proposal.id}
              className={`proposal-option ${selectedProposal === proposal.id ? 'selected' : ''}`}
              onClick={() => setSelectedProposal(proposal.id)}
            >
              {proposal.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w200${proposal.poster_path}`}
                  alt={proposal.title}
                  loading="lazy"
                />
              )}
              <div className="proposal-info">
                <h3>{proposal.title}</h3>
                {proposal.release_year && (
                  <p className="release-year">{proposal.release_year}</p>
                )}
                <p>{proposal.overview?.substring(0, 150)}…</p>
              </div>
            </div>
          ))}
        </div>

        <button
          className="submit-vote"
          disabled={!selectedProposal || submitting || !memberId}
          onClick={handleVote}
        >
          {buttonLabel}
        </button>

        {!memberId && (
          <p className="error-message">Member ID required. Please add ?memberId= to the URL.</p>
        )}
        {error && <p className="error-message">{error}</p>}
      </div>
    </PageWrapper>
  );
}
