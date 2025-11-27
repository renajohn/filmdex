import React, { useState } from 'react';
import { BsStar, BsStarFill, BsStarHalf } from 'react-icons/bs';
import './StarRatingInput.css';

const StarRatingInput = ({ rating, onRatingChange, disabled = false, size = 'md' }) => {
  const [hoverRating, setHoverRating] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentRating = rating || 0;
  const displayRating = hoverRating || currentRating;

  const handleClick = async (newRating) => {
    if (disabled || saving) return;
    
    // If clicking the same rating, clear it
    const finalRating = newRating === currentRating ? null : newRating;
    
    setSaving(true);
    try {
      await onRatingChange(finalRating);
    } finally {
      setSaving(false);
    }
  };

  const handleHalfClick = (e, starIndex) => {
    if (disabled || saving) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isLeftHalf = clickX < rect.width / 2;
    
    const newRating = isLeftHalf ? starIndex - 0.5 : starIndex;
    handleClick(newRating);
  };

  const handleMouseMove = (e, starIndex) => {
    if (disabled || saving) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const isLeftHalf = mouseX < rect.width / 2;
    
    setHoverRating(isLeftHalf ? starIndex - 0.5 : starIndex);
  };

  const handleMouseLeave = () => {
    setHoverRating(0);
  };

  const renderStar = (starIndex) => {
    // Full star if rating >= star index
    const isFullFilled = displayRating >= starIndex;
    // Half star if rating is between (starIndex - 1) and starIndex (exclusive)
    const isHalfFilled = !isFullFilled && displayRating >= starIndex - 0.5;
    const isHovering = hoverRating > 0;
    
    return (
      <button
        key={starIndex}
        type="button"
        className={`star-button ${isFullFilled ? 'filled' : ''} ${isHalfFilled ? 'half-filled' : ''} ${isHovering ? 'hovering' : ''} ${saving ? 'saving' : ''} size-${size}`}
        onClick={(e) => handleHalfClick(e, starIndex)}
        onMouseMove={(e) => handleMouseMove(e, starIndex)}
        onMouseLeave={handleMouseLeave}
        disabled={disabled || saving}
        title={`Rate ${starIndex} out of 5${currentRating === starIndex ? ' (click to clear)' : ''}`}
      >
        {isFullFilled ? (
          <BsStarFill className="star-icon" />
        ) : isHalfFilled ? (
          <BsStarHalf className="star-icon" />
        ) : (
          <BsStar className="star-icon" />
        )}
      </button>
    );
  };

  return (
    <div className={`star-rating-input ${saving ? 'saving' : ''}`}>
      <div className="stars-container">
        {[1, 2, 3, 4, 5].map(renderStar)}
      </div>
      {currentRating > 0 && (
        <span className="rating-value">{currentRating}</span>
      )}
      {saving && <span className="saving-indicator">...</span>}
    </div>
  );
};

export default StarRatingInput;
