import React, { useState, useEffect } from 'react';
import apiService from '../services/api';
import './UnmatchedMovies.css';

const UnmatchedMovies = ({ importId, onImportComplete, setCurrentStep }) => {
  const [unmatchedMovies, setUnmatchedMovies] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isProcessingResolved, setIsProcessingResolved] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  const [ignoredMovies, setIgnoredMovies] = useState(new Set());
  const [searchingMovie, setSearchingMovie] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchYear, setSearchYear] = useState('');
  const [expandedMovies, setExpandedMovies] = useState(new Set());

  useEffect(() => {
    if (importId) {
      checkImportStatus();
    }
  }, [importId, checkImportStatus]);

  const checkImportStatus = async () => {
    try {
      setIsLoading(true);
      const status = await apiService.getImportStatus(importId);
      setUnmatchedMovies(status.unmatchedMovies || []);
      
      if (status.status === 'COMPLETED') {
        onImportComplete();
      } else {
        // Load suggestions for all unmatched movies
        await loadSuggestionsForAllMovies(status.unmatchedMovies || []);
      }
    } catch (error) {
      console.error('Error checking import status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSuggestionsForAllMovies = async (movies) => {
    const suggestionsData = {};
    const selectedData = {};
    
    for (const movie of movies) {
      try {
        const result = await apiService.getMovieSuggestions(importId, movie.original_title || movie.title);
        const movieSuggestions = result.suggestions || [];
        suggestionsData[movie.title] = movieSuggestions;
        
        // Auto-select the first suggestion if available
        if (movieSuggestions.length > 0) {
          selectedData[movie.title] = movieSuggestions[0];
        }
      } catch (error) {
        console.error(`Error loading suggestions for ${movie.title}:`, error);
        suggestionsData[movie.title] = [];
      }
    }
    
    setSuggestions(suggestionsData);
    setSelectedSuggestions(selectedData);
  };

  const handleContinueProcessing = async () => {
    try {
      setIsResolving(true);
      
      // Process all movies with selected suggestions
      for (const movie of unmatchedMovies) {
        const selectedSuggestion = selectedSuggestions[movie.title];
        if (selectedSuggestion && !ignoredMovies.has(movie.title)) {
          // Convert TMDB suggestion to movie data format
          const resolvedMovie = {
            id: selectedSuggestion.id, // TMDB ID is required!
            title: selectedSuggestion.title,
            original_title: selectedSuggestion.original_title,
            release_date: selectedSuggestion.releaseDate,
            media_type: selectedSuggestion.mediaType, // Include media type for proper API routing
            genre: '', // Will be filled by backend
            director: '', // Will be filled by backend
            cast: [], // Will be filled by backend
            format: movie.csvData?.format || '',
            price: movie.csvData?.price ? parseFloat(movie.csvData.price) : null,
            comments: movie.csvData?.comments || '',
            never_seen: false,
            acquired_date: new Date().toISOString().split('T')[0]
          };

          await apiService.resolveMovie(importId, movie.title, resolvedMovie);
        }
      }
      
      // Mark ignored movies as resolved (but not processed) in the backend
      for (const movieTitle of ignoredMovies) {
        try {
          await apiService.ignoreMovie(importId, movieTitle);
        } catch (error) {
          console.error(`Error ignoring movie ${movieTitle}:`, error);
        }
      }
      
      // All movies processed, trigger processing phase to complete the import
      // This will show the processing screen while the backend finishes
      setIsProcessingResolved(true);
      setCurrentStep('processing');
      
      // Poll for completion
      const pollForCompletion = async () => {
        try {
          const response = await apiService.makeRequest(`/import/${importId}`);
          if (response.ok) {
            const status = await response.json();
            if (status.status === 'COMPLETED') {
              onImportComplete();
            } else {
              // Continue polling
              setTimeout(pollForCompletion, 2000);
            }
          }
        } catch (error) {
          console.error('Error polling for completion:', error);
          // Fallback to completion after error
          onImportComplete();
        }
      };
      
      // Start polling after a short delay
      setTimeout(pollForCompletion, 1000);
    } catch (error) {
      console.error('Error processing movies:', error);
      alert('Failed to process some movies. Please try again.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleSearchMovie = (movieTitle) => {
    // Find the movie to get original title
    const movie = unmatchedMovies.find(m => m.title === movieTitle);
    const searchTitle = movie?.original_title || movieTitle;
    
    setSearchingMovie(movieTitle);
    setSearchQuery(searchTitle);
    setSearchYear('');
    
    // Load initial suggestions
    performSearch(searchTitle, null);
  };

  const performSearch = async (query, year) => {
    if (!query.trim()) return;
    
    try {
      setIsLoading(true);
      const result = await apiService.getMovieSuggestions(importId, query, year);
      const movieSuggestions = result.suggestions || [];
      
      if (searchingMovie) {
        setSuggestions(prev => ({
          ...prev,
          [searchingMovie]: movieSuggestions
        }));
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      performSearch(searchQuery.trim(), searchYear || null);
    }
  };

  const handleSuggestionSelect = (suggestion) => {
    if (searchingMovie) {
      setSelectedSuggestions(prev => ({
        ...prev,
        [searchingMovie]: suggestion
      }));
      setSearchingMovie(null);
      setSearchQuery('');
      setSearchYear('');
    }
  };

  const handleCancelSearch = () => {
    setSearchingMovie(null);
    setSearchQuery('');
    setSearchYear('');
  };

  const toggleExpanded = (movieTitle) => {
    setExpandedMovies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(movieTitle)) {
        newSet.delete(movieTitle);
      } else {
        newSet.add(movieTitle);
      }
      return newSet;
    });
  };

  const handleIgnoreMovie = (movieTitle) => {
    setIgnoredMovies(prev => new Set([...prev, movieTitle]));
    setSelectedSuggestions(prev => {
      const newSelected = { ...prev };
      delete newSelected[movieTitle];
      return newSelected;
    });

    // Check if all movies are resolved or ignored
    const remainingMovies = unmatchedMovies.filter(movie => 
      movie.title !== movieTitle && !ignoredMovies.has(movie.title)
    );
    if (remainingMovies.length === 0) {
      onImportComplete();
    }
  };

  const handleUndoIgnore = (movieTitle) => {
    setIgnoredMovies(prev => {
      const newSet = new Set(prev);
      newSet.delete(movieTitle);
      return newSet;
    });
    
    // Refresh the import status to get updated statistics
    checkImportStatus();
  };



  if (isLoading && unmatchedMovies.length === 0) {
    return (
      <div className="unmatched-movies">
        <div className="loading">Checking import status...</div>
      </div>
    );
  }

  // Check if all movies are resolved or ignored
  const resolvedMovies = unmatchedMovies.filter(movie => !ignoredMovies.has(movie.title));
  const allResolved = resolvedMovies.length === 0;

  if (allResolved) {
    return (
      <div className="unmatched-movies">
        <div className="no-unmatched">
          <h3>🎉 All movies processed!</h3>
          <p>All movies from your CSV file have been processed.</p>
          <div className="completion-actions">
            <button 
              onClick={onImportComplete}
              className="next-button"
            >
              Continue to Import Summary
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show processing screen when resolving movies
  if (isProcessingResolved) {
    return (
      <div className="unmatched-movies">
        <div className="processing-content">
          <div className="spinner"></div>
          <h3>Processing resolved movies...</h3>
          <p>We're enriching your resolved movies with information from TMDB and OMDB.</p>
          <p>This may take a few moments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="unmatched-movies">
      <div className="unmatched-header">
        <h3>Resolve Conflicting Movies</h3>
        <p>{unmatchedMovies.length} movie(s) need resolution</p>
      </div>

      <div className="movies-resolution-list">
        {unmatchedMovies.map((movie, index) => {
          const movieSuggestions = suggestions[movie.title] || [];
          const selectedSuggestion = selectedSuggestions[movie.title];
          const isIgnored = ignoredMovies.has(movie.title);
          
          return (
            <div key={index} className={`movie-resolution-item ${isIgnored ? 'ignored' : ''}`}>
              <div className="movie-info">
                <h4>{movie.title}</h4>
                {movie.original_title && movie.original_title !== movie.title && (
                  <p className="original-title">({movie.original_title})</p>
                )}
                {movie.error && (
                  <p className="error-message">Error: {movie.error}</p>
                )}
              </div>

              <div className="movie-suggestions">
                {searchingMovie === movie.title ? (
                  <div className="search-interface">
                    <form onSubmit={handleSearchSubmit} className="search-form">
                      <div className="search-inputs">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search for movie title..."
                          className="search-input"
                          autoFocus
                        />
                        <input
                          type="number"
                          value={searchYear}
                          onChange={(e) => setSearchYear(e.target.value)}
                          placeholder="Year (optional)"
                          className="year-input"
                          min="1900"
                          max="2030"
                        />
                        <button type="submit" className="search-button" disabled={isLoading}>
                          {isLoading ? 'Searching...' : 'Search'}
                        </button>
                        <button 
                          type="button" 
                          onClick={handleCancelSearch}
                          className="cancel-button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                    
                    {movieSuggestions.length > 0 && (
                      <div className="search-results">
                        <h5>Select a match:</h5>
                        <div className="suggestions-list">
                          {movieSuggestions.map((suggestion, suggestionIndex) => (
                            <div 
                              key={suggestionIndex}
                              className="suggestion-item"
                              onClick={() => handleSuggestionSelect(suggestion)}
                            >
                              <div className="suggestion-poster">
                                {suggestion.posterPath ? (
                                  <img 
                                    src={suggestion.posterPath.startsWith('/images/') 
                                      ? suggestion.posterPath
                                      : `https://image.tmdb.org/t/p/w92${suggestion.posterPath}`
                                    }
                                    alt={suggestion.title}
                                    className="poster-image"
                                  />
                                ) : (
                                  <div className="no-poster">No Image</div>
                                )}
                              </div>
                              <div className="suggestion-details">
                                <div className="suggestion-title">{suggestion.title}</div>
                                {suggestion.original_title && suggestion.original_title !== suggestion.title && (
                                  <div className="suggestion-original-title">({suggestion.original_title})</div>
                                )}
                                <div className="suggestion-year">
                                  {suggestion.releaseDate ? new Date(suggestion.releaseDate).getFullYear() : 'Unknown Year'}
                                </div>
                                <div className="suggestion-rating">⭐ {suggestion.voteAverage?.toFixed(1) || 'N/A'}</div>
                                {suggestion.overview && (
                                  <div className="suggestion-overview">{suggestion.overview}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : movieSuggestions.length > 0 ? (
                  <div className="suggestions-container">
                    <div className="suggestions-list">
                      {(() => {
                        const isExpanded = expandedMovies.has(movie.title);
                        const currentSelectedSuggestion = selectedSuggestion;
                        const selectedIndex = currentSelectedSuggestion ? movieSuggestions.findIndex(s => s.id === currentSelectedSuggestion.id) : 0;
                        const selectedMovie = movieSuggestions[selectedIndex];
                        const otherSuggestions = movieSuggestions.filter((_, index) => index !== selectedIndex);
                        const visibleSuggestions = isExpanded ? movieSuggestions : [selectedMovie, ...otherSuggestions.slice(0, 2)];
                        
                        return visibleSuggestions.map((suggestion, suggestionIndex) => (
                          <div 
                            key={suggestion.id}
                            className={`suggestion-item ${currentSelectedSuggestion?.id === suggestion.id ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedSuggestions(prev => ({
                                ...prev,
                                [movie.title]: suggestion
                              }));
                            }}
                          >
                            <div className="suggestion-poster">
                              {suggestion.posterPath ? (
                                <img 
                                  src={suggestion.posterPath.startsWith('/images/') 
                                    ? suggestion.posterPath
                                    : `https://image.tmdb.org/t/p/w92${suggestion.posterPath}`
                                  }
                                  alt={suggestion.title}
                                  className="poster-image"
                                />
                              ) : (
                                <div className="no-poster">No Image</div>
                              )}
                            </div>
                            <div className="suggestion-details">
                              <div className="suggestion-title">{suggestion.title}</div>
                              <div className="suggestion-year">
                                {suggestion.releaseDate ? new Date(suggestion.releaseDate).getFullYear() : 'Unknown Year'}
                              </div>
                              <div className="suggestion-rating">⭐ {suggestion.voteAverage?.toFixed(1) || 'N/A'}</div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    
                    {movieSuggestions.length > 3 && (
                      <button 
                        className="show-more-button"
                        onClick={() => toggleExpanded(movie.title)}
                      >
                        {expandedMovies.has(movie.title) ? 'Show Less' : `... Show ${movieSuggestions.length - 3} More`}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="no-suggestions">
                    <p>No suggestions found. Click "Search..." to find a movie.</p>
                  </div>
                )}
              </div>

              <div className="movie-actions">
                {isIgnored ? (
                  <div className="ignored-status">
                    <span className="ignored-text">Ignored</span>
                    <button 
                      onClick={() => handleUndoIgnore(movie.title)}
                      className="undo-button"
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => handleSearchMovie(movie.title)}
                      className="search-button"
                      disabled={isLoading}
                    >
                      Search...
                    </button>
                    <button 
                      onClick={() => handleIgnoreMovie(movie.title)}
                      className="ignore-button"
                      disabled={isResolving}
                    >
                      Ignore
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bulk-actions">
        <button 
          onClick={handleContinueProcessing}
          className="continue-processing-button"
          disabled={isResolving}
        >
          Continue processing...
        </button>
      </div>
    </div>
  );
};

export default UnmatchedMovies;