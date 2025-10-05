import React, { useState, useEffect, useRef } from 'react';
import CircularProgressBar from './CircularProgressBar';
import AgeDisplay from './AgeDisplay';
import InlinePosterSelector from './InlinePosterSelector';
import apiService from '../services/api';
import { getLanguageName } from '../services/languageCountryUtils';
import { BsX, BsPlay, BsTrash, BsCheck, BsX as BsXIcon, BsArrowClockwise, BsCopy } from 'react-icons/bs';
import './MovieDetailCard.css';

const MovieDetailCard = ({ movieDetails, onClose, onEdit, onDelete, onShowAlert, onRefresh, loading = false }) => {
  const [showTrailer, setShowTrailer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  
  // In-place editing state
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [localMovieData, setLocalMovieData] = useState(movieDetails);
  const [showCopyIcon, setShowCopyIcon] = useState(false);
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const [posterLoading, setPosterLoading] = useState(false);
  const posterRef = useRef(null);
  
  // Initialize local movie data when movieDetails changes
  useEffect(() => {
    setLocalMovieData(movieDetails);
  }, [movieDetails]);
  
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

  // Update local data when movieDetails prop changes
  useEffect(() => {
    setLocalMovieData(movieDetails);
  }, [movieDetails]);

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
  
  if (!movieDetails && !loading) return null;

  // Use local data for display, fallback to original movieDetails
  const currentData = localMovieData || movieDetails;
  
  // Only destructure if we have data (not in loading state)
  const {
    title,
    plot,
    director,
    imdb_rating,
    rotten_tomato_rating,
    rotten_tomatoes_link,
    year,
    release_date,
    format,
    acquired_date,
    poster_path,
    backdrop_path,
    overview,
    genres,
    runtime,
    budget,
    revenue,
    original_title,
    original_language,
    imdb_link,
    tmdb_link,
    tmdb_rating,
    id,
    price,
    comments,
    trailer_key,
    trailer_site,
    recommended_age,
    title_status,
    media_type
  } = currentData || {};

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

  const getRatingColor = (rating, maxRating = 10) => {
    if (!rating || rating === '-') return '#3a3a3a';
    
    const percentage = (parseFloat(rating) / maxRating) * 100;
    
    // Red to green continuum based on score
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


  const getStatusLabel = (status) => {
    switch (status) {
      case 'owned': return 'Owned';
      case 'wish': return 'Wish List';
      case 'to_sell': return 'To Sell';
      default: return 'Unknown';
    }
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
    if (!trailerKey || trailerSite !== 'YouTube') {
      console.log('No trailer available:', { trailerKey, trailerSite });
      return null;
    }
    const embedUrl = `https://www.youtube.com/embed/${trailerKey}?rel=0&modestbranding=1&showinfo=0`;
    console.log('Generated trailer embed URL:', embedUrl);
    return embedUrl;
  };

  const trailerEmbedUrl = getTrailerEmbedUrl(trailer_key, trailer_site);

  // In-place editing functions
  const startEditing = (field, currentValue) => {
    setEditingField(field);
    // Special handling for acquired_date to ensure proper format
    if (field === 'acquired_date' && currentValue) {
      try {
        const date = new Date(currentValue);
        if (!isNaN(date.getTime())) {
          setEditValue(date.toISOString().split('T')[0]);
        } else {
          setEditValue('');
        }
      } catch {
        setEditValue('');
      }
    } else {
      setEditValue(currentValue || '');
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingField) return;
    
    setSaving(true);
    try {
      let updateData;
      
      // Special handling for title_status
      if (editingField === 'title_status') {
        updateData = { title_status: editValue };
        await apiService.updateMovieStatus(id, editValue);
      } else {
        // Map frontend field names to backend field names
        const fieldMapping = {
          'overview': 'plot'
        };
        const backendField = fieldMapping[editingField] || editingField;
        
        updateData = { [backendField]: editValue };
        await apiService.updateMovie(id, updateData);
      }
      
      // Update local data
      setLocalMovieData(prev => ({
        ...prev,
        [editingField]: editValue
      }));
      
      setEditingField(null);
      setEditValue('');
      
      // Refresh the movie list to update thumbnails (without closing detail view)
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error updating movie:', error);
      
      // Check if it's a duplicate edition error (409 status)
      if (error.status === 409 && error.code === 'DUPLICATE_EDITION') {
        if (onShowAlert) {
          onShowAlert('⚠️ A movie with this title, format, and TMDB ID already exists in your collection. To add a different edition, please use a unique title (e.g., add "Director\'s Cut", "Extended Edition") or choose a different format.', 'danger');
        }
      } else if (error.status === 409) {
        // Other 409 conflicts
        if (onShowAlert) {
          onShowAlert('⚠️ ' + (error.data?.error || error.message || 'This movie already exists'), 'danger');
        }
      } else if (error.data?.error) {
        // Show specific error message from server
        if (onShowAlert) {
          onShowAlert('Failed to update: ' + error.data.error, 'danger');
        }
      } else {
        // Generic error
        if (onShowAlert) {
          onShowAlert('Failed to update movie: ' + error.message, 'danger');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const refreshRatings = async () => {
    if (!id) return;
    
    setRefreshingRatings(true);
    try {
      const updatedMovie = await apiService.refreshMovieRatings(id);
      
      setLocalMovieData(prev => ({
        ...prev,
        ...updatedMovie
      }));
      
    } catch (error) {
      console.error('Error refreshing ratings:', error);
      if (onShowAlert) {
        onShowAlert('Failed to refresh ratings. Please try again.', 'danger');
      }
    } finally {
      setRefreshingRatings(false);
    }
  };

  const copyTitleToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(title);
      // Title copied successfully
    } catch (error) {
      console.error('Failed to copy title:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = title;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setDeleting(true);
    try {
      await onDelete(movieDetails.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Error deleting movie:', error);
      if (onShowAlert) {
        onShowAlert('Failed to delete movie. Please try again.', 'danger');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleWatchNextToggle = async (e) => {
    e.stopPropagation();
    
    // Optimistically update the UI immediately
    const previousValue = localMovieData.watch_next;
    const newValue = !previousValue;
    
    setLocalMovieData(prev => ({
      ...prev,
      watch_next: newValue
    }));
    
    try {
      const result = await apiService.toggleWatchNext(movieDetails.id);
      
      // Update with the actual result from the server
      setLocalMovieData(prev => ({
        ...prev,
        watch_next: result.watch_next
      }));
      
      if (onShowAlert) {
        const message = result.watch_next 
          ? `Added "${title}" to Watch Next 🍿` 
          : `Removed "${title}" from Watch Next`;
        onShowAlert(message, 'success');
      }
    } catch (error) {
      console.error('Error toggling watch next:', error);
      
      // Rollback the optimistic update on error
      setLocalMovieData(prev => ({
        ...prev,
        watch_next: previousValue
      }));
      
      if (onShowAlert) {
        onShowAlert('Failed to update Watch Next status', 'danger');
      }
    }
  };

  const handlePosterClick = () => {
    if (currentData.tmdb_id) {
      // Calculate position based on actual poster element dimensions
      if (posterRef.current) {
        const posterElement = posterRef.current.querySelector('.movie-detail-poster');
        const headerElement = posterRef.current.closest('.movie-detail-header');
        const card = posterRef.current.closest('.movie-detail-card');
        
        if (posterElement && headerElement && card) {
          // Get actual computed dimensions (works for all screen sizes)
          const posterRect = posterElement.getBoundingClientRect();
          const headerRect = headerElement.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          
          // Get computed padding from header
          const headerStyles = window.getComputedStyle(headerElement);
          const headerPadding = parseInt(headerStyles.paddingLeft) || 20;
          
          // Account for scroll position
          const scrollTop = card.scrollTop || 0;
          
          setSelectorPosition({
            // Position relative to card's top, accounting for scroll
            top: headerRect.top - cardRect.top + scrollTop + posterElement.offsetHeight + headerPadding + 10,
            left: headerPadding,
            right: headerPadding,
            arrowLeft: posterRect.left - cardRect.left + (posterElement.offsetWidth / 2) - 12 // Center of poster - half arrow width
          });
        }
      }
      setShowPosterSelector(prev => !prev); // Toggle open/close
    }
  };

  const handlePosterSelect = async (poster) => {
    // Check if this is a custom uploaded poster or a TMDB poster
    const isCustomPoster = poster.isCustom || poster.file_path.startsWith('/images/');
    
    // For custom posters, use the file_path directly; for TMDB posters, construct full URL
    const posterUrl = isCustomPoster 
      ? `${apiService.getImageBaseUrl()}${poster.file_path}`
      : `https://image.tmdb.org/t/p/original${poster.file_path}`;
    
    // Show loading spinner immediately
    setPosterLoading(true);
    
    // Close the poster selector immediately
    setShowPosterSelector(false);
    
    // Preload the image
    const img = new Image();
    img.src = posterUrl;
    
    img.onload = async () => {
      // Image loaded, update UI
      setLocalMovieData(prev => ({
        ...prev,
        poster_path: posterUrl
      }));
      
      // Hide spinner
      setPosterLoading(false);
      
      try {
        // For custom posters, the backend already updated the movie record
        // We just need to refresh the UI
        if (isCustomPoster) {
          if (onShowAlert) {
            onShowAlert('Custom poster uploaded successfully', 'success');
          }
          
          // Refresh the movie list to show new poster
          if (onRefresh) {
            onRefresh();
          }
        } else {
          // For TMDB posters, update the movie record
          // Fetch the latest movie data to ensure we have all fields including watch_next
          const latestMovie = await apiService.getMovieById(movieDetails.id);
          
          // Update movie with new poster path - preserve ALL existing fields
          const updateData = {
            ...latestMovie,
            poster_path: posterUrl
          };
          
          await apiService.updateMovie(movieDetails.id, updateData);
          
          if (onShowAlert) {
            onShowAlert('Poster updated successfully', 'success');
          }
          
          // Refresh the movie list to show new poster (without closing detail view)
          if (onRefresh) {
            onRefresh();
          }
        }
      } catch (error) {
        console.error('Error updating poster:', error);
        
        // ROLLBACK: Revert to original poster on error
        setLocalMovieData(prev => ({
          ...prev,
          poster_path: movieDetails.poster_path
        }));
        
        if (onShowAlert) {
          onShowAlert('Failed to update poster', 'danger');
        }
      }
    };
    
    img.onerror = () => {
      // Image failed to load
      setPosterLoading(false);
      if (onShowAlert) {
        onShowAlert('Failed to load poster image', 'danger');
      }
    };
  };

  // Skeleton loading state
  if (loading) {
    return (
      <>
        <div className="movie-detail-overlay" onClick={onClose}>
          <div className="movie-detail-card skeleton-loading" onClick={(e) => e.stopPropagation()}>
            <button className="movie-detail-close" onClick={onClose}>
              <BsX />
            </button>
            
            <div className="movie-detail-content">
              {/* Header Section Skeleton */}
              <div className="movie-detail-header skeleton-header">
                <div className="movie-detail-poster-container">
                  <div className="movie-detail-poster skeleton-poster">
                    <div className="skeleton-placeholder"></div>
                  </div>
                </div>
                
                <div className="movie-detail-main-info">
                  {/* Just the poster placeholder - no other placeholders */}
                </div>
              </div>
              
              {/* Content Section Skeleton */}
              <div className="movie-detail-body">
                <div className="movie-detail-section">
                  <h3 className="section-title skeleton-section-title">
                    <div className="skeleton-placeholder"></div>
                  </h3>
                  <div className="skeleton-placeholder skeleton-plot"></div>
                  <div className="skeleton-placeholder skeleton-plot"></div>
                  <div className="skeleton-placeholder skeleton-plot-short"></div>
                </div>
                
                <div className="movie-detail-section">
                  <h3 className="section-title skeleton-section-title">
                    <div className="skeleton-placeholder"></div>
                  </h3>
                  <div className="skeleton-placeholder skeleton-info"></div>
                  <div className="skeleton-placeholder skeleton-info"></div>
                  <div className="skeleton-placeholder skeleton-info"></div>
                </div>
              </div>
              
              {/* Loading Spinner */}
              <div className="skeleton-loading-spinner">
                <div className="poster-spinner"></div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="movie-detail-overlay" onClick={onClose}>
        <div className="movie-detail-card" onClick={(e) => e.stopPropagation()}>
          <button className="movie-detail-close" onClick={onClose}>
            <BsX />
          </button>

          {/* Inline Poster Selector - positioned relative to card */}
          <InlinePosterSelector
            movie={currentData}
            isOpen={showPosterSelector}
            onSelectPoster={handlePosterSelect}
            currentPosterPath={poster_path}
            position={selectorPosition}
          />
          
          <div className="movie-detail-content">
            {/* Overlay when poster selector is open - covers all content */}
            {showPosterSelector && (
              <div 
                className="poster-selector-overlay"
                onClick={() => setShowPosterSelector(false)}
              />
            )}
            {/* Main Header Section */}
            <div 
              className="movie-detail-header"
              style={{
                '--backdrop-image': backdrop_path 
                  ? `url(${getBackdropUrl(backdrop_path)})` 
                  : 'none'
              }}
            >
              <div className="movie-detail-poster-container" ref={posterRef}>
                <div 
                  className="movie-detail-poster"
                  onClick={handlePosterClick}
                  style={{ cursor: currentData.tmdb_id ? 'pointer' : 'default' }}
                  title={currentData.tmdb_id ? 'Click to change poster' : ''}
                >
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
                  
                  {/* Loading spinner overlay */}
                  {posterLoading && (
                    <div className="poster-loading-overlay">
                      <div className="poster-spinner"></div>
                    </div>
                  )}
                  
                  {/* Watch Next Star Overlay */}
                  <button
                    className={`poster-watch-next-star ${currentData.watch_next ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWatchNextToggle(e);
                    }}
                    title={currentData.watch_next ? 'Remove from Watch Next' : 'Add to Watch Next'}
                    aria-label="Toggle Watch Next"
                  >
                    <svg 
                      className="star-icon" 
                      viewBox="0 0 24 24" 
                      fill={currentData.watch_next ? "currentColor" : "none"}
                      stroke="currentColor"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="movie-detail-main-info">
                <h1 
                  className="movie-detail-title"
                  onMouseEnter={() => setShowCopyIcon(true)}
                  onMouseLeave={() => setShowCopyIcon(false)}
                >
                  {editingField === 'title' ? (
                    <div className="input-group">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="form-control"
                        style={{ fontSize: '2rem', fontWeight: '700', paddingRight: '60px' }}
                      />
                      <div className="input-group-append">
                        <button 
                          className="edit-action-btn" 
                          onClick={saveEdit}
                          disabled={saving}
                          title="Sauver"
                        >
                          <BsCheck size={12} />
                        </button>
                        <button 
                          className="edit-action-btn" 
                          onClick={cancelEditing}
                          title="Annuler"
                        >
                          <BsX size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="title-container">
                      <span 
                        className="editable" 
                        onClick={() => startEditing('title', title)}
                      >
                        {title}
                        {(release_date ? new Date(release_date).getFullYear() : year) && 
                          ` (${release_date ? new Date(release_date).getFullYear() : year})`
                        }
                      </span>
                      {showCopyIcon && (
                        <button 
                          className="copy-title-btn"
                          onClick={copyTitleToClipboard}
                          title="Copier le titre"
                        >
                          <BsCopy size={16} />
                        </button>
                      )}
                    </div>
                  )}
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
                  -
                  <span className="fact-item">
                    <AgeDisplay age={recommended_age} />
                  </span>
                </div>

                {/* Ratings Section */}
                <div className="movie-detail-ratings-section">
                  <div className="ratings-header">
                    <h3>Ratings</h3>
                    <button 
                      className="btn btn-link"
                      onClick={refreshRatings}
                      disabled={refreshingRatings}
                      title="Refresh ratings from external sources"
                    >
                      <BsArrowClockwise className={refreshingRatings ? 'spinning' : ''} />
                    </button>
                  </div>
                  <div className="rating-item tmdb-rating">
                    <a 
                      href={`${tmdb_link}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="rating-link"
                    >
                      <CircularProgressBar 
                        percentage={getRatingPercentage(tmdb_rating, 10)} 
                        color={getRatingColor(tmdb_rating, 10)}
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
                        color={getRatingColor(imdb_rating, 10)}
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
                        percentage={getRatingPercentage(rotten_tomato_rating, 100)} 
                        color={getRatingColor(rotten_tomato_rating, 100)}
                        size="large"
                        className="rt-progress"
                      >
                        <span className="rating-score">{formatPercentage(rotten_tomato_rating)}</span>
                      </CircularProgressBar>
                      <span className="rating-label">RT</span>
                    </a>
                  </div>
                </div>

                {/* Overview */}
                <div className="movie-detail-overview">
                  <h3>Overview</h3>
                  {editingField === 'overview' ? (
                    <div className="input-group">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        rows="4"
                        className="form-control"
                        placeholder="Enter movie overview..."
                        style={{ paddingRight: '60px', resize: 'vertical' }}
                      />
                      <div className="input-group-append">
                        <button 
                          className="edit-action-btn" 
                          onClick={saveEdit}
                          disabled={saving}
                          title="Sauver"
                        >
                          <BsCheck size={12} />
                        </button>
                        <button 
                          className="edit-action-btn" 
                          onClick={cancelEditing}
                          title="Annuler"
                        >
                          <BsX size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p 
                      className="editable" 
                      onClick={() => startEditing('overview', overview || plot)}
                    >
                      {overview || plot || 'Click to add overview...'}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="movie-detail-actions">
                  <div className="action-buttons">
                    {trailerEmbedUrl ? (
                      <button 
                        className="action-btn play-trailer"
                        onClick={() => setShowTrailer(true)}
                      >
                        <BsPlay className="action-icon" />
                        Play Trailer
                      </button>
                    ) : (
                      <button className="action-btn play-trailer" disabled>
                        <BsPlay className="action-icon" />
                        No Trailer Available
                      </button>
                    )}
                    
                    {onDelete && (
                      <button 
                        className="action-btn delete-movie"
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        <BsTrash className="action-icon" />
                        Delete Movie
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
                  <p>{getLanguageName(original_language)}</p>
                  
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
                      {editingField === 'format' ? (
                        <div className="input-group">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="form-select"
                            style={{ paddingRight: '60px' }}
                          >
                            <option value="">Select format</option>
                            <option value="Blu-ray">Blu-ray</option>
                            <option value="Blu-ray 4K">Blu-ray 4K</option>
                            <option value="DVD">DVD</option>
                            <option value="Digital">Digital</option>
                          </select>
                          <div className="input-group-append">
                            <button 
                              className="edit-action-btn" 
                              onClick={saveEdit}
                              disabled={saving}
                              title="Sauver"
                            >
                              <BsCheck size={12} />
                            </button>
                            <button 
                              className="edit-action-btn" 
                              onClick={cancelEditing}
                              title="Annuler"
                            >
                              <BsX size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span 
                          className="fact-value editable" 
                          onClick={() => startEditing('format', format)}
                        >
                          {format || '-'}
                        </span>
                      )}
                    </div>
                    <div className="fact-row">
                      <span className="fact-label">Status:</span>
                      {editingField === 'title_status' ? (
                        <div className="input-group">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="form-select"
                            style={{ paddingRight: '60px' }}
                          >
                            <option value="owned">Owned</option>
                            <option value="wish">Wish List</option>
                            <option value="to_sell">To Sell</option>
                          </select>
                          <div className="input-group-append">
                            <button 
                              className="edit-action-btn" 
                              onClick={saveEdit}
                              disabled={saving}
                              title="Save"
                            >
                              <BsCheck size={12} />
                            </button>
                            <button 
                              className="edit-action-btn" 
                              onClick={cancelEditing}
                              title="Cancel"
                            >
                              <BsX size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span 
                          className="fact-value editable"
                          onClick={() => startEditing('title_status', title_status || 'owned')}
                        >
                          {getStatusLabel(title_status || 'owned')}
                        </span>
                      )}
                    </div>
                    <div className="fact-row">
                      <span className="fact-label">
                        {title_status === 'wish' ? 'Added to Wish List:' : 'Acquired:'}
                      </span>
                      {editingField === 'acquired_date' ? (
                          <div className="input-group">
                            <input
                              type="date"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              autoFocus
                              className="form-control"
                              style={{ paddingRight: '60px' }}
                            />
                            <div className="input-group-append">
                              <button 
                                className="edit-action-btn" 
                                onClick={saveEdit}
                                disabled={saving}
                                title="Sauver"
                              >
                                <BsCheck size={12} />
                              </button>
                              <button 
                                className="edit-action-btn" 
                                onClick={cancelEditing}
                                title="Annuler"
                              >
                                <BsX size={12} />
                              </button>
                            </div>
                          </div>
                      ) : (
                        <span 
                          className="fact-value editable" 
                          onClick={() => startEditing('acquired_date', acquired_date)}
                        >
                          {formatDate(acquired_date)}
                        </span>
                      )}
                    </div>
                    {title_status === 'owned' && (
                      <div className="fact-row">
                        <span className="fact-label">Price:</span>
                        {editingField === 'price' ? (
                          <div className="input-group">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              autoFocus
                              placeholder="0.00"
                              className="form-control"
                              style={{ paddingRight: '60px' }}
                            />
                            <div className="input-group-append">
                              <button 
                                className="edit-action-btn" 
                                onClick={saveEdit}
                                disabled={saving}
                                title="Sauver"
                              >
                                <BsCheck size={12} />
                              </button>
                              <button 
                                className="edit-action-btn" 
                                onClick={cancelEditing}
                                title="Annuler"
                              >
                                <BsX size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span 
                            className="fact-value editable" 
                            onClick={() => startEditing('price', price)}
                          >
                            {formatPrice(price)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Comments Section */}
                <div className="sidebar-section">
                  <h4>Comments</h4>
                  {editingField === 'comments' ? (
                      <div className="input-group">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          rows="3"
                          placeholder="Add your comments..."
                          className="form-control"
                          style={{ paddingRight: '60px', resize: 'vertical' }}
                        />
                        <div className="input-group-append">
                          <button 
                            className="edit-action-btn" 
                            onClick={saveEdit}
                            disabled={saving}
                            title="Sauver"
                          >
                            <BsCheck size={12} />
                          </button>
                          <button 
                            className="edit-action-btn" 
                            onClick={cancelEditing}
                            title="Annuler"
                          >
                            <BsX size={12} />
                          </button>
                        </div>
                      </div>
                  ) : (
                    <p 
                      className="comments-text editable" 
                      onClick={() => startEditing('comments', comments)}
                    >
                      {comments || 'Click to add comments...'}
                    </p>
                  )}
                </div>

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
              <BsX />
            </button>
            <div className="trailer-video-container">
              <iframe
                src={trailerEmbedUrl}
                title={`${title} Trailer`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="trailer-video"
                onError={(e) => {
                  console.error('YouTube iframe error:', e);
                  console.log('Failed URL:', trailerEmbedUrl);
                }}
                onLoad={() => {
                  console.log('YouTube iframe loaded successfully:', trailerEmbedUrl);
                }}
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
                <BsXIcon className="action-icon" />
                Cancel
              </button>
              <button 
                className="delete-btn"
                onClick={handleDelete}
                disabled={deleting}
              >
                <BsTrash className="action-icon" />
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
