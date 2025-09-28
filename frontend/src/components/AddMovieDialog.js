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
      
      // Check status for each movie
      const resultsWithStatus = await Promise.all(
        results.map(async (movie) => {
          try {
            const statusCheck = await apiService.checkMovieStatus(movie.id, movie.title);
            return {
              ...movie,
              existingStatus: statusCheck.exists ? statusCheck.status : null,
              existingMovie: statusCheck.exists ? statusCheck.movie : null
            };
          } catch (err) {
            console.error('Error checking status for movie:', movie.title, err);
            return {
              ...movie,
              existingStatus: null,
              existingMovie: null
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
    // Check if movie is already in wishlist and we're in wishlist mode
    if (movie.existingStatus === 'wish' && mode === 'wishlist') {
      return; // Don't allow selection
    }
    
    // Check if movie is already in collection
    if (movie.existingStatus === 'owned') {
      return; // Don't allow selection
    }
    
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

    setLoading(true);

    try {
      console.log('=== FORM SUBMISSION ===');
      console.log('Current formData:', formData);
      console.log('formData.format:', formData.format);
      
      const movieData = {
        title: formData.title,
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
      // Call onMovieAdded callback with error message
      if (onMovieAdded) {
        onMovieAdded('Failed to add movie: ' + err.message, 'danger');
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
                        {searchResults
                          .sort((a, b) => {
                            // Sort movies already in collection to bottom
                            if (a.existingStatus === 'owned' && b.existingStatus !== 'owned') return 1;
                            if (b.existingStatus === 'owned' && a.existingStatus !== 'owned') return -1;
                            return 0;
                          })
                          .map((movie) => {
                            const isInCollection = movie.existingStatus === 'owned';
                            const isInWishlist = movie.existingStatus === 'wish';
                            const isDisabled = (isInWishlist && mode === 'wishlist') || isInCollection;
                            
                            return (
                              <div
                                key={movie.id}
                                className={`search-result-item ${isInCollection ? 'in-collection' : ''} ${isDisabled ? 'disabled' : ''}`}
                                onClick={() => !isDisabled && handleMovieSelect(movie)}
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
                                  {isInCollection && (
                                    <div className="movie-status-label collection-label">
                                      Already in your collection
                                    </div>
                                  )}
                                  {isInWishlist && (
                                    <div className="movie-status-label wishlist-label">
                                      In your wishlist
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

                      {/* Mode Toggle */}
                      {!(selectedMovie?.existingStatus === 'wish' && mode === 'collection') && (
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
                              className={`btn ${mode === 'wishlist' ? 'btn-primary' : 'btn-outline-secondary'} ${selectedMovie?.existingStatus === 'wish' ? 'disabled' : ''}`}
                              onClick={() => selectedMovie?.existingStatus !== 'wish' && setMode('wishlist')}
                              disabled={selectedMovie?.existingStatus === 'wish'}
                              title={selectedMovie?.existingStatus === 'wish' ? 'This movie is already in your wishlist' : ''}
                            >
                              Wish List
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Move Message */}
                      {selectedMovie?.existingStatus === 'wish' && mode === 'collection' && (
                        <div className="move-message">
                          <i className="fas fa-arrow-right"></i>
                          This will move "{selectedMovie.title}" from your wishlist to your collection
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="add-movie-form">
                    <div className="form-group">
                      <label htmlFor="title">Movie Title *</label>
                      <input
                        type="text"
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="Movie title"
                        required
                        className="form-control"
                      />
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
