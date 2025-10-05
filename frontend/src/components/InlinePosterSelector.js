import React, { useState, useEffect, useRef } from 'react';
import { BsCheckCircleFill, BsCloudUpload } from 'react-icons/bs';
import apiService from '../services/api';
import './InlinePosterSelector.css';

const InlinePosterSelector = ({ movie, isOpen, onSelectPoster, currentPosterPath, position }) => {
  const [posters, setPosters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPoster, setSelectedPoster] = useState(null);
  const [uploadedPoster, setUploadedPoster] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

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
        ) : (
          <div className="inline-poster-grid">
            {/* Upload Card - Always first */}
            <div
              className={`inline-poster-option upload-card ${isDragging ? 'dragging' : ''}`}
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
                    <BsCloudUpload size={36} className="upload-icon" />
                    <span className="upload-text">Upload</span>
                  </>
                )}
              </div>
            </div>

            {/* Uploaded Custom Poster */}
            {uploadedPoster && (
              <div
                className={`inline-poster-option ${selectedPoster === uploadedPoster.file_path ? 'selected' : ''}`}
                onClick={() => handlePosterSelect(uploadedPoster)}
              >
                <img
                  src={`${apiService.getImageBaseUrl()}${uploadedPoster.file_path}`}
                  alt="Custom poster"
                  loading="lazy"
                />
                {selectedPoster === uploadedPoster.file_path && (
                  <div className="inline-selected-indicator">
                    <BsCheckCircleFill size={24} />
                  </div>
                )}
                <div className="inline-poster-info">
                  <span className="inline-poster-language custom-badge">CUSTOM</span>
                </div>
              </div>
            )}

            {/* TMDB Posters */}
            {posters.length === 0 && !uploadedPoster ? (
              <div className="inline-poster-empty-inline">No TMDB posters available</div>
            ) : (
              posters.map((poster, index) => (
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
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InlinePosterSelector;

