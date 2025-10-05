import React, { useState, useEffect, useRef } from 'react';
import { BsX, BsCheckCircleFill, BsCloudUpload } from 'react-icons/bs';
import apiService from '../services/api';
import './PosterSelector.css';

const PosterSelector = ({ movie, onClose, onSelectPoster }) => {
  const [posters, setPosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoster, setSelectedPoster] = useState(null);
  const [uploadedPoster, setUploadedPoster] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchPosters = async () => {
      // Support both tmdb_id (from database) and id (from TMDB search)
      const tmdbId = movie.tmdb_id || movie.id;
      
      if (!tmdbId) {
        setLoading(false);
        return;
      }

      try {
        const mediaType = movie.media_type || 'movie';
        const posterData = await apiService.getMoviePosters(tmdbId, mediaType);
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const dragCounter = useRef(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Process the dropped file
    await processFile(file);
  };

  const processFile = async (file) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      
      // Get movie ID (support both database and TMDB search context)
      const movieId = movie.id || movie.movie_id;
      
      // Upload the file
      const result = await apiService.uploadCustomPoster(movieId, file);
      
      // Create a custom poster object
      const customPoster = {
        file_path: result.posterPath,
        width: result.width || 500,
        height: result.height || 750,
        iso_639_1: 'custom',
        isCustom: true
      };
      
      setUploadedPoster(customPoster);
      setSelectedPoster(result.posterPath);
      onSelectPoster(customPoster);
      
    } catch (error) {
      console.error('Error uploading poster:', error);
      alert(error.message || 'Failed to upload poster. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    await processFile(file);
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

        <div className="poster-selector-content">
          {loading ? (
            <div className="poster-selector-loading">Loading posters...</div>
          ) : (
            <div className="poster-grid">
              {/* Upload Card - Always first */}
              <div
                className={`poster-option upload-card ${isDragging ? 'dragging' : ''}`}
                onClick={handleUploadClick}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <div className="upload-card-content">
                  {uploading ? (
                    <>
                      <div className="upload-spinner"></div>
                      <span className="upload-text">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <BsCloudUpload size={48} className="upload-icon" />
                      <span className="upload-text">Upload Custom</span>
                      <span className="upload-subtext">JPG, PNG, WebP</span>
                    </>
                  )}
                </div>
              </div>

              {/* Uploaded Custom Poster */}
              {uploadedPoster && (
                <div
                  className={`poster-option ${selectedPoster === uploadedPoster.file_path ? 'selected' : ''}`}
                  onClick={() => handlePosterSelect(uploadedPoster)}
                >
                  <img
                    src={`${apiService.getImageBaseUrl()}${uploadedPoster.file_path}`}
                    alt="Custom poster"
                    loading="lazy"
                  />
                  {selectedPoster === uploadedPoster.file_path && (
                    <div className="selected-indicator">
                      <BsCheckCircleFill size={32} />
                    </div>
                  )}
                  <div className="poster-info">
                    <span className="poster-language custom-badge">CUSTOM</span>
                  </div>
                </div>
              )}

              {/* TMDB Posters */}
              {posters.length === 0 && !uploadedPoster ? (
                <div className="poster-selector-empty-inline">No TMDB posters available</div>
              ) : (
                posters.map((poster, index) => (
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
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosterSelector;

