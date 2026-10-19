import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { getSocket, joinRound } from '../services/socket';
import { Proposal } from '../types/dashboard';
import { RatingInput } from '../components/RatingInput';
import { PageWrapper } from '../components/PageWrapper';
import './WinnerPage.css';

export function WinnerPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [searchParams] = useSearchParams();
  const memberId = searchParams.get('memberId');
  const navigate = useNavigate();

  const [winner, setWinner] = useState<Proposal | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [watchedAt, setWatchedAt] = useState<string | null>(null);
  const [markingWatched, setMarkingWatched] = useState(false);
  const [myMemberId, setMyMemberId] = useState<string | null>(memberId);
  const [isAdmin, setIsAdmin] = useState(false);
  const [startingRound, setStartingRound] = useState(false);
  const [startRoundError, setStartRoundError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!roundId) return;
    const [round, proposals] = await Promise.all([
      api.getRound(roundId),
      api.getProposals(roundId, memberId ?? undefined),
    ]);
    setGroupId(round.group_id);
    setRoundNumber(round.round_number);
    setWatchedAt(round.watched_at);
    const winning = proposals.find(p => p.id === round.winning_proposal_id) ?? null;
    setWinner(winning);

    if (!memberId) {
      try {
        const m = await api.getMyMember(round.group_id);
        setMyMemberId(m.member_id);
        setIsAdmin(m.role === 'admin');
      } catch {
        // not authenticated or not a member
      }
    } else {
      try {
        const m = await api.getMyMember(round.group_id);
        setIsAdmin(m.role === 'admin');
      } catch {
        // ignore
      }
    }
  }, [roundId, memberId]);

  useEffect(() => {
    load()
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load winner'))
      .finally(() => setLoading(false));
  }, [load]);

  // Live socket: herlaad data wanneer iemand op "Mark as Watched" klikt
  useEffect(() => {
    if (!roundId) return;

    const socket = getSocket();

    const handleStateChanged = (data: { roundId: string; new_status: string }) => {
      if (data.roundId !== roundId) return;
      if (data.new_status === 'watched') {
        load();
      }
    };

    const handleReconnect = () => joinRound(roundId);

    joinRound(roundId);
    socket.on('round_state_changed', handleStateChanged);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('round_state_changed', handleStateChanged);
      socket.off('connect', handleReconnect);
    };
  }, [roundId, load]);

  const handleRate = async (rating: number) => {
    if (!winner || !myMemberId) return;
    await api.rateProposal({ proposal_id: winner.id, member_id: myMemberId, rating });
    await load();
  };

  const handleMarkWatched = async () => {
    if (!roundId || markingWatched) return;
    setMarkingWatched(true);
    try {
      const result = await api.markWatched(roundId);
      setWatchedAt(result.watched_at);
    } catch {
      // ignore
    } finally {
      setMarkingWatched(false);
    }
  };

  const handleStartNextRound = async () => {
    if (!groupId || startingRound) return;
    setStartingRound(true);
    setStartRoundError(null);
    try {
      await api.startNewRound(groupId);
      navigate(`/dashboard/${groupId}`);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        navigate(`/dashboard/${groupId}`);
        return;
      }
      const message = err?.response?.data?.error ?? (err instanceof Error ? err.message : 'Failed to start next round');
      setStartRoundError(message);
      setStartingRound(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="winner-loading">Loading winner…</div>
      </PageWrapper>
    );
  }

  if (error || !winner) {
    return (
      <PageWrapper>
        <div className="winner-error">
          <p>{error ?? 'No winner found for this round.'}</p>
          {groupId && (
            <Link to={`/dashboard/${groupId}`} className="btn-secondary">Back to group</Link>
          )}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="winner-page">
        <div className="winner-eyebrow">
          {roundNumber != null ? `Round #${roundNumber} — ` : ''}Winner
        </div>

        <div className="winner-hero">
          <div className="winner-poster-wrap">
            {winner.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w500${winner.poster_path}`}
                alt={winner.title}
                className="winner-poster"
              />
            ) : (
              <div className="winner-poster winner-poster--empty" />
            )}
          </div>

          <div className="winner-info">
            <h1 className="winner-title">{winner.title}</h1>

            {winner.release_year && (
              <p className="winner-year">{winner.release_year}</p>
            )}

            {winner.genres?.length > 0 && (
              <div className="winner-genres">
                {winner.genres.map(g => (
                  <span key={g} className="genre-tag">{g}</span>
                ))}
              </div>
            )}

            {winner.overview && (
              <p className="winner-overview">{winner.overview}</p>
            )}

            {winner.average_rating != null && (
              <div className="winner-avg-rating">
                <span className="avg-stars">★ {winner.average_rating.toFixed(1)}</span>
                <span className="avg-count">({winner.total_ratings ?? 0} rating{winner.total_ratings !== 1 ? 's' : ''})</span>
              </div>
            )}

            {myMemberId && (
              <div className="winner-rate-section">
                <p className="rate-label">
                  {winner.user_rating != null ? 'Change your rating:' : 'Rate this movie after watching:'}
                </p>
                <RatingInput
                  currentRating={winner.user_rating ?? null}
                  onRate={handleRate}
                />
              </div>
            )}

            <div className="winner-watched-section">
              {watchedAt ? (
                <div className="winner-watched-done">
                  <p className="watched-badge">
                    ✓ Watched on {new Date(watchedAt).toLocaleDateString()}
                  </p>
                  {myMemberId && (
                    <Link to="/my-profile" className="btn-profile-link">
                      View your watched movies →
                    </Link>
                  )}
                </div>
              ) : (
                <button
                  className="btn-watched"
                  onClick={handleMarkWatched}
                  disabled={markingWatched}
                >
                  {markingWatched ? 'Saving…' : '✓ Mark as Watched'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Next Round CTA (admin only, after watching) ─────────── */}
        {watchedAt && isAdmin && (
          <>
            <div className="next-round-banner">
              <div className="next-round-banner__text">
                <span className="next-round-banner__icon">🎬</span>
                <div>
                  <p className="next-round-banner__title">Ready for the next round?</p>
                  <p className="next-round-banner__sub">Start a new round and let everyone propose their picks.</p>
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={handleStartNextRound}
                disabled={startingRound}
              >
                {startingRound ? 'Starting…' : 'Start Next Round →'}
              </button>
            </div>
            {startRoundError && (
              <p style={{ color: '#f87171', fontSize: '0.875rem', marginTop: '0.5rem' }}>{startRoundError}</p>
            )}
          </>
        )}

        <div className="winner-footer">
          {groupId && (
            <Link
              to={`/dashboard/${groupId}${myMemberId ? `?memberId=${myMemberId}` : ''}`}
              className="btn-secondary winner-back"
            >
              ← Back to group
            </Link>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
