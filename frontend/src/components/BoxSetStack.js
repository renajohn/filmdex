import React, { useRef, useEffect } from 'react';
import { Popover, Overlay } from 'react-bootstrap';
import MovieThumbnail from './MovieThumbnail';
import './BoxSetStack.css';

const BoxSetStack = ({ boxSetName, movies, onMovieClick, isExpanded, onToggleExpanded, sortedMovies, onClose, watchNextMovies, onWatchNextToggle, dataFirstLetter, totalCount }) => {
  const targetRef = useRef(null);
  const containerRef = useRef(null);

  const handleClick = (e) => {
    // Always open the stack when clicked
    // Unless clicking on a menu
    if (e.target.closest('.movie-thumbnail-menu')) {
      return;
    }
    if (onToggleExpanded) {
      onToggleExpanded();
    }
  };

  const handleMovieClick = (movie) => {
    onMovieClick(movie.id);
  };

  // Calculate combined score for a movie
  const getCombinedScore = (movie) => {
    const ratings = [];
    
    // Add TMDB rating (weighted 40%)
    if (movie.tmdb_rating && movie.tmdb_rating !== 'N/A') {
      ratings.push({ score: parseFloat(movie.tmdb_rating), weight: 0.4, max: 10 });
    }
    
    // Add IMDB rating (weighted 35%)
    if (movie.imdb_rating && movie.imdb_rating !== 'N/A') {
      ratings.push({ score: parseFloat(movie.imdb_rating), weight: 0.35, max: 10 });
    }
    
    // Add Rotten Tomatoes rating (weighted 25%, convert to 10-point scale)
    if (movie.rotten_tomato_rating && movie.rotten_tomato_rating !== 'N/A') {
      const rtScore = parseFloat(movie.rotten_tomato_rating) / 10;
      ratings.push({ score: rtScore, weight: 0.25, max: 10 });
    }
    
    if (ratings.length === 0) return null;
    
    // Calculate weighted average
    const totalWeight = ratings.reduce((sum, rating) => sum + rating.weight, 0);
    const weightedSum = ratings.reduce((sum, rating) => sum + (rating.score * rating.weight), 0);
    
    return weightedSum / totalWeight;
  };

  // Get rating color
  const getRatingColor = (rating, maxRating = 10) => {
    if (!rating || rating === 'N/A') return '#3a3a3a';
    
    const percentage = (parseFloat(rating) / maxRating) * 100;
    
    if (percentage >= 80) {
      return '#22c55e'; // Excellent - bright green
    } else if (percentage >= 70) {
      return '#4ade80'; // Very good - medium green
    } else if (percentage >= 60) {
      return '#6ee7b7'; // Good - light green
    } else if (percentage >= 50) {
      return '#86efac'; // Fair - pale green
    } else if (percentage >= 40) {
      return '#a7f3d0'; // Below average - very pale green
    } else if (percentage >= 30) {
      return '#fbbf24'; // Poor - amber
    } else if (percentage >= 20) {
      return '#f59e0b'; // Very poor - orange
    } else {
      return '#ef4444'; // Terrible - red
    }
  };

  // Handle clicks outside the popover to close it
  useEffect(() => {
    if (!isExpanded) return;

    const handleDocumentClick = (e) => {
      // Check if click is outside the popover and the stack container
      const popoverElement = document.querySelector('#boxset-expansion-popover');
      const clickedInsidePopover = popoverElement && popoverElement.contains(e.target);
      const clickedInsideStack = containerRef.current && containerRef.current.contains(e.target);
      
      // Also check if clicking on a modal (don't close in that case)
      const modalBackdrop = document.querySelector('.modal-backdrop');
      const modal = document.querySelector('.modal.show, .movie-detail-card');
      if (modalBackdrop || modal) {
        return;
      }

      if (!clickedInsidePopover && !clickedInsideStack) {
        // Click is outside, close the popover and prevent the event
        e.preventDefault();
        e.stopPropagation();
        if (onClose) {
          onClose(e);
        }
      }
    };

    // Use capture phase to catch the event early
    document.addEventListener('click', handleDocumentClick, true);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [isExpanded, onClose]);

  // Use provided sortedMovies or sort them by collection_order
  const displayMovies = sortedMovies || [...movies].sort((a, b) => {
    const orderA = a.collection_order != null ? Number(a.collection_order) : 999999;
    const orderB = b.collection_order != null ? Number(b.collection_order) : 999999;
    if (isNaN(orderA) && isNaN(orderB)) return a.title.localeCompare(b.title);
    if (isNaN(orderA)) return 1;
    if (isNaN(orderB)) return -1;
    return orderA - orderB;
  });

  return (
    <>
      <div 
        ref={targetRef}
        className={`boxset-stack ${isExpanded ? 'expanded' : ''}`} 
        onClick={handleClick} 
        style={{ position: 'relative' }}
        {...(dataFirstLetter ? { 'data-first-letter': dataFirstLetter } : {})}
      >
        <div ref={containerRef} className="boxset-stack-container">
          <div className="boxset-title-overlay">
            <h4 className="boxset-title-text">{boxSetName}</h4>
            {totalCount && totalCount !== movies.length && (
              <span className="boxset-partial-count">({movies.length}/{totalCount})</span>
            )}
          </div>
          {displayMovies.slice(0, 3).map((movie, index) => {
            // Rotation for stacking effect:
            // - Index 0 (top): 0° (perfectly straight), centered
            // - Index 1 (below): +4° (slightly to the right)
            // - Index 2: -4° (slightly to the left)
            let rotation = 0;
            let offsetX = 0;
            let offsetY = 0;
            if (index === 1) {
              rotation = 4;
              offsetX = 0;
              offsetY = 0;
            } else if (index === 2) {
              rotation = -4;
              offsetX = 0;
              offsetY = 0;
            }
            
            const zIndex = 3 - index; // First movie on top
            
            return (
              <div
                key={movie.id}
                className={`boxset-stack-item ${index === 0 ? 'boxset-stack-item-first' : ''}`}
                style={{
                  transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${rotation}deg)`,
                  zIndex: zIndex,
                }}
              >
                <MovieThumbnail
                  imdbLink={movie.imdb_link}
                  title={movie.title}
                  year={movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                  posterPath={movie.poster_path}
                  recommendedAge={null}
                  disableZoom={true}
                  className="boxset-stack-thumbnail"
                  boxSetCount={index === 0 ? movies.length : null}
                />
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Dark overlay backdrop when popover is open */}
      {isExpanded && (
        <div 
          className="boxset-popover-backdrop"
          onClick={(e) => {
            // Close popover when clicking on backdrop
            e.preventDefault();
            e.stopPropagation();
            if (onClose) {
              onClose(e);
            }
          }}
        />
      )}
      
      {isExpanded && sortedMovies && containerRef.current && (
        <Overlay
          show={isExpanded}
          target={containerRef.current}
          placement="bottom"
          rootClose
          onHide={(e) => {
            // Prevent closing if a modal is open
            const modalBackdrop = document.querySelector('.modal-backdrop');
            const modal = document.querySelector('.modal.show, .movie-detail-card');
            if (modalBackdrop || modal) {
              return;
            }
            if (onClose) {
              onClose(e);
            }
          }}
        >
          <Popover 
            id="boxset-expansion-popover" 
            className="boxset-expansion-popover"
          >
            <Popover.Header>
              <div className="boxset-expansion-header">
                <h4 className="boxset-expansion-title">{boxSetName}</h4>
                <span className="boxset-expansion-count">
                  {totalCount && totalCount !== sortedMovies.length 
                    ? `${sortedMovies.length}/${totalCount} movies`
                    : `${sortedMovies.length} movies`}
                </span>
              </div>
            </Popover.Header>
            <Popover.Body>
              <div className="boxset-expansion-movies">
                {sortedMovies.map((movie, index) => {
                  const combinedScore = getCombinedScore(movie);
                  
                  return (
                    <div
                      key={movie.id}
                      className="boxset-expansion-movie-item"
                      style={{
                        animationDelay: `${index * 0.03}s`,
                      }}
                      onClick={() => handleMovieClick(movie)}
                    >
                      <div className="boxset-movie-poster-wrapper">
                        <MovieThumbnail
                          imdbLink={movie.imdb_link}
                          title={`(${movie.collection_order || index + 1}) ${movie.title}`}
                          year={movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                          posterPath={movie.poster_path}
                          recommendedAge={null}
                          disableZoom={true}
                          className="boxset-popover-thumbnail"
                        />
                        <div className="poster-overlay-large">
                          {/* Left side badges - vertical stack */}
                          <div className="poster-badges-left">
                            {movie.recommended_age != null && (
                              <span className="age-badge-large">{movie.recommended_age}+</span>
                            )}
                            {combinedScore && (
                              <span className="score-badge-large" style={{ color: getRatingColor(combinedScore, 10) }}>
                                {combinedScore.toFixed(1)}
                              </span>
                            )}
                            {movie.format && (
                              <span className="format-badge-large">
                                {movie.format === 'Blu-ray 4K' ? '4K' : 
                                 movie.format === 'Blu-ray' ? 'BR' : 
                                 movie.format === 'DVD' ? 'DVD' : 
                                 movie.format === 'Digital' ? 'DIG' : 
                                 movie.format.substring(0, 3).toUpperCase()}
                              </span>
                            )}
                          </div>
                          
                          {/* Top right - Watch Next button */}
                          {watchNextMovies && onWatchNextToggle && (
                            <button 
                              className={`watch-next-badge-large ${watchNextMovies.some(wm => wm.id === movie.id) ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onWatchNextToggle(e, movie);
                              }}
                              title={watchNextMovies.some(wm => wm.id === movie.id) ? "Remove from Watch Next" : "Add to Watch Next"}
                              aria-label="Toggle Watch Next"
                            >
                              <svg 
                                className="star-icon" 
                                viewBox="0 0 24 24" 
                                fill={watchNextMovies.some(wm => wm.id === movie.id) ? "currentColor" : "none"}
                                stroke="currentColor"
                              >
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="boxset-movie-info">
                        <h6 className="boxset-movie-title" title={movie.title}>
                          ({movie.collection_order || index + 1}) {movie.title}
                        </h6>
                        <p className="boxset-movie-year">
                          {movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Popover.Body>
          </Popover>
        </Overlay>
      )}
    </>
  );
};

export default BoxSetStack;

