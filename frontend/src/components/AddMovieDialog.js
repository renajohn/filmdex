import React, { useState, useRef, useEffect, useCallback } from 'react';
import apiService from '../services/api';
import InlinePosterSelector from './InlinePosterSelector';
import './AddMovieDialog.css';

const AddMovieDialog = ({ isOpen, onClose, initialMode = 'collection', onSuccess, onMovieAdded }) => {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [mode, setMode] = useState(initialMode);
  const [currentStep, setCurrentStep] = useState(0); // 0: Cover Scan, 1: Search, 2: Collection Info
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const [customPosterUrl, setCustomPosterUrl] = useState(null);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const [posterLoading, setPosterLoading] = useState(false);
  const posterRef = useRef(null);

  // Cover scan state
  const [coverImage, setCoverImage] = useState(null); // base64
  const [coverPreview, setCoverPreview] = useState(null); // data URL for preview
  const [coverMimeType, setCoverMimeType] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [coverScanAvailable, setCoverScanAvailable] = useState(null); // null = unknown, true/false
  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    year: '',
    format: 'Blu-ray 4K',
    price: '',
    acquired_date: new Date().toISOString().split('T')[0],
    comments: ''
  });

  const searchInputRef = useRef(null);

  // Check cover scan availability on first open
  useEffect(() => {
    if (isOpen && coverScanAvailable === null) {
      apiService.checkCoverScanHealth()
        .then(health => setCoverScanAvailable(health.available))
        .catch(() => setCoverScanAvailable(false));
    }
  }, [isOpen, coverScanAvailable]);

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setCurrentStep(0);
      const newFormData = {
        title: '',
        year: '',
        format: 'Blu-ray 4K',
        price: '',
        acquired_date: new Date().toISOString().split('T')[0],
        comments: ''
      };
      setFormData(newFormData);
      setSelectedMovie(null);
      setSearchResults([]);
      setCoverImage(null);
      setCoverPreview(null);
      setCoverMimeType(null);
      setScanning(false);
      setScanResult(null);
      setScanError(null);
    }
  }, [isOpen, initialMode]);

  // Focus search input when on step 1
  useEffect(() => {
    if (isOpen && searchInputRef.current && currentStep === 1) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, currentStep]);

  const handleFileSelect = useCallback((file) => {
    if (!file) return;

    // Browsers may not report a MIME type for HEIC/HEIF — infer from extension
    const ext = file.name?.split('.').pop()?.toLowerCase();
    const extMimeMap = { heic: 'image/heic', heif: 'image/heif' };
    const mimeType = file.type || extMimeMap[ext];

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!validTypes.includes(mimeType)) {
      setScanError('Please select a JPG, PNG, WebP, or HEIC image.');
      return;
    }

    setScanError(null);
    setCoverMimeType(mimeType);

    // Resize image to max 1024px before uploading to reduce transfer size
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCoverPreview(resizedDataUrl);
        setCoverImage(resizedDataUrl.split(',')[1]);
        setCoverMimeType('image/jpeg');
      };
      img.onerror = () => {
        // Browser can't decode (e.g. HEIC on non-Safari) — send raw, let server handle it
        setCoverPreview(dataUrl);
        setCoverImage(dataUrl.split(',')[1]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.remove('drag-over');

    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneRef.current?.classList.remove('drag-over');
  }, []);

  const handleScanCover = async () => {
    if (!coverImage) return;

    setScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      const result = await apiService.scanMovieCover(coverImage, coverMimeType);
      setScanResult(result);

      if (result.results && result.results.length > 0) {
        // Pre-load results and advance to step 1
        setSearchResults(result.results);
        setFormData(prev => ({
          ...prev,
          title: result.llm_result?.title || '',
          year: result.llm_result?.year?.toString() || '',
          format: result.suggested_format || prev.format
        }));
        setCurrentStep(1);
      } else {
        setScanError('No TMDB matches found. Try searching by title instead.');
      }
    } catch (err) {
      console.error('Cover scan error:', err);
      if (err.status === 503) {
        setScanError('Cover scan service is not available. Try searching by title instead.');
        setCoverScanAvailable(false);
      } else if (err.status === 422) {
        setScanError('Could not identify the movie from this image. Try a clearer photo or search by title.');
      } else {
        setScanError(err.data?.error || err.message || 'Failed to scan cover. Try searching by title instead.');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const searchMovies = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    try {
      const results = await apiService.searchAllTMDB(query);

      // Check editions for each movie
      const resultsWithStatus = await Promise.all(
        results.map(async (movie) => {
          try {
            const editionsCheck = await apiService.checkMovieEditions(movie.id);
            return {
              ...movie,
              existingEditions: editionsCheck.editions || [],
              hasEditions: editionsCheck.exists,
              editionsCount: editionsCheck.count || 0
            };
          } catch (err) {
            console.error('Error checking editions for movie:', movie.title, err);
            return {
              ...movie,
              existingEditions: [],
              hasEditions: false,
              editionsCount: 0
            };
          }
        })
      );

      setSearchResults(resultsWithStatus);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setFormData(prev => ({ ...prev, title: query }));

    // Clear any scan-loaded results when user starts typing a new search
    if (scanResult) {
      setScanResult(null);
    }

    // Debounce search
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      searchMovies(query);
    }, 300);
  };

  const handleMovieSelect = (movie) => {
    setSelectedMovie(movie);
    setCustomPosterUrl(null);
    setFormData(prev => ({
      ...prev,
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : '',
      // If format was suggested by cover scan, keep it; otherwise keep default
      format: (scanResult?.suggested_format && prev.format === scanResult.suggested_format)
        ? prev.format
        : prev.format
    }));
    setSearchResults([]);
    setCurrentStep(2);
  };

  const handleBackToSearch = () => {
    setSelectedMovie(null);
    setCustomPosterUrl(null);
    setFormData(prev => ({
      ...prev,
      title: scanResult?.llm_result?.title || '',
      year: scanResult?.llm_result?.year?.toString() || ''
    }));
    setCurrentStep(1);
  };

  const handleBackToCoverScan = () => {
    setCurrentStep(0);
    setSearchResults([]);
    // Keep the cover image and any scan results
  };

  const handlePosterClick = () => {
    if (selectedMovie?.id) {
      if (posterRef.current) {
        const posterElement = posterRef.current;
        const dialog = posterRef.current.closest('.add-movie-dialog');

        if (posterElement && dialog) {
          const posterRect = posterElement.getBoundingClientRect();
          const dialogRect = dialog.getBoundingClientRect();
          const scrollTop = dialog.scrollTop || 0;

          setSelectorPosition({
            top: posterRect.bottom - dialogRect.top + scrollTop + 10,
            left: 20,
            right: 20,
            arrowLeft: posterRect.left - dialogRect.left + (posterElement.offsetWidth / 2) - 12
          });
        }
      }
      setShowPosterSelector(prev => !prev);
    }
  };

  const handlePosterSelect = (poster) => {
    const isCustomPoster = poster.isCustom || poster.file_path.startsWith('/images/') || poster.file_path.startsWith('/api/images/');
    const posterUrl = isCustomPoster
      ? `${apiService.getImageBaseUrl()}${poster.file_path}`
      : `https://image.tmdb.org/t/p/original${poster.file_path}`;

    setPosterLoading(true);
    setShowPosterSelector(false);

    const img = new Image();
    img.src = posterUrl;

    img.onload = () => {
      setCustomPosterUrl(posterUrl);
      setPosterLoading(false);
    };

    img.onerror = () => {
      setPosterLoading(false);
      if (onMovieAdded) {
        onMovieAdded('Failed to load poster image', 'danger');
      }
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      return;
    }

    const trimmedTitle = formData.title.trim();

    // Client-side validation: Check if this exact edition already exists
    if (selectedMovie && selectedMovie.existingEditions) {
      const duplicate = selectedMovie.existingEditions.find(
        edition => edition.title === trimmedTitle && edition.format === formData.format
      );

      if (duplicate) {
        const statusText = duplicate.title_status === 'wish' ? 'wishlist' : 'collection';
        if (onMovieAdded) {
          onMovieAdded(
            `This exact edition already exists in your ${statusText}. Please change the title or format to add a different edition.`,
            'danger'
          );
        }
        return;
      }
    }

    setLoading(true);

    try {
      const movieData = {
        title: trimmedTitle,
        year: formData.year ? parseInt(formData.year) : null,
        format: formData.format,
        price: formData.price ? parseFloat(formData.price) : null,
        acquired_date: formData.acquired_date,
        comments: formData.comments,
        title_status: mode === 'wishlist' ? 'wish' : 'owned',
        tmdb_id: selectedMovie?.id,
        tmdb_data: selectedMovie,
        poster_path: customPosterUrl || selectedMovie?.poster_path
      };

      const result = await apiService.addMovie(movieData);

      if (onMovieAdded) {
        const successMessage = selectedMovie?.existingStatus === 'wish' && mode === 'collection'
          ? `"${formData.title}" moved from your wishlist to your collection!`
          : `Movie added successfully to your ${mode === 'wishlist' ? 'wish list' : 'collection'}!`;
        onMovieAdded(successMessage, 'success');
      }

      if (onSuccess) {
        onSuccess(result);
      }

      handleClose();

    } catch (err) {
      console.error('Error adding movie:', err);

      let errorMessage = 'Failed to add movie';

      if (err.status === 409 && err.code === 'DUPLICATE_EDITION') {
        errorMessage = 'A movie with this title, format, and TMDB ID already exists in your collection. To add a different edition, please use a unique title (e.g., add "Director\'s Cut", "Extended Edition") or choose a different format.';
      } else if (err.status === 409) {
        errorMessage = err.data?.error || err.message || 'This movie already exists';
      } else if (err.data?.error) {
        errorMessage = err.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }

      if (onMovieAdded) {
        onMovieAdded(errorMessage, 'danger');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="add-movie-dialog-overlay" onClick={handleClose}>
      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-message">
            {selectedMovie?.existingStatus === 'wish' && mode === 'collection'
              ? `Moving "${formData.title}" from your wishlist to your collection...`
              : `Adding "${formData.title}" to your ${mode === 'wishlist' ? 'wishlist' : 'collection'}...`
            }
          </div>
        </div>
      )}

      <div className="add-movie-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="add-movie-dialog-header">
          <h2>Add Movie</h2>
          <button className="close-button" onClick={loading ? undefined : handleClose} disabled={loading}>
            &times;
          </button>
        </div>

        {/* Inline Poster Selector */}
        <InlinePosterSelector
          movie={selectedMovie}
          isOpen={showPosterSelector}
          onSelectPoster={handlePosterSelect}
          currentPosterPath={customPosterUrl || selectedMovie?.poster_path}
          position={selectorPosition}
        />

        <div className="add-movie-dialog-content">
          {/* Overlay when poster selector is open */}
          {showPosterSelector && (
            <div
              className="poster-selector-overlay"
              onClick={() => setShowPosterSelector(false)}
            />
          )}

          {/* Step Indicator */}
          <div className="step-indicator">
            <div className={`step ${currentStep >= 0 ? 'active' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">Scan Cover</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Confirm Match</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Collection Info</span>
            </div>
          </div>

          {currentStep === 0 ? (
            /* Step 0: Cover Scan */
            <div className="step-content">
              <h3>Scan Movie Cover</h3>
              <p className="step-description">
                Take a photo or upload an image of the movie cover to identify it automatically.
              </p>

              {coverScanAvailable === false && (
                <div className="scan-error">
                  Cover scan service is not available.{' '}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setCoverScanAvailable(null);
                      apiService.checkCoverScanHealth()
                        .then(health => setCoverScanAvailable(health.available))
                        .catch(() => setCoverScanAvailable(false));
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Drop zone / file input */}
              <div
                ref={dropzoneRef}
                className="cover-dropzone"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {coverPreview ? (
                  <div className="cover-preview">
                    <img src={coverPreview} alt="Cover preview" />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary cover-change-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCoverImage(null);
                        setCoverPreview(null);
                        setCoverMimeType(null);
                        setScanResult(null);
                        setScanError(null);
                      }}
                    >
                      Change Image
                    </button>
                  </div>
                ) : (
                  <div className="cover-dropzone-content">
                    <div className="cover-dropzone-icon">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                    <p>Drop a cover image here or click to browse</p>
                    <p className="cover-dropzone-hint">JPG, PNG, WebP, or HEIC</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.heic,.heif"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
              </div>

              {/* Scan button */}
              {coverImage && !scanning && (
                <button
                  type="button"
                  className="btn btn-primary scan-btn"
                  onClick={handleScanCover}
                  disabled={coverScanAvailable === false}
                >
                  Identify Movie
                </button>
              )}

              {/* Scanning status */}
              {scanning && (
                <div className="scan-status">
                  <div className="scan-spinner"></div>
                  <span>Analyzing cover image...</span>
                </div>
              )}

              {/* Scan error */}
              {scanError && (
                <div className="scan-error">
                  {scanError}
                </div>
              )}

              {/* Divider and text search fallback */}
              <div className="scan-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="btn btn-outline-secondary scan-fallback-btn"
                onClick={() => setCurrentStep(1)}
              >
                Search by title
              </button>
            </div>
          ) : currentStep === 1 ? (
            /* Step 1: Search / Confirm Match */
            <div className="step-content">
              {scanResult && scanResult.results?.length > 0 ? (
                <>
                  <h3>Confirm Match</h3>
                  <div className="scan-match-banner">
                    We found <strong>{scanResult.llm_result?.title}</strong>
                    {scanResult.llm_result?.year && <> ({scanResult.llm_result.year})</>}
                  </div>
                </>
              ) : (
                <>
                  <h3>Search for a Movie</h3>
                  <p className="step-description">Find the movie you want to add to your collection.</p>
                </>
              )}

              {/* Back to cover scan */}
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary back-to-scan-btn"
                onClick={handleBackToCoverScan}
              >
                &larr; Back to cover scan
              </button>

              <div className="form-group">
                <label htmlFor="title">Movie Title *</label>
                <input
                  ref={searchInputRef}
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleSearchChange}
                  placeholder="Search for a movie..."
                  required
                  className="form-control"
                />

                {searching && (
                  <div className="search-loading">Searching...</div>
                )}

                {searchResults.length > 0 && (
                  <div className="search-results">
                    {searchResults.map((movie, index) => {
                        const hasEditions = movie.hasEditions && movie.existingEditions?.length > 0;
                        const isBestMatch = scanResult && index === 0;

                        return (
                          <div
                            key={movie.id}
                            className={`search-result-item ${hasEditions ? 'has-editions' : ''} ${isBestMatch ? 'best-match' : ''}`}
                            onClick={() => handleMovieSelect(movie)}
                          >
                            {isBestMatch && (
                              <span className="best-match-badge">Best Match</span>
                            )}
                            <div className="search-result-poster">
                              {movie.poster_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                                  alt={movie.title}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="no-poster">No Image</div>
                              )}
                            </div>
                            <div className="search-result-info">
                              <div className="search-result-title">{movie.title}</div>
                              <div className="search-result-year">
                                {movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown Year'}
                              </div>
                              {movie.overview && (
                                <div className="search-result-overview">
                                  {movie.overview.substring(0, 100)}...
                                </div>
                              )}
                              {hasEditions && (
                                <div className="existing-editions-info">
                                  <strong>Already in your library:</strong>
                                  {movie.existingEditions.map((edition, idx) => (
                                    <div key={idx} className="edition-tag">
                                      <span className="edition-format">{edition.format || 'Unknown'}</span>
                                      {edition.title !== movie.title && (
                                        <span className="edition-variant"> ({edition.title})</span>
                                      )}
                                      <span className={`edition-status ${edition.title_status}`}>
                                        {edition.title_status === 'wish' ? ' - Wishlist' : ' - Owned'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {!searching && searchResults.length === 0 && formData.title.length >= 2 && !scanResult && (
                  <div className="no-results">No movies found. Try a different search term.</div>
                )}
              </div>
            </div>
          ) : (
            /* Step 2: Collection Info */
            <div className="step-content">
              <h3>Collection Information</h3>
              <p className="step-description">Choose whether to add this movie to your collection or wish list, and fill in the details.</p>

              {/* Selected Movie Display */}
              {selectedMovie && (
                <div className="selected-movie-info">
                  <div className="selected-movie-header">
                    <h4>Selected Movie: {selectedMovie.title}</h4>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={handleBackToSearch}
                    >
                      Change Selection
                    </button>
                  </div>

                  <div className="selected-movie-details">
                    <div
                      ref={posterRef}
                      className="selected-movie-poster"
                      onClick={handlePosterClick}
                      style={{ cursor: selectedMovie?.id ? 'pointer' : 'default' }}
                      title={selectedMovie?.id ? 'Click to choose a different poster' : ''}
                    >
                      {(customPosterUrl || selectedMovie.poster_path) ? (
                        <img
                          src={customPosterUrl || `https://image.tmdb.org/t/p/w185${selectedMovie.poster_path}`}
                          alt={selectedMovie.title}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="no-poster-large">No Image</div>
                      )}

                      {posterLoading && (
                        <div className="poster-loading-overlay">
                          <div className="poster-spinner"></div>
                        </div>
                      )}
                    </div>
                    <div className="selected-movie-info-text">
                      <p><strong>Year:</strong> {selectedMovie.release_date ? new Date(selectedMovie.release_date).getFullYear() : 'Unknown'}</p>
                      {selectedMovie.overview && (
                        <p><strong>Overview:</strong> {selectedMovie.overview}</p>
                      )}
                    </div>
                  </div>

                  {/* Show existing editions warning */}
                  {selectedMovie.hasEditions && selectedMovie.existingEditions.length > 0 && (
                    <div className="existing-editions-notice">
                      <strong>You already have this title:</strong>
                      <ul className="editions-list">
                        {selectedMovie.existingEditions.map((edition, idx) => {
                          const isDuplicate = edition.title === formData.title.trim() && edition.format === formData.format;
                          return (
                            <li key={idx} className={isDuplicate ? 'duplicate' : ''}>
                              <div className="edition-info">
                                <strong>{edition.format || 'Unknown format'}</strong>
                                <span className="edition-title-variant"> - {edition.title}</span>
                              </div>
                              <span className={`badge ${edition.title_status === 'wish' ? 'badge-warning' : 'badge-success'}`}>
                                {edition.title_status === 'wish' ? 'Wishlist' : 'Collection'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="help-text"><em>You can add a different edition or format below.</em></p>
                    </div>
                  )}

                  {/* Mode Toggle */}
                  <div className="mode-toggle">
                    <label className="mode-toggle-label">Add to:</label>
                    <div className="btn-group" role="group" aria-label="Add to collection or wish list">
                      <button
                        type="button"
                        className={`btn ${mode === 'collection' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setMode('collection')}
                      >
                        Collection
                      </button>
                      <button
                        type="button"
                        className={`btn ${mode === 'wishlist' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setMode('wishlist')}
                      >
                        Wish List
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="add-movie-form">
                <div className="form-group">
                  <label htmlFor="title">Edition Title *</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g., Am&eacute;lie (Director's Cut)"
                    required
                    className="form-control"
                  />
                  <small className="form-text text-muted">
                    Customize the title to indicate the edition (e.g., "Director's Cut", "Extended Edition", "Anniversary Edition")
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="format">Format</label>
                  <select
                    id="format"
                    name="format"
                    value={formData.format}
                    onChange={handleInputChange}
                    className="form-control"
                    key={`format-${formData.format}`}
                  >
                    <option value="Blu-ray 4K">Blu-ray 4K</option>
                    <option value="Blu-ray">Blu-ray</option>
                    <option value="DVD">DVD</option>
                    <option value="Digital">Digital</option>
                  </select>
                </div>

                {mode === 'collection' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="price">Price</label>
                      <input
                        type="number"
                        step="0.01"
                        id="price"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        placeholder="Price paid"
                        className="form-control"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="acquired_date">Acquired Date</label>
                      <input
                        type="date"
                        id="acquired_date"
                        name="acquired_date"
                        value={formData.acquired_date}
                        onChange={handleInputChange}
                        className="form-control"
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="comments">Comments</label>
                  <textarea
                    id="comments"
                    name="comments"
                    value={formData.comments}
                    onChange={handleInputChange}
                    placeholder="Add any comments..."
                    rows="3"
                    className="form-control"
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || !formData.title.trim()}
                  >
                    {loading ? 'Adding...' :
                      selectedMovie?.existingStatus === 'wish' && mode === 'collection'
                        ? 'Move to Collection'
                        : `Add to ${mode === 'wishlist' ? 'Wish List' : 'Collection'}`
                    }
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default AddMovieDialog;
