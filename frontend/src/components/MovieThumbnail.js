import React, { useState, useEffect } from 'react';
import apiService from '../services/api';
import PosterModal from './PosterModal';
import './MovieThumbnail.css';

const MovieThumbnail = ({ imdbLink, title, year, className = '', disableZoom = false, posterPath = null }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [posterSource, setPosterSource] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (posterPath) {
      // Use local poster path if available
      setThumbnailUrl(getPosterUrl(posterPath));
      setPosterSource('local');
      setLoading(false);
    } else if (imdbLink) {
      // Fallback to old method for backward compatibility
      fetchThumbnail();
    }
  }, [imdbLink, title, year, posterPath]);

  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${posterPath}`; // Use dynamic base URL for ingress
    }
    // If it's a TMDB path, use TMDB URL
    if (posterPath.startsWith('/')) {
      return `https://image.tmdb.org/t/p/w200${posterPath}`;
    }
    // If it's already a full URL, return as is
    return posterPath;
  };

  const fetchThumbnail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await apiService.getMovieThumbnail(imdbLink, title, year);
      
      if (result.success) {
        setThumbnailUrl(result.thumbnailUrl);
        setPosterSource(result.source);
      } else {
        setError(result.error || 'Failed to load thumbnail');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageError = () => {
    console.log('Image failed to load:', thumbnailUrl);
    setError('Failed to load image');
    setThumbnailUrl(null);
    
    // If it was a local image that failed, try to fetch from external source
    if (posterSource === 'local' && imdbLink) {
      console.log('Local image failed, trying external source...');
      fetchThumbnail();
    }
  };

  const handleImageLoad = () => {
    setError(null);
  };

  const handleThumbnailClick = () => {
    if (thumbnailUrl && !error && !disableZoom) {
      setShowModal(true);
    }
  };

  if (loading) {
    return (
      <div className={`movie-thumbnail loading ${className}`}>
        <div className="thumbnail-placeholder-pulse"></div>
      </div>
    );
  }

  if (error || !thumbnailUrl) {
    return (
      <div className={`movie-thumbnail error ${className}`}>
        <div className="thumbnail-placeholder">
          <div className="error-icon">🎬</div>
          <span>{title || 'Movie'}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`movie-thumbnail ${className}`}>
        <img
          src={thumbnailUrl}
          alt={`${title} poster`}
          onError={handleImageError}
          onLoad={handleImageLoad}
          onClick={handleThumbnailClick}
          className={`thumbnail-image ${!disableZoom ? 'clickable' : ''}`}
        />
      </div>
      
      <PosterModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        posterUrl={thumbnailUrl}
        title={title}
        year={year}
        source={posterSource}
      />
    </>
  );
};

export default MovieThumbnail;
