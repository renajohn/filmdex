import React, { useState, useEffect } from 'react';
import { BsCheckCircleFill } from 'react-icons/bs';
import apiService from '../services/api';
import './InlinePosterSelector.css';

const InlinePosterSelector = ({ movie, isOpen, onSelectPoster, currentPosterPath, position }) => {
  const [posters, setPosters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPoster, setSelectedPoster] = useState(null);

  useEffect(() => {
    const fetchPosters = async () => {
      if (!isOpen) return;
      
      // Support both tmdb_id (from database) and id (from TMDB search)
      const tmdbId = movie.tmdb_id || movie.id;
      
      if (!tmdbId) {
        return;
      }

      setLoading(true);
      try {
        const mediaType = movie.media_type || 'movie';
        const posterData = await apiService.getMoviePosters(tmdbId, mediaType);
        setPosters(posterData);
        
        // Mark current poster as selected
        if (currentPosterPath) {
          const currentPath = currentPosterPath.includes('image.tmdb.org') 
            ? currentPosterPath.split('/').pop()
            : currentPosterPath.replace('/images/posters/', '').replace('.jpg', '');
          setSelectedPoster(currentPath);
        }
      } catch (error) {
        console.error('Error fetching posters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosters();
  }, [isOpen, movie, currentPosterPath]);

  const handlePosterSelect = (poster) => {
    setSelectedPoster(poster.file_path);
    onSelectPoster(poster);
  };

  const getTmdbImageUrl = (path, size = 'w342') => {
    return `https://image.tmdb.org/t/p/${size}${path}`;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="inline-poster-selector"
      style={{
        top: position?.top ? `${position.top}px` : 'calc(20px + 375px + 10px)',
        left: position?.left ? `${position.left}px` : '20px',
        right: position?.right ? `${position.right}px` : '20px'
      }}
    >
      <div 
        className="inline-poster-indicator"
        style={{
          paddingLeft: position?.arrowLeft ? `${position.arrowLeft}px` : 'calc(20px + 125px - 12px)'
        }}
      >
        <div className="indicator-arrow"></div>
      </div>
      
      <div className="inline-poster-content">
        {loading ? (
          <div className="inline-poster-loading">Loading posters...</div>
        ) : posters.length === 0 ? (
          <div className="inline-poster-empty">No posters available</div>
        ) : (
          <div className="inline-poster-grid">
            {posters.map((poster, index) => (
              <div
                key={index}
                className={`inline-poster-option ${selectedPoster === poster.file_path ? 'selected' : ''}`}
                onClick={() => handlePosterSelect(poster)}
              >
                <img
                  src={getTmdbImageUrl(poster.file_path, 'w185')}
                  alt={`Poster ${index + 1}`}
                  loading="lazy"
                />
                {selectedPoster === poster.file_path && (
                  <div className="inline-selected-indicator">
                    <BsCheckCircleFill size={24} />
                  </div>
                )}
                <div className="inline-poster-info">
                  {poster.iso_639_1 && (
                    <span className="inline-poster-language">{poster.iso_639_1.toUpperCase()}</span>
                  )}
                  <span className="inline-poster-resolution">{poster.width}×{poster.height}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InlinePosterSelector;

