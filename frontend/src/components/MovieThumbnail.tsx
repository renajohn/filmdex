import React, { useState, useEffect } from 'react';
import apiService from '../services/api';
import PosterModal from './PosterModal';
import AgeDisplay from './AgeDisplay';
import './MovieThumbnail.css';

interface MovieThumbnailProps {
  imdbLink?: string;
  title?: string;
  year?: string | number;
  className?: string;
  disableZoom?: boolean;
  posterPath?: string | null;
  recommendedAge?: number | null;
  boxSetCount?: number | null;
}

interface ThumbnailResult {
  success: boolean;
  thumbnailUrl?: string;
  source?: string;
  error?: string;
}

const MovieThumbnail: React.FC<MovieThumbnailProps> = ({ imdbLink, title, year, className = '', disableZoom = false, posterPath = null, recommendedAge = null, boxSetCount = null }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [posterSource, setPosterSource] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  const getPosterUrl = (posterPath: string | null | undefined): string | null => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/') || posterPath.startsWith('/api/images/')) {
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

      const result = await apiService.getMovieThumbnail(imdbLink!, title || null, year != null ? String(year) : null) as ThumbnailResult;

      if (result.success) {
        setThumbnailUrl(result.thumbnailUrl || null);
        setPosterSource(result.source || null);
      } else {
        setError(result.error || 'Failed to load thumbnail');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset retry count when props change
    setRetryCount(0);

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

  const handleImageError = () => {
    setError('Failed to load image');
    setThumbnailUrl(null);

    // If it was a local image that failed, try to fetch from external source
    // But only retry once to prevent infinite loops
    if (posterSource === 'local' && imdbLink && retryCount === 0) {
      setRetryCount(1);
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
          onClick={!disableZoom ? handleThumbnailClick : undefined}
          className={`thumbnail-image ${!disableZoom ? 'clickable' : 'no-pointer-events'}`}
          style={disableZoom ? { pointerEvents: 'none' } : undefined}
        />
        {recommendedAge !== null && recommendedAge !== undefined && (
          <AgeDisplay age={recommendedAge} className="age-corner age-small" />
        )}
        {boxSetCount !== null && boxSetCount > 1 && (
          <div className="boxset-count-badge">
            {boxSetCount}
          </div>
        )}
      </div>

      <PosterModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        posterUrl={thumbnailUrl || ''}
        title={title || ''}
        year={year}
        source={posterSource || undefined}
      />
    </>
  );
};

export default MovieThumbnail;
