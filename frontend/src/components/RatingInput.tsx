import { useState } from 'react';
import './RatingInput.css';

interface RatingInputProps {
  currentRating: number | null | undefined;
  onRate: (rating: number) => void;
}

export function RatingInput({ currentRating, onRate }: RatingInputProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const displayRating = hoverRating ?? currentRating ?? 0;

  const handleClick = async (rating: number) => {
    setSubmitting(true);
    try {
      onRate(rating);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rating-input">
      <div className="stars">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            className={`star ${star <= displayRating ? 'filled' : ''}`}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(null)}
            onClick={() => handleClick(star)}
            disabled={submitting}
            aria-label={`Rate ${star} stars`}
          >
            ★
          </button>
        ))}
      </div>
      {currentRating != null && (
        <span className="your-rating">Your rating: {currentRating}/5</span>
      )}
    </div>
  );
}
