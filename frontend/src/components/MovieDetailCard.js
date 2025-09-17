import React, { useState, useEffect } from 'react';
import CircularProgressBar from './CircularProgressBar';
import apiService from '../services/api';
import './MovieDetailCard.css';

const MovieDetailCard = ({ movieDetails, onClose, onEdit, onDelete }) => {
  const [showTrailer, setShowTrailer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  
  // Handle ESC key press for main detail view
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !showTrailer) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTrailer, onClose]);

  // Handle ESC key press for trailer modal
  useEffect(() => {
    if (!showTrailer) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setShowTrailer(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showTrailer]);

  // Load cast and crew data
  useEffect(() => {
    const loadCastAndCrew = async () => {
      if (!movieDetails?.id) return;
      
      try {
        const [castData, crewData] = await Promise.all([
          apiService.getMovieCast(movieDetails.id),
          apiService.getMovieCrew(movieDetails.id)
        ]);
        setCast(castData);
        setCrew(crewData);
      } catch (error) {
        console.warn('Failed to load cast and crew:', error);
      }
    };

    loadCastAndCrew();
  }, [movieDetails?.id]);
  
  if (!movieDetails) return null;

  const {
    title,
    plot,
    genre,
    director,
    imdb_rating,
    rotten_tomatoes_rating,
    rotten_tomatoes_link,
    year,
    release_date,
    format,
    acquired_date,
    poster_path,
    backdrop_path,
    adult,
    overview,
    genres,
    credits,
    videos,
    runtime,
    budget,
    revenue,
    status,
    original_title,
    original_language,
    vote_average,
    vote_count,
    imdb_link,
    tmdb_link,
    tmdb_rating,
    id,
    price,
    comments,
    never_seen,
    trailer_key,
    trailer_site,
    popularity
  } = movieDetails;

  const formatRating = (rating) => {
    return rating ? rating.toString() : '-';
  };

  const formatPercentage = (rating) => {
    return rating ? `${rating}%` : '-';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatRuntime = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatCurrency = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  const getRatingPercentage = (rating, maxRating = 10) => {
    if (!rating || rating === '-') return 0;
    return Math.min(Math.max((parseFloat(rating) / maxRating) * 100, 0), 100);
  };


  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${posterPath}`; // Use dynamic base URL for ingress
    }
   
    // If it's already a full URL, return as is
    return posterPath;
  };

  const getBackdropUrl = (backdropPath) => {
    if (!backdropPath) return null;
    // If it's already a local path, return as is with ingress support
    if (backdropPath.startsWith('/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${backdropPath}`; // Use dynamic base URL for ingress
    }
    return backdropPath; // Use relative path for other cases
  };

  const getProfileUrl = (profilePath) => {
    if (!profilePath) return null;
    // If it's already a local path, return as is with ingress support
    if (profilePath.startsWith('/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${profilePath}`; // Use dynamic base URL for ingress
    }
    return profilePath; // Use relative path for other cases
  };

  const getTrailerUrl = (trailerKey, trailerSite) => {
    if (!trailerKey || trailerSite !== 'YouTube') return null;
    return `https://www.youtube.com/watch?v=${trailerKey}`;
  };

  const getTrailerEmbedUrl = (trailerKey, trailerSite) => {
    if (!trailerKey || trailerSite !== 'YouTube') return null;
    return `https://www.youtube.com/embed/${trailerKey}`;
  };

  const trailerUrl = getTrailerUrl(trailer_key, trailer_site);
  const trailerEmbedUrl = getTrailerEmbedUrl(trailer_key, trailer_site);

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setDeleting(true);
    try {
      await onDelete(movieDetails.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Error deleting movie:', error);
      alert('Failed to delete movie. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="movie-detail-overlay" onClick={onClose}>
        <div className="movie-detail-card" onClick={(e) => e.stopPropagation()}>
          <button className="movie-detail-close" onClick={onClose}>
            ×
          </button>
          
          <div className="movie-detail-content">
            {/* Main Header Section */}
            <div 
              className="movie-detail-header"
              style={{
                '--backdrop-image': backdrop_path 
                  ? `url(${getBackdropUrl(backdrop_path)})` 
                  : 'none'
              }}
            >
              <div className="movie-detail-poster">
                {poster_path ? (
                  <img 
                    src={getPosterUrl(poster_path)} 
                    alt={`${title} poster`}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="movie-detail-poster-placeholder">
                    No Image Available
                  </div>
                )}
              </div>
              
              <div className="movie-detail-main-info">
                <h1 className="movie-detail-title">
                  {title}
                  {(release_date ? new Date(release_date).getFullYear() : year) && 
                    ` (${release_date ? new Date(release_date).getFullYear() : year})`
                  }
                </h1>
                {director && (
                    <span className="fact-item director">
                      Directed by {director}
                    </span>
                  )}
                <div className="movie-detail-facts">
                  <span className="fact-item">
                    {genres}
                  </span>
                  -
                  <span className="fact-item">
                    {formatRuntime(runtime)}
                  </span>
                </div>

                {/* Ratings Section */}
                <div className="movie-detail-ratings-section">
                  <div className="rating-item tmdb-rating">
                    <a 
                      href={`${tmdb_link}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="rating-link"
                    >
                      <CircularProgressBar 
                        percentage={getRatingPercentage(tmdb_rating, 10)} 
                        color="#01b4e4"
                        size="large"
                        className="tmdb-progress"
                      >
                        <span className="rating-score">{tmdb_rating ? tmdb_rating.toFixed(1) : '-'}</span>
                      </CircularProgressBar>
                      <span className="rating-label">TMDB</span>
                    </a>
                  </div>

                  <div className="rating-item imdb-rating">
                    <a 
                      href={imdb_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="rating-link"
                    >
                      <CircularProgressBar 
                        percentage={getRatingPercentage(imdb_rating, 10)} 
                        color="#f5c518"
                        size="large"
                        className="imdb-progress"
                      >
                        <span className="rating-score">{formatRating(imdb_rating)}</span>
                      </CircularProgressBar>
                      <span className="rating-label">IMDB</span>
                    </a>
                  </div>

                  <div className="rating-item rt-rating">
                    <a 
                      href={rotten_tomatoes_link || `https://www.rottentomatoes.com/m/${original_title?.toLowerCase().replace(/[^a-z0-9]/g, '_')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="rating-link"
                    >
                      <CircularProgressBar 
                        percentage={getRatingPercentage(rotten_tomatoes_rating, 100)} 
                        color="#fa320a"
                        size="large"
                        className="rt-progress"
                      >
                        <span className="rating-score">{formatPercentage(rotten_tomatoes_rating)}</span>
                      </CircularProgressBar>
                      <span className="rating-label">RT</span>
                    </a>
                  </div>
                </div>

                {/* Overview */}
                <div className="movie-detail-overview">
                  <h3>Overview</h3>
                  <p>{overview || plot || 'No overview available'}</p>
                </div>

                {/* Action Buttons */}
                <div className="movie-detail-actions">
                  <div className="action-buttons">
                    {trailerEmbedUrl ? (
                      <button 
                        className="action-btn play-trailer"
                        onClick={() => setShowTrailer(true)}
                      >
                        ▶ Play Trailer
                      </button>
                    ) : (
                      <button className="action-btn play-trailer" disabled>
                        ▶ No Trailer Available
                      </button>
                    )}
                    
                    {onEdit && (
                      <button 
                        className="action-btn edit-movie"
                        onClick={() => onEdit(movieDetails)}
                      >
                        ✏️ Edit Movie
                      </button>
                    )}
                    
                    {onDelete && (
                      <button 
                        className="action-btn delete-movie"
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        🗑️ Delete Movie
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="movie-detail-body">
              <div className="movie-detail-main">
                {/* Cast Section */}
                {cast && cast.length > 0 && (
                  <div className="movie-detail-cast">
                    <h3>Top Billed Cast</h3>
                    <div className="cast-horizontal">
                      {cast.slice(0, 6).map((actor, index) => (
                        <div key={index} className="cast-member">
                          {actor.local_profile_path ? (
                            <img 
                              src={getProfileUrl(actor.local_profile_path)} 
                              alt={actor.name}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="cast-placeholder">
                              No Photo
                            </div>
                          )}
                          <div className="cast-info">
                            <span className="cast-name">{actor.name}</span>
                            <span className="cast-character">{actor.character || ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Sidebar */}
              <div className="movie-detail-sidebar">

                {/* Movie Facts */}
                <div className="sidebar-section">
                  <h4>Original Title</h4>
                  <p>{original_title || title}</p>
                  
                  <h4>Original Language</h4>
                  <p>{original_language || 'English'}</p>
                  
                  <h4>Budget</h4>
                  <p>{formatCurrency(budget)}</p>
                  
                  <h4>Revenue</h4>
                  <p>{formatCurrency(revenue)}</p>
                </div>

                {/* Collection Info */}
                <div className="sidebar-section">
                  <h4>Collection Info</h4>
                  <div className="collection-facts">
                    <div className="fact-row">
                      <span className="fact-label">Format:</span>
                      <span className="fact-value">{format || '-'}</span>
                    </div>
                    <div className="fact-row">
                      <span className="fact-label">Acquired:</span>
                      <span className="fact-value">{formatDate(acquired_date)}</span>
                    </div>
                    <div className="fact-row">
                      <span className="fact-label">Price:</span>
                      <span className="fact-value">{formatPrice(price)}</span>
                    </div>
                  </div>
                </div>

                {/* Comments Section */}
                {comments && (
                  <div className="sidebar-section">
                    <h4>Comments</h4>
                    <p className="comments-text">{comments}</p>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trailer Modal - Now rendered at the same level as the main overlay */}
      {showTrailer && trailerEmbedUrl && (
        <div className="trailer-modal-overlay" onClick={() => setShowTrailer(false)}>
          <div className="trailer-modal" onClick={(e) => e.stopPropagation()}>
            <button className="trailer-modal-close" onClick={() => setShowTrailer(false)}>
              ×
            </button>
            <div className="trailer-video-container">
              <iframe
                src={trailerEmbedUrl}
                title={`${title} Trailer`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="trailer-video"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Movie</h3>
            <p>Are you sure you want to delete "{title}" from your collection?</p>
            <p className="delete-warning">This action cannot be undone.</p>
            <div className="delete-confirm-buttons">
              <button 
                className="cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button 
                className="delete-btn"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Movie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MovieDetailCard;
