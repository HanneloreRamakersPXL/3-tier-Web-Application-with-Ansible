import { Link } from 'react-router-dom';
import { Proposal } from '../types/dashboard';
import { RatingInput } from './RatingInput';
import './ProposalCard.css';

interface ProposalCardProps {
  proposal: Proposal;
  showRating?: boolean;
  onRate?: (rating: number) => void;
}

export function ProposalCard({ proposal, showRating, onRate }: ProposalCardProps) {
  return (
    <div className="proposal-card">
      {proposal.poster_path ? (
        <img
          src={`https://image.tmdb.org/t/p/w300${proposal.poster_path}`}
          alt={proposal.title}
          className="proposal-poster"
          loading="lazy"
        />
      ) : (
        <div className="proposal-poster" />
      )}

      <div className="proposal-content">
        <h3>{proposal.title}</h3>

        {proposal.release_year && (
          <p className="release-date">{proposal.release_year}</p>
        )}

        <p className="overview">{proposal.overview}</p>

        {showRating && (
          <div className="rating-section">
            {proposal.average_rating !== undefined && (
              <div className="average-rating">
                <span className="rating-value">
                  ★ {proposal.average_rating.toFixed(1)}
                </span>
                <span className="rating-count">
                  ({proposal.total_ratings ?? 0})
                </span>
              </div>
            )}
            {onRate && (
              <RatingInput
                currentRating={proposal.user_rating}
                onRate={onRate}
              />
            )}
          </div>
        )}

        <Link to={`/proposals/${proposal.id}`} className="details-link">
          View Details →
        </Link>
      </div>
    </div>
  );
}
