import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { getSocket, joinGroup } from '../services/socket';
import { GroupDashboard, Activity, Proposal, Round } from '../types/dashboard';
import { GroupMember } from '../types/group';
import { PageWrapper } from '../components/PageWrapper';
import './Dashboard.css';

// ─── constants ────────────────────────────────────────────────────────────────

const TMDB = (path: string | null, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const AVATAR_COLORS = [
  '#7c3aed','#4f46e5','#0891b2','#059669',
  '#d97706','#dc2626','#db2777','#6d28d9',
];
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}


const SPARKLES = [
  { x: '8%',  y: '11%', s: 14, op: 0.75, d: 0    },
  { x: '20%', y: '6%',  s: 9,  op: 0.50, d: 0.45 },
  { x: '33%', y: '20%', s: 16, op: 0.82, d: 0.85 },
  { x: '47%', y: '7%',  s: 11, op: 0.58, d: 0.20 },
  { x: '63%', y: '14%', s: 15, op: 0.68, d: 1.05 },
  { x: '77%', y: '4%',  s: 10, op: 0.48, d: 0.62 },
  { x: '89%', y: '25%', s: 13, op: 0.62, d: 1.40 },
  { x: '4%',  y: '56%', s: 11, op: 0.52, d: 0.30 },
  { x: '17%', y: '76%', s: 15, op: 0.62, d: 1.22 },
  { x: '38%', y: '88%', s: 9,  op: 0.46, d: 0.72 },
  { x: '57%', y: '80%', s: 17, op: 0.72, d: 0.12 },
  { x: '72%', y: '66%', s: 11, op: 0.52, d: 0.92 },
  { x: '86%', y: '84%', s: 13, op: 0.58, d: 1.62 },
  { x: '94%', y: '48%', s: 9,  op: 0.42, d: 0.52 },
  { x: '28%', y: '44%', s: 7,  op: 0.38, d: 1.12 },
  { x: '68%', y: '40%', s: 10, op: 0.44, d: 0.35 },
  { x: '45%', y: '57%', s: 12, op: 0.46, d: 1.82 },
  { x: '12%', y: '32%', s: 8,  op: 0.35, d: 0.55 },
  { x: '54%', y: '35%', s: 6,  op: 0.32, d: 1.00 },
  { x: '83%', y: '52%', s: 8,  op: 0.38, d: 0.75 },
] as const;

const FILM_PALETTES = [
  ['#3b0764','#1e1b4b'],
  ['#0c4a6e','#0a1628'],
  ['#4a1942','#2d1458'],
  ['#7c2d12','#350804'],
  ['#134e4a','#042624'],
  ['#1e3a5f','#0b1829'],
  ['#44251d','#1a0b08'],
  ['#2d3748','#1a202c'],
] as const;

const STATUS_CFG: Record<string, { label: string; icon: string; cls: string }> = {
  proposing:       { label: 'Nominations Open',  icon: '🎬', cls: 'proposing' },
  voting:          { label: 'Voting Live',        icon: '🗳️', cls: 'voting'    },
  winner_selected: { label: 'Winner Announced',   icon: '🏆', cls: 'winner'   },
  watched:         { label: 'Watched',            icon: '✓',  cls: 'done'     },
  completed:       { label: 'Completed',          icon: '✓',  cls: 'done'     },
  cancelled:       { label: 'Cancelled',          icon: '✕',  cls: 'off'      },
};

const ACT_ICON: Record<string, string> = {
  round: '🎬', proposal: '🎥', vote: '🗳️', winner: '🏆',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtElapsed(ts: string): string {
  const t = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function useTickingTimer(start?: string | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [start]);
  return tick;
}

// ─── main component ───────────────────────────────────────────────────────────

export function Dashboard() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [dashboard,       setDashboard]       = useState<GroupDashboard | null>(null);
  const [members,         setMembers]         = useState<GroupMember[]>([]);
  const [proposals,       setProposals]       = useState<Proposal[]>([]);
  const [roundDetail,     setRoundDetail]     = useState<Round | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [closing,         setClosing]         = useState(false);
  const [closeError,      setCloseError]      = useState<string | null>(null);
  const [startingRound,   setStartingRound]   = useState(false);
  const [startRoundError, setStartRoundError] = useState<string | null>(null);
  const [inviteOpen,      setInviteOpen]      = useState(false);
  const [inviteCode,      setInviteCode]      = useState<string | null>(null);
  const [copied,          setCopied]          = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!groupId) return;
    try {
      const data = await api.getGroupDashboard(groupId);
      setDashboard(data);
      if (data.active_round) {
        const [pRes, rRes] = await Promise.allSettled([
          api.getProposals(data.active_round.id),
          api.getRound(data.active_round.id),
        ]);
        setProposals(pRes.status === 'fulfilled' ? pRes.value : []);
        setRoundDetail(rRes.status === 'fulfilled' ? rRes.value : null);
      } else {
        setProposals([]); setRoundDetail(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    if (!groupId) return;
    api.getGroupMembers(groupId).then(setMembers).catch(() => {});
  }, [groupId]);
  useEffect(() => {
    if (!groupId) return;
    const socket = getSocket();
    const on = (d: { groupId: string }) => { if (d.groupId === groupId) loadDashboard(); };
    const re = () => joinGroup(groupId);
    joinGroup(groupId);
    socket.on('proposal_added', on);
    socket.on('round_state_changed', on);
    socket.on('round_started', on);
    socket.on('connect', re);
    return () => {
      socket.off('proposal_added', on);
      socket.off('round_state_changed', on);
      socket.off('round_started', on);
      socket.off('connect', re);
    };
  }, [groupId, loadDashboard]);

  const startRound = async () => {
    if (!groupId) return;
    setStartingRound(true); setStartRoundError(null);
    try { await api.startNewRound(groupId); await loadDashboard(); }
    catch (e: any) { setStartRoundError(e?.response?.data?.error ?? e?.message ?? 'Failed'); }
    finally { setStartingRound(false); }
  };

  const openInvite = async () => {
    setInviteOpen(true);
    if (inviteCode || !groupId) return;
    try {
      const groups = await api.getMyGroups();
      const match = groups.find(g => g.group_id === groupId);
      if (match) setInviteCode(match.invite_code);
    } catch (_) {}
  };

  const copyCode = async () => {
    if (!inviteCode || copied) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  const closeProposals = async () => {
    if (!dashboard?.active_round || !groupId) return;
    setClosing(true); setCloseError(null);
    try { await api.closeProposals(dashboard.active_round.id, { group_id: groupId }); await loadDashboard(); }
    catch (e: any) { setCloseError(e?.response?.data?.error ?? e?.message ?? 'Failed'); }
    finally { setClosing(false); }
  };

  const handleHeroMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const scene = (e.currentTarget as HTMLElement).querySelector('.hero-cinema-scene') as HTMLElement | null;
    if (!scene) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width - 0.5;
    const cy = (e.clientY - rect.top)  / rect.height - 0.5;
    scene.style.transform = `translate(${cx * -22}px, ${cy * -12}px)`;
  }, []);

  const handleHeroLeave = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const scene = (e.currentTarget as HTMLElement).querySelector('.hero-cinema-scene') as HTMLElement | null;
    if (!scene) return;
    scene.style.transition = 'transform 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    scene.style.transform = 'translate(0px, 0px)';
    setTimeout(() => { if (scene) scene.style.transition = ''; }, 900);
  }, []);

  if (loading) return <PageWrapper><DashboardSkeleton /></PageWrapper>;
  if (error)   return <PageWrapper><div className="dash-err"><p>{error}</p></div></PageWrapper>;

  // ── derived ────────────────────────────────────────────────────────────────
  const ar          = dashboard?.active_round;
  const my          = dashboard?.my_member;
  const isAdmin     = my?.role === 'admin';
  const isVoting    = ar?.status === 'voting';
  const isProposing = ar?.status === 'proposing';
  const isWinner    = ar?.status === 'winner_selected';
  const canClose    = isAdmin && isProposing && (ar?.proposal_count ?? 0) >= 2;
  const canStart    = isAdmin && !ar;
  const done        = dashboard?.rounds.filter(r => r.status === 'watched' || r.status === 'completed') ?? [];

  const sorted     = [...proposals].sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
  const leader     = isVoting && sorted.length > 0 ? sorted[0] : null;
  const maxVotes   = (leader?.vote_count ?? 0) || 1;
  const totalVotes = sorted.reduce((s, p) => s + (p.vote_count ?? 0), 0);
  const memberCount = dashboard?.member_count ?? 1;
  const votesPct   = isVoting   ? Math.min(100, (totalVotes / memberCount) * 100) : 0;
  const propsPct   = isProposing ? Math.min(100, ((ar?.proposal_count ?? 0) / memberCount) * 100) : 0;

  const totalVotesAllRounds = dashboard?.rounds.reduce((s, r) => s + (r.vote_count ?? 0), 0) ?? 0;
  const votedRounds = dashboard?.rounds.filter(r => (r.vote_count ?? 0) > 0) ?? [];
  const avgParticipation = votedRounds.length > 0
    ? Math.round(votedRounds.reduce((s, r) => s + Math.min(100, ((r.vote_count ?? 0) / memberCount) * 100), 0) / votedRounds.length)
    : 0;

  const sCfg  = ar ? STATUS_CFG[ar.status] : null;
  const elapsed  = roundDetail?.voting_started_at;
  const featured = (isProposing || isVoting || isWinner) && sorted.length > 0 ? sorted[0] : null;

  return (
    <PageWrapper>
      <div className="dash">

        {/* ══ fixed background pixel-art scene ════════════════════════════ */}
        <BgArtScene />

        <div className="dash-content">

          {/* ══ HERO ════════════════════════════════════════════════════════ */}
          <section
            className="hero"
            data-status={ar?.status ?? 'idle'}
            onMouseMove={handleHeroMove}
            onMouseLeave={handleHeroLeave}
          >

            <HeroCinemaScene />
            <div className="hero__pixel-grid" aria-hidden="true" />
            <div className="hero__wash" />
            <div className="hero__vignette" />
            <div className="hero__grain" />

            {sCfg && (
              <div className="hero__chip-wrap">
                <span className={`hero__chip hero__chip--${sCfg.cls}`}>
                  {sCfg.icon} {sCfg.label}
                </span>
              </div>
            )}

            <div className="hero__inner">
              <div className="hero__text">
                <div className="hero__title-glow" aria-hidden="true" />
                <p className="hero__eyebrow">
                  <span className="hero__eyebrow-dot" />
                  PRIVATE CINEMA GROUP ✦
                </p>
                <h1 className="hero__title">{dashboard?.group_name}</h1>
                <p className="hero__subtitle">Good vibes. Great movies. Even better company.</p>
                <div className="hero__stats">
                  <div className="hstat">
                    <span className="hstat__val">{dashboard?.rounds.length ?? 0}</span>
                    <span className="hstat__lbl">🎬 Rounds</span>
                  </div>
                  <div className="hstat-sep" />
                  <div className="hstat">
                    <span className="hstat__val">{done.length}</span>
                    <span className="hstat__lbl">🍿 Watched</span>
                  </div>
                  <div className="hstat-sep" />
                  <div className="hstat">
                    <span className="hstat__val">
                      {dashboard?.member_count ?? 0}
                      <span className="hstat__max">/{dashboard?.max_members}</span>
                    </span>
                    <span className="hstat__lbl">👥 Members</span>
                  </div>
                  {ar && (
                    <>
                      <div className="hstat-sep" />
                      <div className="hstat">
                        <span className="hstat__val">#{ar.round_number}</span>
                        <span className="hstat__lbl">⚡ Active Round</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {(leader?.poster_path || proposals[0]?.poster_path) && (
                <div className={`hero__poster ${!leader ? 'hero__poster--dim' : ''}`}>
                  {leader && <div className="hero__poster-glow" />}
                  <img
                    src={TMDB(leader?.poster_path ?? proposals[0]?.poster_path ?? null, 'w342')!}
                    alt={leader?.title ?? proposals[0]?.title}
                    className="hero__poster-img"
                  />
                  {leader && <span className="hero__poster-crown">🏆 Leading</span>}
                </div>
              )}
            </div>
          </section>

          {/* ══ MAIN DASHBOARD GRID ════════════════════════════════════════ */}
          <div className="main-wrap">
            <div className="dash-grid">

              {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
              <div className="col-left">

                {/* CURRENT ROUND CARD */}
                <section className="panel">
                  <div className="panel__topbar">
                    <span className="panel__section-label">CURRENT ROUND</span>
                    <div className="panel__topbar-right">
                      {sCfg && (
                        <span className={`s-chip s-chip--${sCfg.cls}`}>
                          {sCfg.icon} {sCfg.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {ar ? (
                    <>
                      <div className="round-heading">
                        <div className="round-heading__left">
                          {(isProposing || isVoting) && <span className="round-pulse" />}
                          <h2 className="round-num">Round #{ar.round_number}</h2>
                        </div>
                        {isVoting && elapsed && <ElapsedBadge startTime={elapsed} />}
                      </div>

                      {sorted.length > 0 && (
                        <div className="prop-grid">
                          {sorted.slice(0, 6).map((p, i) => {
                            const isTop = isVoting && i === 0 && (p.vote_count ?? 0) > 0;
                            const pct   = maxVotes > 0 ? ((p.vote_count ?? 0) / maxVotes) * 100 : 0;
                            return (
                              <div key={p.id} className={`pcard ${isTop ? 'pcard--leader' : ''}`}>
                                {isTop && <div className="pcard__aura" />}
                                <div className="pcard__frame">
                                  {p.poster_path
                                    ? <img src={TMDB(p.poster_path)!} alt={p.title} className="pcard__img" loading="lazy" />
                                    : <div className="pcard__img pcard__img--fb">{p.title[0]}</div>
                                  }
                                  {isTop && <span className="pcard__crown">🏆</span>}
                                  <div className="pcard__overlay">
                                    <p className="pcard__ov-title">{p.title}</p>
                                    {p.release_year && <p className="pcard__ov-year">{p.release_year}</p>}
                                    {isVoting && <p className="pcard__ov-votes">{p.vote_count ?? 0} vote{p.vote_count !== 1 ? 's' : ''}</p>}
                                  </div>
                                </div>
                                <div className="pcard__meta">
                                  <p className="pcard__title">{p.title}</p>
                                  {isVoting && (
                                    <div className="pcard__bar-row">
                                      <div className="pcard__bar">
                                        <div className={`pcard__fill ${isTop ? 'pcard__fill--gold' : ''}`} style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="pcard__votes">{p.vote_count ?? 0}</span>
                                    </div>
                                  )}
                                  <p className="pcard__by">{p.proposing_member_name}</p>
                                </div>
                              </div>
                            );
                          })}
                          {sorted.length > 6 && (
                            <div className="pcard pcard--more">
                              <div className="pcard__frame pcard__frame--more">
                                <span>+{sorted.length - 6}</span>
                              </div>
                              <p className="pcard__title">More films</p>
                            </div>
                          )}
                          {isProposing && my && (
                            <button className="pcard pcard--add" onClick={() => navigate(`/rounds/${ar.id}`)}>
                              <div className="pcard__frame pcard__frame--add">
                                <span className="pcard__plus">+</span>
                              </div>
                              <p className="pcard__title">Nominate</p>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="participation">
                        <div className="participation__bar">
                          <div
                            className={`participation__fill ${isVoting ? 'participation__fill--vote' : ''}`}
                            style={{ width: `${isVoting ? votesPct : propsPct}%` }}
                          />
                        </div>
                        <span className="participation__label">
                          {isVoting
                            ? `${totalVotes} of ${memberCount} votes cast`
                            : `${ar.proposal_count} of ${memberCount} members proposed`}
                        </span>
                      </div>

                      <div className="round-panel__actions">
                        {isProposing && my && (
                          <button className="rbtn rbtn--primary" onClick={() => navigate(`/rounds/${ar.id}`)}>
                            Propose a Movie
                          </button>
                        )}
                        {isVoting && my && (
                          <Link to={`/rounds/${ar.id}/voting?memberId=${my.id}`} className="rbtn rbtn--cyan">
                            Cast Your Vote
                          </Link>
                        )}
                        {isWinner && (
                          <Link to={`/rounds/${ar.id}/winner${my ? `?memberId=${my.id}` : ''}`} className="rbtn rbtn--gold">
                            See Tonight's Winner
                          </Link>
                        )}
                        <Link to={`/rounds/${ar.id}`} className="rbtn rbtn--ghost">
                          View Details
                        </Link>
                        {canClose && (
                          <button className="rbtn rbtn--danger" onClick={closeProposals} disabled={closing}>
                            {closing ? 'Starting vote…' : 'Close & Start Voting'}
                          </button>
                        )}
                      </div>
                      {(closeError || startRoundError) && (
                        <p className="dash-err-inline">{closeError ?? startRoundError}</p>
                      )}
                    </>
                  ) : canStart ? (
                    <div className="idle-cta">
                      <div className="idle-cta__bg" />
                      <span className="idle-cta__icon">🎬</span>
                      <h2 className="idle-cta__heading">Ready for Movie Night?</h2>
                      <p className="idle-cta__sub">Start a new round and let everyone pitch their picks.</p>
                      <button className="rbtn rbtn--primary rbtn--lg" onClick={startRound} disabled={startingRound}>
                        {startingRound ? 'Starting…' : 'Start New Round'}
                      </button>
                      {startRoundError && <p className="dash-err-inline">{startRoundError}</p>}
                    </div>
                  ) : (
                    <div className="idle-wait">
                      <span className="idle-wait__icon">🍿</span>
                      <p className="idle-wait__text">Waiting for the admin to start a new round.</p>
                    </div>
                  )}
                </section>

                {/* LEADING PICK CARD */}
                {featured && (
                  <section className="panel leading-card">
                    <div className="panel__topbar">
                      <span className="panel__section-label">
                        {leader ? 'LEADING PICK' : 'FEATURED NOMINATION'}
                      </span>
                      {leader && <span className="crown-badge">👑 Currently Leading</span>}
                    </div>
                    <div className="leading-inner">
                      <div className="leading-poster">
                        {featured.poster_path
                          ? <img src={TMDB(featured.poster_path, 'w342')!} alt={featured.title} className="leading-poster__img" />
                          : <div className="leading-poster__fb">{featured.title[0]}</div>
                        }
                        {leader && <div className="leading-glow" />}
                      </div>
                      <div className="leading-info">
                        <h3 className="leading-title">{featured.title}</h3>
                        {featured.release_year && <p className="leading-year">{featured.release_year}</p>}
                        <p className="leading-by">by {featured.proposing_member_name}</p>
                        {featured.overview && (
                          <p className="leading-overview">
                            {featured.overview.slice(0, 130)}{featured.overview.length > 130 ? '…' : ''}
                          </p>
                        )}
                        {isVoting && (
                          <div className="leading-votes-row">
                            <div className="leading-bar">
                              <div
                                className="leading-fill"
                                style={{ width: `${((featured.vote_count ?? 0) / Math.max(maxVotes, 1)) * 100}%` }}
                              />
                            </div>
                            <span className="leading-vote-count">
                              {featured.vote_count ?? 0} vote{featured.vote_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        <div className="leading-actions">
                          {isVoting && my && (
                            <Link to={`/rounds/${ar!.id}/voting?memberId=${my.id}`} className="rbtn rbtn--gold">
                              Vote Now →
                            </Link>
                          )}
                          {isWinner && (
                            <Link to={`/rounds/${ar!.id}/winner${my ? `?memberId=${my.id}` : ''}`} className="rbtn rbtn--gold">
                              See Winner →
                            </Link>
                          )}
                          {isProposing && my && (
                            <button className="rbtn rbtn--primary" onClick={() => navigate(`/rounds/${ar!.id}`)}>
                              Propose a Movie
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* RECENT ACTIVITY */}
                <section className="panel">
                  <div className="panel__topbar">
                    <span className="panel__section-label">RECENT ACTIVITY</span>
                    <span className="live-dot-wrap">
                      <span className="live-dot" />
                      LIVE
                    </span>
                  </div>
                  <ActivityFeed activities={dashboard?.recent_activity ?? []} />
                </section>

              </div>{/* end col-left */}

              {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
              <div className="col-right">

                {/* THE CREW */}
                <section className="panel crew-card">
                  <div className="panel__topbar">
                    <span className="panel__section-label">THE CREW</span>
                    <span className="crew-count-badge">
                      {dashboard?.member_count} / {dashboard?.max_members}
                    </span>
                  </div>
                  <div className="crew-list">
                    {members.map(m => (
                      <Link key={m.id} to={`/members/${m.id}`} className="crew-member">
                        <div
                          className={`crew-member__avatar${m.role === 'admin' ? ' crew-member__avatar--admin' : ''}`}
                          style={{ background: avatarColor(m.display_name) }}
                        >
                          {m.display_name[0].toUpperCase()}
                          <span className="crew-member__online" />
                        </div>
                        <div className="crew-member__info">
                          <span className="crew-member__name">{m.display_name}</span>
                          <div className="crew-member__badges">
                            {m.role === 'admin'
                              ? <span className="crew-badge crew-badge--admin">👑 Admin</span>
                              : <span className="crew-badge crew-badge--member">Member</span>}
                          </div>
                        </div>
                        <span className="crew-member__arrow">›</span>
                      </Link>
                    ))}
                  </div>
                  {(dashboard?.member_count ?? 0) < (dashboard?.max_members ?? Infinity) && (
                    <button className="invite-btn" onClick={openInvite}>
                      <span className="invite-btn__icon">+</span>
                      Invite Friends
                    </button>
                  )}
                </section>

                {/* PREVIOUSLY WATCHED */}
                {done.length > 0 && (
                  <section className="panel">
                    <div className="panel__topbar">
                      <span className="panel__section-label">PREVIOUSLY WATCHED</span>
                      <span className="panel__count">{done.length} film{done.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="watched-compact-list">
                      {done.slice().reverse().slice(0, 5).map((r, i) => {
                        const [a, b] = FILM_PALETTES[r.round_number % FILM_PALETTES.length];
                        return (
                          <Link
                            key={r.id}
                            to={`/rounds/${r.id}`}
                            className={`watched-compact-row${i === 0 ? ' watched-compact-row--featured' : ''}`}
                          >
                            <div
                              className="watched-compact-row__color"
                              style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                            >
                              🏆
                            </div>
                            <div className="watched-compact-row__info">
                              <p className="watched-compact-row__title">{r.winner_title ?? '—'}</p>
                              <p className="watched-compact-row__meta">Round #{r.round_number} · {r.vote_count} vote{r.vote_count !== 1 ? 's' : ''}</p>
                            </div>
                            <span className="watched-compact-row__arrow">›</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* GROUP STATS */}
                <section className="panel">
                  <div className="panel__topbar">
                    <span className="panel__section-label">GROUP STATS</span>
                  </div>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-item__emoji">🍿</span>
                      <span className="stat-item__value">{done.length}</span>
                      <span className="stat-item__label">Movies Watched</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-item__emoji">🗳️</span>
                      <span className="stat-item__value">{totalVotesAllRounds}</span>
                      <span className="stat-item__label">Total Votes</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-item__emoji">👥</span>
                      <span className="stat-item__value">{avgParticipation}%</span>
                      <span className="stat-item__label">Participation</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-item__emoji">🎬</span>
                      <span className="stat-item__value">{dashboard?.rounds.length ?? 0}</span>
                      <span className="stat-item__label">Total Rounds</span>
                    </div>
                  </div>
                </section>

              </div>{/* end col-right */}

            </div>{/* end dash-grid */}
          </div>{/* end main-wrap */}

        </div>{/* end dash-content */}

        {/* ══ INVITE MODAL ════════════════════════════════════════════════ */}
        {inviteOpen && (
          <div className="invite-overlay" onClick={() => setInviteOpen(false)}>
            <div className="invite-modal" onClick={e => e.stopPropagation()}>
              <button className="invite-modal__close" onClick={() => setInviteOpen(false)} aria-label="Close">✕</button>
              <div className="invite-modal__icon">🎬</div>
              <h2 className="invite-modal__title">Invite Your Crew</h2>
              <p className="invite-modal__sub">
                Share this code with friends to join <strong>{dashboard?.group_name}</strong>
              </p>
              <div className="invite-modal__code-wrap">
                {inviteCode
                  ? <span className="invite-modal__code">{inviteCode}</span>
                  : <span className="invite-modal__code invite-modal__code--loading">Loading…</span>
                }
              </div>
              <button
                className={`rbtn rbtn--primary invite-modal__copy-btn${copied ? ' invite-modal__copy-btn--done' : ''}`}
                onClick={copyCode}
                disabled={!inviteCode}
              >
                {copied ? '✓ Copied to clipboard!' : '📋 Copy Invite Code'}
              </button>
              {copied && (
                <p className="invite-modal__toast">🎉 Send this to your friends and let the movie magic begin!</p>
              )}
              <p className="invite-modal__hint">They can enter this code on the Join page.</p>
            </div>
          </div>
        )}

      </div>{/* end dash */}
    </PageWrapper>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

// ── Hero cinema pixel-art scene ───────────────────────────────────────────────

function HeroSparkle({ x, y, s, op, d }: { x: string; y: string; s: number; op: number; d: number }) {
  return (
    <svg
      aria-hidden="true"
      className="hero-sparkle"
      style={{ left: x, top: y, width: s, height: s, opacity: op, animationDelay: `${d}s` }}
      viewBox="0 0 20 20"
    >
      <path d="M10 0 L11.4 8.6 L20 10 L11.4 11.4 L10 20 L8.6 11.4 L0 10 L8.6 8.6 Z" fill="#c084fc"/>
      <path d="M10 4 L10.7 9.3 L16 10 L10.7 10.7 L10 16 L9.3 10.7 L4 10 L9.3 9.3 Z" fill="#e879f9"/>
    </svg>
  );
}

function HeroPopcorn() {
  return (
    <svg viewBox="0 0 13 15" shapeRendering="crispEdges" width="100%" height="100%">
      {/* kernels */}
      <rect x="0" y="2" width="4" height="3" fill="#f0abfc"/>
      <rect x="1" y="1" width="2" height="1" fill="#f9a8d4"/>
      <rect x="5" y="0" width="3" height="4" fill="#e879f9"/>
      <rect x="6" y="0" width="1" height="1" fill="#fce7f3"/>
      <rect x="9" y="1" width="4" height="3" fill="#f0abfc"/>
      <rect x="3" y="3" width="7" height="2" fill="#e879f9"/>
      {/* rim */}
      <rect x="2" y="5" width="9" height="1" fill="#a855f7"/>
      {/* body */}
      <rect x="2" y="6" width="9" height="7" fill="#7c3aed"/>
      {/* stripes */}
      <rect x="2" y="6" width="1" height="7" fill="#6d28d9"/>
      <rect x="5" y="6" width="1" height="7" fill="#6d28d9"/>
      <rect x="8" y="6" width="1" height="7" fill="#6d28d9"/>
      <rect x="11" y="6" width="2" height="7" fill="#6d28d9"/>
      {/* base */}
      <rect x="3" y="13" width="7" height="1" fill="#5b21b6"/>
      <rect x="4" y="14" width="5" height="1" fill="#4c1d95"/>
    </svg>
  );
}

function HeroClapper() {
  return (
    <svg viewBox="0 0 16 13" shapeRendering="crispEdges" width="100%" height="100%">
      {/* striped flip bar */}
      <rect x="0" y="0" width="16" height="4" fill="#c4b5fd"/>
      <rect x="0" y="0" width="3" height="4" fill="#6d28d9"/>
      <rect x="4" y="0" width="3" height="4" fill="#6d28d9"/>
      <rect x="8" y="0" width="3" height="4" fill="#6d28d9"/>
      <rect x="12" y="0" width="3" height="4" fill="#6d28d9"/>
      {/* hinge */}
      <rect x="0" y="4" width="16" height="1" fill="#4c1d95"/>
      {/* board */}
      <rect x="0" y="5" width="16" height="8" fill="#6d28d9"/>
      <rect x="0" y="5" width="16" height="1" fill="#9333ea"/>
      {/* text lines */}
      <rect x="1" y="7"  width="9" height="1" fill="#4c1d95"/>
      <rect x="1" y="9"  width="12" height="1" fill="#4c1d95"/>
      <rect x="1" y="11" width="8" height="1" fill="#4c1d95"/>
      {/* corner dot */}
      <rect x="14" y="6" width="1" height="1" fill="#c4b5fd"/>
    </svg>
  );
}

function HeroFilmReel() {
  return (
    <svg viewBox="0 0 13 13" shapeRendering="crispEdges" width="100%" height="100%">
      {/* outer ring */}
      <rect x="3" y="0"  width="7"  height="1" fill="#7c3aed"/>
      <rect x="1" y="1"  width="11" height="1" fill="#7c3aed"/>
      <rect x="0" y="2"  width="13" height="9" fill="#7c3aed"/>
      <rect x="1" y="11" width="11" height="1" fill="#7c3aed"/>
      <rect x="3" y="12" width="7"  height="1" fill="#7c3aed"/>
      {/* inner disc */}
      <rect x="2" y="2"  width="9"  height="9" fill="#5b21b6"/>
      {/* spoke holes */}
      <rect x="3" y="3"  width="2" height="2" fill="#1e1b4b"/>
      <rect x="8" y="3"  width="2" height="2" fill="#1e1b4b"/>
      <rect x="3" y="8"  width="2" height="2" fill="#1e1b4b"/>
      <rect x="8" y="8"  width="2" height="2" fill="#1e1b4b"/>
      {/* center hub */}
      <rect x="4" y="5"  width="5" height="3" fill="#4c1d95"/>
      <rect x="5" y="4"  width="3" height="5" fill="#4c1d95"/>
      <rect x="5" y="5"  width="3" height="3" fill="#1e1b4b"/>
      {/* highlight */}
      <rect x="2" y="2"  width="9" height="1" fill="#9333ea"/>
    </svg>
  );
}

function HeroTicket() {
  return (
    <svg viewBox="0 0 18 9" shapeRendering="crispEdges" width="100%" height="100%">
      {/* body */}
      <rect x="0" y="1"  width="18" height="7" fill="#7c3aed"/>
      <rect x="0" y="1"  width="18" height="1" fill="#9333ea"/>
      {/* stub divider */}
      <rect x="4" y="1"  width="1"  height="7" fill="#6d28d9"/>
      <rect x="4" y="2"  width="1"  height="1" fill="#3b0764"/>
      <rect x="4" y="4"  width="1"  height="1" fill="#3b0764"/>
      <rect x="4" y="6"  width="1"  height="1" fill="#3b0764"/>
      {/* stub */}
      <rect x="1" y="1"  width="3"  height="7" fill="#6d28d9"/>
      {/* text lines */}
      <rect x="6" y="3"  width="9" height="1" fill="#c4b5fd"/>
      <rect x="6" y="5"  width="6" height="1" fill="#a78bfa"/>
      <rect x="6" y="7"  width="7" height="1" fill="#a78bfa"/>
      {/* notch bumps */}
      <rect x="0" y="3"  width="1" height="3" fill="#4c1d95"/>
      <rect x="17" y="3" width="1" height="3" fill="#4c1d95"/>
    </svg>
  );
}

function HeroGlasses() {
  return (
    <svg viewBox="0 0 18 7" shapeRendering="crispEdges" width="100%" height="100%">
      {/* arms */}
      <rect x="0"  y="2" width="1" height="3" fill="#6d28d9"/>
      <rect x="17" y="2" width="1" height="3" fill="#6d28d9"/>
      {/* left lens */}
      <rect x="1" y="1" width="7" height="5" fill="#7c3aed"/>
      <rect x="1" y="1" width="7" height="1" fill="#9333ea"/>
      <rect x="2" y="2" width="5" height="3" fill="#5b21b6"/>
      <rect x="3" y="2" width="2" height="1" fill="#818cf8"/>
      {/* bridge */}
      <rect x="8" y="3" width="2" height="1" fill="#6d28d9"/>
      {/* right lens (cyan) */}
      <rect x="10" y="1" width="7" height="5" fill="#7c3aed"/>
      <rect x="10" y="1" width="7" height="1" fill="#9333ea"/>
      <rect x="11" y="2" width="5" height="3" fill="#0e7490"/>
      <rect x="12" y="2" width="2" height="1" fill="#67e8f9"/>
    </svg>
  );
}

function HeroSodaCup() {
  return (
    <svg viewBox="0 0 10 15" shapeRendering="crispEdges" width="100%" height="100%">
      {/* straw */}
      <rect x="6" y="0" width="2" height="5" fill="#a78bfa"/>
      <rect x="7" y="0" width="1" height="5" fill="#c4b5fd"/>
      {/* lid */}
      <rect x="2" y="2" width="6" height="1" fill="#a855f7"/>
      <rect x="1" y="3" width="8" height="2" fill="#9333ea"/>
      {/* body */}
      <rect x="1" y="5" width="8" height="8" fill="#7c3aed"/>
      <rect x="1" y="5" width="1" height="8" fill="#9333ea"/>
      {/* stripes */}
      <rect x="1" y="6"  width="8" height="2" fill="#6d28d9"/>
      <rect x="1" y="10" width="8" height="2" fill="#6d28d9"/>
      {/* taper */}
      <rect x="2" y="13" width="6" height="1" fill="#6d28d9"/>
      <rect x="3" y="14" width="4" height="1" fill="#5b21b6"/>
    </svg>
  );
}

function HeroCinemaScene() {
  return (
    <div className="hero-cinema-scene" aria-hidden="true">
      {/* vertical film-strip rain */}
      <div className="hero-rain">
        {Array.from({ length: 18 }, (_, i) => (
          <div
            key={i}
            className="hero-rain__streak"
            style={{
              left:              `${(i * 5.5 + (i % 3) * 2.1) % 99}%`,
              height:            `${52 + (i % 5) * 11}%`,
              animationDelay:    `${(i * 0.21) % 2.5}s`,
              animationDuration: `${2 + (i % 7) * 0.32}s`,
              opacity:           0.032 + (i % 4) * 0.014,
            }}
          />
        ))}
      </div>

      {/* 4-pointed sparkle stars */}
      {SPARKLES.map((s, i) => <HeroSparkle key={i} {...s} />)}

      {/* central nebula cloud */}
      <div className="hero-nebula" />

      {/* pixel-art cinema objects — float wrapper handles drift, inner div handles rotation */}
      <div className="hero-float hero-float--c" style={{ left:'-5%', top:'-12%', animationDelay:'0s' }}>
        <div className="hero-cinema-obj" style={{ width:145, height:168, transform:'rotate(-12deg)' }}>
          <HeroPopcorn />
        </div>
      </div>
      <div className="hero-float hero-float--a" style={{ left:'70%', top:'-8%', animationDelay:'0.6s' }}>
        <div className="hero-cinema-obj" style={{ width:210, height:171, transform:'rotate(10deg)' }}>
          <HeroClapper />
        </div>
      </div>
      <div className="hero-float hero-float--e" style={{ left:'29%', top:'-5%', animationDelay:'1.0s' }}>
        <div className="hero-cinema-obj" style={{ width:172, height:87, transform:'rotate(5deg)', opacity:0.72 }}>
          <HeroTicket />
        </div>
      </div>
      <div className="hero-float hero-float--b" style={{ left:'74%', top:'2%', animationDelay:'1.4s' }}>
        <div className="hero-cinema-obj" style={{ width:136, height:68, transform:'rotate(-5deg)', opacity:0.65 }}>
          <HeroTicket />
        </div>
      </div>
      <div className="hero-float hero-float--d" style={{ left:'81%', top:'50%', animationDelay:'0.3s' }}>
        <div className="hero-cinema-obj" style={{ width:155, height:155, transform:'rotate(15deg)', opacity:0.78 }}>
          <HeroFilmReel />
        </div>
      </div>
      <div className="hero-float hero-float--a" style={{ left:'8%', top:'66%', animationDelay:'0.9s' }}>
        <div className="hero-cinema-obj" style={{ width:165, height:64, transform:'rotate(-8deg)', opacity:0.74 }}>
          <HeroGlasses />
        </div>
      </div>
      <div className="hero-float hero-float--c" style={{ left:'-2%', top:'28%', animationDelay:'1.7s' }}>
        <div className="hero-cinema-obj" style={{ width:102, height:153, transform:'rotate(-4deg)', opacity:0.76 }}>
          <HeroSodaCup />
        </div>
      </div>
      <div className="hero-float hero-float--b" style={{ left:'79%', top:'80%', animationDelay:'0.5s' }}>
        <div className="hero-cinema-obj" style={{ width:118, height:118, transform:'rotate(-10deg)', opacity:0.62 }}>
          <HeroFilmReel />
        </div>
      </div>
      <div className="hero-float hero-float--e" style={{ left:'20%', top:'72%', animationDelay:'1.2s' }}>
        <div className="hero-cinema-obj" style={{ width:120, height:98, transform:'rotate(8deg)', opacity:0.58 }}>
          <HeroClapper />
        </div>
      </div>
    </div>
  );
}

function BgArtScene() {
  return (
    <div className="bg-art" aria-hidden="true">
      <div className="bg-float bg-float--c" style={{ left:'2%', top:'7%', animationDelay:'0s' }}>
        <div className="bg-pixel-obj" style={{ width:110, height:127, transform:'rotate(-14deg)', opacity:0.062 }}>
          <HeroPopcorn />
        </div>
      </div>
      <div className="bg-float bg-float--a" style={{ left:'87%', top:'14%', animationDelay:'0.4s' }}>
        <div className="bg-pixel-obj" style={{ width:145, height:118, transform:'rotate(9deg)', opacity:0.055 }}>
          <HeroClapper />
        </div>
      </div>
      <div className="bg-float bg-float--b" style={{ left:'1%', top:'55%', animationDelay:'1.1s' }}>
        <div className="bg-pixel-obj" style={{ width:118, height:118, transform:'rotate(-20deg)', opacity:0.065 }}>
          <HeroFilmReel />
        </div>
      </div>
      <div className="bg-float bg-float--d" style={{ left:'85%', top:'67%', animationDelay:'0.7s' }}>
        <div className="bg-pixel-obj" style={{ width:138, height:138, transform:'rotate(14deg)', opacity:0.058 }}>
          <HeroFilmReel />
        </div>
      </div>
      <div className="bg-float bg-float--e" style={{ left:'44%', top:'8%', animationDelay:'0.5s' }}>
        <div className="bg-pixel-obj" style={{ width:165, height:83, transform:'rotate(5deg)', opacity:0.055 }}>
          <HeroTicket />
        </div>
      </div>
      <div className="bg-float bg-float--a" style={{ left:'72%', top:'3%', animationDelay:'1.5s' }}>
        <div className="bg-pixel-obj" style={{ width:110, height:55, transform:'rotate(-6deg)', opacity:0.05 }}>
          <HeroTicket />
        </div>
      </div>
      <div className="bg-float bg-float--c" style={{ left:'8%', top:'37%', animationDelay:'0.9s' }}>
        <div className="bg-pixel-obj" style={{ width:138, height:54, transform:'rotate(-6deg)', opacity:0.058 }}>
          <HeroGlasses />
        </div>
      </div>
      <div className="bg-float bg-float--b" style={{ left:'91%', top:'42%', animationDelay:'0.2s' }}>
        <div className="bg-pixel-obj" style={{ width:88, height:132, transform:'rotate(11deg)', opacity:0.06 }}>
          <HeroSodaCup />
        </div>
      </div>
      <div className="bg-float bg-float--d" style={{ left:'68%', top:'85%', animationDelay:'1.3s' }}>
        <div className="bg-pixel-obj" style={{ width:108, height:88, transform:'rotate(9deg)', opacity:0.055 }}>
          <HeroClapper />
        </div>
      </div>
      <div className="bg-float bg-float--e" style={{ left:'14%', top:'87%', animationDelay:'0.6s' }}>
        <div className="bg-pixel-obj" style={{ width:92, height:107, transform:'rotate(-22deg)', opacity:0.05 }}>
          <HeroPopcorn />
        </div>
      </div>
      <div className="bg-float bg-float--a" style={{ left:'79%', top:'78%', animationDelay:'1.0s' }}>
        <div className="bg-pixel-obj" style={{ width:105, height:105, transform:'rotate(-12deg)', opacity:0.06 }}>
          <HeroFilmReel />
        </div>
      </div>
      <div className="bg-float bg-float--c" style={{ left:'36%', top:'77%', animationDelay:'1.8s' }}>
        <div className="bg-pixel-obj" style={{ width:72, height:108, transform:'rotate(16deg)', opacity:0.045 }}>
          <HeroSodaCup />
        </div>
      </div>
      <div className="bg-float bg-float--d" style={{ left:'25%', top:'25%', animationDelay:'0.3s' }}>
        <div className="bg-pixel-obj" style={{ width:95, height:48, transform:'rotate(-10deg)', opacity:0.042 }}>
          <HeroTicket />
        </div>
      </div>
      <div className="bg-float bg-float--b" style={{ left:'58%', top:'52%', animationDelay:'1.6s' }}>
        <div className="bg-pixel-obj" style={{ width:122, height:47, transform:'rotate(-4deg)', opacity:0.038 }}>
          <HeroGlasses />
        </div>
      </div>
    </div>
  );
}

function ElapsedBadge({ startTime }: { startTime: string }) {
  const tick = useTickingTimer(startTime);
  void tick;
  return (
    <span className="elapsed">
      <span className="elapsed__dot" />
      LIVE · {fmtElapsed(startTime)}
    </span>
  );
}

function ActivityFeed({ activities }: { activities: Activity[] }) {
  const visible = activities.slice(0, 5);
  if (!visible.length) return <p className="dash-empty">No activity yet.</p>;
  return (
    <div className="activity activity--scrollable">
      {visible.map((a, i) => (
        <div key={i} className="activity__item">
          <div className="activity__track">
            <div className="activity__icon">{ACT_ICON[a.type] ?? '●'}</div>
            {i < visible.length - 1 && <div className="activity__connector" />}
          </div>
          <div className="activity__body">
            <p className="activity__text">{a.description}</p>
            <span className="activity__time">{relativeTime(a.timestamp)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-wrap">
      <div className="skel skel--hero" />
      <div className="skel-row">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="skel skel--card" />)}
      </div>
    </div>
  );
}
