import React, { useState, useEffect } from 'react';
import { BsX, BsCheckCircleFill } from 'react-icons/bs';
import apiService from '../services/api';
import './PosterSelector.css';

const PosterSelector = ({ movie, onClose, onSelectPoster }) => {
  const [posters, setPosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoster, setSelectedPoster] = useState(null);

  useEffect(() => {
    const fetchPosters = async () => {
      // Support both tmdb_id (from database) and id (from TMDB search)
      const tmdbId = movie.tmdb_id || movie.id;
      
      if (!tmdbId) {
        setLoading(false);
        return;
      }

      try {
        const posterData = await apiService.getMoviePosters(tmdbId);
        setPosters(posterData);
        
        // Mark current poster as selected
        if (movie.poster_path) {
          const currentPosterPath = movie.poster_path.replace('/images/posters/', '').replace('.jpg', '');
          setSelectedPoster(currentPosterPath);
        }
      } catch (error) {
        console.error('Error fetching posters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosters();
  }, [movie]);

  const handlePosterSelect = async (poster) => {
    setSelectedPoster(poster.file_path);
    onSelectPoster(poster);
  };

  const getTmdbImageUrl = (path, size = 'w500') => {
    return `https://image.tmdb.org/t/p/${size}${path}`;
  };

  return (
    <div className="poster-selector-overlay" onClick={onClose}>
      <div className="poster-selector-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="poster-selector-header">
          <h2>Select Poster</h2>
          <button className="close-button" onClick={onClose}>
            <BsX size={24} />
          </button>
        </div>

        {loading ? (
          <div className="poster-selector-loading">Loading posters...</div>
        ) : posters.length === 0 ? (
          <div className="poster-selector-empty">No posters available</div>
        ) : (
          <div className="poster-selector-content">
            <div className="poster-grid">
              {posters.map((poster, index) => (
                <div
                  key={index}
                  className={`poster-option ${selectedPoster === poster.file_path ? 'selected' : ''}`}
                  onClick={() => handlePosterSelect(poster)}
                >
                  <img
                    src={getTmdbImageUrl(poster.file_path, 'w342')}
                    alt={`Poster ${index + 1}`}
                    loading="lazy"
                  />
                  {selectedPoster === poster.file_path && (
                    <div className="selected-indicator">
                      <BsCheckCircleFill size={32} />
                    </div>
                  )}
                  <div className="poster-info">
                    {poster.iso_639_1 && (
                      <span className="poster-language">{poster.iso_639_1.toUpperCase()}</span>
                    )}
                    <span className="poster-resolution">{poster.width}×{poster.height}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PosterSelector;

