import React, { useState, useRef, useEffect } from 'react';
import apiService from '../services/api';
import './AddMovieDialog.css';

const AddMovieDialog = ({ isOpen, onClose, initialMode = 'collection', onSuccess, onMovieAdded }) => {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [mode, setMode] = useState(initialMode);
  const [currentStep, setCurrentStep] = useState(1); // 1: Search, 2: Collection Info
  
  const [formData, setFormData] = useState({
    title: '',
    year: '',
    format: 'Blu-ray 4K',
    price: '',
    acquired_date: new Date().toISOString().split('T')[0],
    comments: ''
  });

  const searchInputRef = useRef(null);

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      console.log('=== DIALOG OPENING ===');
      console.log('initialMode:', initialMode);
      setMode(initialMode);
      setCurrentStep(1);
      const newFormData = {
        title: '',
        year: '',
        format: 'Blu-ray 4K',
        price: '',
        acquired_date: new Date().toISOString().split('T')[0],
        comments: ''
      };
      console.log('Setting formData to:', newFormData);
      setFormData(newFormData);
      setSelectedMovie(null);
      setSearchResults([]);
    }
  }, [isOpen, initialMode]);

  // Debug: Log formData changes
  useEffect(() => {
    console.log('formData changed:', formData);
  }, [formData]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    console.log(`Input changed - ${name}:`, value);
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      console.log('Updated formData:', newData);
      return newData;
    });
  };

  const searchMovies = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    try {
      console.log('Searching for:', query);
      const results = await apiService.searchAllTMDB(query);
      console.log('Search results:', results);
      
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
    
    // Debounce search
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      searchMovies(query);
    }, 300);
  };

  const handleMovieSelect = (movie) => {
    // Allow selection - we'll show existing editions as info
    setSelectedMovie(movie);
    setFormData(prev => ({
      ...prev,
      // Always use the selected movie's title when a movie is selected
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : ''
    }));
    setSearchResults([]);
    setCurrentStep(2); // Move to collection info step
  };

  const handleBackToSearch = () => {
    setSelectedMovie(null);
    setFormData(prev => ({
      ...prev,
      title: '',
      year: ''
    }));
    setCurrentStep(1); // Go back to search step
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      return;
    }

    // Trim title before validation and submission
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
            `⚠️ This exact edition already exists in your ${statusText}. Please change the title or format to add a different edition.`,
            'danger'
          );
        }
        return;
      }
    }

    setLoading(true);

    try {
      console.log('=== FORM SUBMISSION ===');
      console.log('Current formData:', formData);
      console.log('formData.format:', formData.format);
      
      const movieData = {
        title: trimmedTitle,
        year: formData.year ? parseInt(formData.year) : null,
        format: formData.format,
        price: formData.price ? parseFloat(formData.price) : null,
        acquired_date: formData.acquired_date,
        comments: formData.comments,
        title_status: mode === 'wishlist' ? 'wish' : 'owned',
        // Add the selected movie data so backend knows which TMDB movie to use
        tmdb_id: selectedMovie?.id,
        tmdb_data: selectedMovie
      };

      console.log('Sending movie data:', movieData);
      const result = await apiService.addMovie(movieData);
      
      // Call onMovieAdded callback with success message
      if (onMovieAdded) {
        const successMessage = selectedMovie?.existingStatus === 'wish' && mode === 'collection'
          ? `"${formData.title}" moved from your wishlist to your collection!`
          : `Movie added successfully to your ${mode === 'wishlist' ? 'wish list' : 'collection'}!`;
        onMovieAdded(successMessage, 'success');
      }
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(result);
      }
      
      // Auto-close the dialog
      handleClose();
      
    } catch (err) {
      console.error('Error adding movie:', err);
      
      // Try to get more detailed error information
      let errorMessage = 'Failed to add movie';
      
      // Check if it's a duplicate edition error (409 status)
      if (err.status === 409 && err.code === 'DUPLICATE_EDITION') {
        errorMessage = '⚠️ A movie with this title, format, and TMDB ID already exists in your collection. To add a different edition, please use a unique title (e.g., add "Director\'s Cut", "Extended Edition") or choose a different format.';
      } else if (err.status === 409) {
        // Other 409 conflicts
        errorMessage = '⚠️ ' + (err.data?.error || err.message || 'This movie already exists');
      } else if (err.data?.error) {
        // Show specific error message from server
        errorMessage = err.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Call onMovieAdded callback with error message
      if (onMovieAdded) {
        onMovieAdded(errorMessage, 'danger');
      }
      
      // Keep the dialog open so user can see the error and fix it
      // Don't call handleClose()
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
      {/* Loading Overlay - positioned over entire dialog overlay */}
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
            ×
          </button>
        </div>

        <div className="add-movie-dialog-content">
          {/* Step Indicator */}
              <div className="step-indicator">
                <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
                  <span className="step-number">1</span>
                  <span className="step-label">Search Movie</span>
                </div>
                <div className="step-connector"></div>
                <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
                  <span className="step-number">2</span>
                  <span className="step-label">Collection Info</span>
                </div>
              </div>

              {currentStep === 1 ? (
                /* Step 1: Search Movie */
                <div className="step-content">
                  <h3>Search for a Movie</h3>
                  <p className="step-description">Find the movie you want to add to your collection.</p>
                  
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
                        {searchResults.map((movie) => {
                            const hasEditions = movie.hasEditions && movie.existingEditions.length > 0;
                            
                            return (
                              <div
                                key={movie.id}
                                className={`search-result-item ${hasEditions ? 'has-editions' : ''}`}
                                onClick={() => handleMovieSelect(movie)}
                              >
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
                    
                    {!searching && searchResults.length === 0 && formData.title.length >= 2 && (
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
                        <div className="selected-movie-poster">
                          {selectedMovie.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w185${selectedMovie.poster_path}`}
                              alt={selectedMovie.title}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="no-poster-large">No Image</div>
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
                        placeholder="e.g., Amélie (Director's Cut)"
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
                        key={`format-${formData.format}`} // Force re-render when format changes
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
