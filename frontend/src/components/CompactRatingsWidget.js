import React from 'react';
import './CompactRatingsWidget.css';

const CompactRatingsWidget = ({ 
  tmdbRating, 
  imdbRating, 
  rottenTomatoRating, 
  tmdbLink, 
  imdbLink, 
  rottenTomatoesLink,
  onRefresh,
  refreshing = false 
}) => {
  const getRatingPercentage = (rating, max) => {
    if (!rating) return 0;
    return Math.min((rating / max) * 100, 100);
  };

  const getRatingColor = (rating, max) => {
    if (!rating) return '#6c757d';
    const percentage = (rating / max) * 100;
    if (percentage >= 80) return '#28a745';
    if (percentage >= 60) return '#ffc107';
    if (percentage >= 40) return '#fd7e14';
    return '#dc3545';
  };

  const formatRating = (rating) => {
    if (!rating) return '-';
    return rating.toFixed(1);
  };

  const formatPercentage = (rating) => {
    if (!rating) return '-';
    return `${Math.round(rating)}%`;
  };

  return (
    <div className="compact-ratings-widget">
      <div className="ratings-header">
        <h3>Ratings</h3>
        <button 
          className="refresh-btn"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh ratings from external sources"
        >
          <svg 
            className={`refresh-icon ${refreshing ? 'spinning' : ''}`} 
            width="16" 
            height="16" 
            viewBox="0 0 16 16"
          >
            <path 
              fill="currentColor" 
              d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"
            />
            <path 
              fill="currentColor" 
              d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"
            />
          </svg>
        </button>
      </div>
      
      <div className="ratings-container">
        {/* TMDB Rating */}
        <div className="rating-item">
          <a 
            href={tmdbLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="rating-link"
          >
            <div className="rating-circle">
              <div 
                className="rating-fill"
                style={{
                  background: `conic-gradient(${getRatingColor(tmdbRating, 10)} 0deg ${getRatingPercentage(tmdbRating, 10) * 3.6}deg, #3a3a3a ${getRatingPercentage(tmdbRating, 10) * 3.6}deg 360deg)`
                }}
              >
                <div className="rating-content">
                  <span className="rating-score">{formatRating(tmdbRating)}</span>
                </div>
              </div>
            </div>
            <span className="rating-label">TMDB</span>
          </a>
        </div>

        {/* IMDB Rating */}
        <div className="rating-item">
          <a 
            href={imdbLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="rating-link"
          >
            <div className="rating-circle">
              <div 
                className="rating-fill"
                style={{
                  background: `conic-gradient(${getRatingColor(imdbRating, 10)} 0deg ${getRatingPercentage(imdbRating, 10) * 3.6}deg, #3a3a3a ${getRatingPercentage(imdbRating, 10) * 3.6}deg 360deg)`
                }}
              >
                <div className="rating-content">
                  <span className="rating-score">{formatRating(imdbRating)}</span>
                </div>
              </div>
            </div>
            <span className="rating-label">IMDB</span>
          </a>
        </div>

        {/* Rotten Tomatoes Rating */}
        <div className="rating-item">
          <a 
            href={rottenTomatoesLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="rating-link"
          >
            <div className="rating-circle">
              <div 
                className="rating-fill"
                style={{
                  background: `conic-gradient(${getRatingColor(rottenTomatoRating, 100)} 0deg ${getRatingPercentage(rottenTomatoRating, 100) * 3.6}deg, #3a3a3a ${getRatingPercentage(rottenTomatoRating, 100) * 3.6}deg 360deg)`
                }}
              >
                <div className="rating-content">
                  <span className="rating-score">{formatPercentage(rottenTomatoRating)}</span>
                </div>
              </div>
            </div>
            <span className="rating-label">RT</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default CompactRatingsWidget;
