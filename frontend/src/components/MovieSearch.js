import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import apiService from '../services/api';
import MovieForm from './MovieForm';
import MovieThumbnail from './MovieThumbnail';
import MovieDetailCard from './MovieDetailCard';
import CircularProgressBar from './CircularProgressBar';
import './MovieSearch.css';

const MovieSearch = forwardRef(({ refreshTrigger }, ref) => {
  const [movies, setMovies] = useState([]);
  const [searchCriteria, setSearchCriteria] = useState({
    searchText: '',
    format: ''
  });
  
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMovie, setEditingMovie] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedMovieDetails, setSelectedMovieDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [movieDetailsBeforeEdit, setMovieDetailsBeforeEdit] = useState(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    handleAddMovieClick,
    handleExportCSVClick,
  }));

  useEffect(() => {
    loadFormats();
    loadAllMovies();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadAllMovies();
    }
  }, [refreshTrigger]);

  useEffect(() => {
    // Real-time search with debouncing
    const timeoutId = setTimeout(() => {
      handleSearch(searchCriteria);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [searchCriteria]);

  // Handle ESC key press for modals
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (showExportModal) {
          setShowExportModal(false);
        } else if (editingMovie) {
          setEditingMovie(null);
        } else if (showAddForm) {
          setShowAddForm(false);
        } else if (selectedMovieDetails) {
          setSelectedMovieDetails(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExportModal, editingMovie, showAddForm, selectedMovieDetails]);

  const loadFormats = async () => {
    try {
      const formats = await apiService.getFormats();
      setFormats(formats);
    } catch (err) {
      console.error('Failed to load formats:', err);
    }
  };

  const loadAllMovies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getAllMovies();
      setMovies(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (criteria) => {
    try {
      setLoading(true);
      setError(null);
      
      // Filter out empty criteria
      const filteredCriteria = Object.keys(criteria).reduce((acc, key) => {
        if (criteria[key]) {
          acc[key] = criteria[key];
        }
        return acc;
      }, {});

      const data = await apiService.searchMovies(filteredCriteria);
      setMovies(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleEditMovie = async (movie) => {
    try {
      setLoadingDetails(true);
      setError(null);
      const details = await apiService.getMovieDetails(movie.id);
      // Store the current details before editing
      setMovieDetailsBeforeEdit(selectedMovieDetails);
      setEditingMovie(details);
      setSelectedMovieDetails(null); // Close details view
    } catch (err) {
      setError('Failed to load movie details for editing: ' + err.message);
      // Fallback to basic movie data if details fetch fails
      setMovieDetailsBeforeEdit(selectedMovieDetails);
      setEditingMovie(movie);
      setSelectedMovieDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleAddMovieClick = () => {
    setShowAddForm(true);
  };

  const handleFormCancel = () => {
    setShowAddForm(false);
    setEditingMovie(null);
    // Restore the details view if we were editing from details
    if (movieDetailsBeforeEdit) {
      setSelectedMovieDetails(movieDetailsBeforeEdit);
      setMovieDetailsBeforeEdit(null);
    }
  };

  const handleFormSave = async () => {
    setShowAddForm(false);
    setEditingMovie(null);
    await loadAllMovies();
    
    // Restore the details view with updated data if we were editing from details
    if (movieDetailsBeforeEdit) {
      try {
        // Reload the details with updated data
        const updatedDetails = await apiService.getMovieDetails(movieDetailsBeforeEdit.id);
        setSelectedMovieDetails(updatedDetails);
        setMovieDetailsBeforeEdit(null);
      } catch (err) {
        console.error('Failed to reload movie details after save:', err);
        // Fallback to the original details
        setSelectedMovieDetails(movieDetailsBeforeEdit);
        setMovieDetailsBeforeEdit(null);
      }
    }
  };

  const handleExportCSVClick = async () => {
    try {
      setError(null);
      
      const blob = await apiService.exportCSV();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'movies.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to export CSV: ' + err.message);
    }
  };


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSearchCriteria(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMovieClick = async (movieId) => {
    try {
      setLoadingDetails(true);
      setError(null);
      const details = await apiService.getMovieDetails(movieId);
      setSelectedMovieDetails(details);
    } catch (err) {
      setError('Failed to load movie details: ' + err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getRatingPercentage = (rating, maxRating = 10) => {
    if (!rating || rating === 'N/A') return 0;
    return Math.min(Math.max((parseFloat(rating) / maxRating) * 100, 0), 100);
  };

  const getRatingColor = (rating, maxRating = 10) => {
    if (!rating || rating === 'N/A') return '#3a3a3a';
    
    const percentage = (parseFloat(rating) / maxRating) * 100;
    
    // Red to green continuum based on score
    if (percentage >= 80) {
      return '#22c55e'; // Excellent - bright green
    } else if (percentage >= 70) {
      return '#4ade80'; // Very good - medium green
    } else if (percentage >= 60) {
      return '#6ee7b7'; // Good - light green
    } else if (percentage >= 50) {
      return '#86efac'; // Fair - pale green
    } else if (percentage >= 40) {
      return '#a7f3d0'; // Below average - very pale green
    } else if (percentage >= 30) {
      return '#fbbf24'; // Poor - amber
    } else if (percentage >= 20) {
      return '#f59e0b'; // Very poor - orange
    } else {
      return '#ef4444'; // Terrible - red
    }
  };

  const getCombinedScore = (movie) => {
    const ratings = [];
    
    // Add TMDB rating (weighted 40%)
    if (movie.tmdb_rating && movie.tmdb_rating !== 'N/A') {
      ratings.push({ score: parseFloat(movie.tmdb_rating), weight: 0.4, max: 10 });
    }
    
    // Add IMDB rating (weighted 35%)
    if (movie.imdb_rating && movie.imdb_rating !== 'N/A') {
      ratings.push({ score: parseFloat(movie.imdb_rating), weight: 0.35, max: 10 });
    }
    
    // Add Rotten Tomatoes rating (weighted 25%, convert to 10-point scale)
    if (movie.rotten_tomato_rating && movie.rotten_tomato_rating !== 'N/A') {
      const rtScore = parseFloat(movie.rotten_tomato_rating) / 10; // Convert % to 10-point scale
      ratings.push({ score: rtScore, weight: 0.25, max: 10 });
    }
    
    if (ratings.length === 0) return null;
    
    // Calculate weighted average
    const totalWeight = ratings.reduce((sum, rating) => sum + rating.weight, 0);
    const weightedSum = ratings.reduce((sum, rating) => sum + (rating.score * rating.weight), 0);
    
    return weightedSum / totalWeight;
  };

  const formatRating = (rating) => {
    return rating ? rating.toString() : '-';
  };

  const formatPercentage = (rating) => {
    return rating ? `${rating}%` : '-';
  };

  const handleCloseDetails = () => {
    setSelectedMovieDetails(null);
  };

  const handleDeleteMovie = async (movieId) => {
    try {
      await apiService.deleteMovie(movieId);
      // Close the detail view since the movie no longer exists
      setSelectedMovieDetails(null);
      // Refresh the movie list
      await loadAllMovies();
      setMessage('Movie deleted successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError('Failed to delete movie: ' + error.message);
    }
  };

  return (
    <div className="movie-search">
      <div className="search-simple">
          <div className="search-field-large">
            <div className="search-input-container">
              <input
                type="text"
                name="searchText"
                value={searchCriteria.searchText}
                onChange={(e) => {
                  setSearchCriteria(prev => ({ ...prev, searchText: e.target.value }));
                }}
                placeholder="Search by movie title or director..."
                className="search-input-large"
              />
              {loading && <div className="search-loading-indicator">⟳</div>}
            </div>
          </div>
          
          <div className="search-field-format">
            <select
              name="format"
              value={searchCriteria.format}
              onChange={handleInputChange}
              className="format-select"
            >
              <option value="">All formats</option>
              {formats.map((format, index) => (
                <option key={index} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </div>
        </div>

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      {loadingDetails && <div className="loading-details">Loading movie details...</div>}

      <div className="movies-results">
        <h3>Results ({movies ? movies.length : 0} movies)</h3>
        {loading ? (
          <div className="loading">Loading movies...</div>
        ) : (
          <div className="movies-grid">
            {movies && movies.map((movie) => (
              <div key={movie.id} className="movie-card-compact" onClick={() => handleMovieClick(movie.id)}>
                <div className="movie-poster-compact">
                  <MovieThumbnail 
                    imdbLink={movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}` : movie.imdb_link} 
                    title={movie.title}
                    year={movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year}
                    className="movie-thumbnail-compact"
                    disableZoom={true}
                    posterPath={movie.poster_path}
                  />
                </div>
                
                <div className="movie-info-compact">
                  <div className="movie-header-compact">
                    <h4 title={movie.title}>{movie.title}</h4>
                    <div className="movie-meta">
                      {(movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year) && 
                        <span className="movie-year">({movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year})</span>
                      }
                      {movie.format && <span className="format-badge">{movie.format}</span>}
                    </div>
                  </div>
                  
                  <div className="movie-content-compact">
                    <div className="movie-details-left">
                      {movie.director && (
                        <div className="detail-row">
                          <span className="detail-label">Directed by</span>
                          <span className="detail-value">{movie.director}</span>
                        </div>
                      )}
                      
                      {movie.genres && movie.genres.length > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">Genres</span>
                          <span className="detail-value">{movie.genres.join(', ')}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="movie-details-center">
                      {movie.runtime && (
                        <div className="detail-row">
                          <span className="detail-label">Runtime</span>
                          <span className="detail-value">{movie.runtime}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="movie-details-right">
                      {(() => {
                        const combinedScore = getCombinedScore(movie);
                        if (combinedScore) {
                          return (
                            <div className="detail-row">
                              <span className="detail-label">Score</span>
                              <span className="detail-value score-value" style={{ color: getRatingColor(combinedScore, 10) }}>
                                {combinedScore.toFixed(1)}/10
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Movie Form */}
      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <MovieForm onSave={handleFormSave} onCancel={handleFormCancel} />
          </div>
        </div>
      )}

      {/* Edit Movie Form */}
      {editingMovie && (
        <div className="modal-overlay">
          <div className="modal-content">
            <MovieForm movie={editingMovie} onSave={handleFormSave} onCancel={handleFormCancel} />
          </div>
        </div>
      )}


      {/* Movie Detail Card */}
      {selectedMovieDetails && (
        <MovieDetailCard 
          movieDetails={selectedMovieDetails} 
          onClose={handleCloseDetails}
          onEdit={handleEditMovie}
          onDelete={handleDeleteMovie}
        />
      )}

    </div>
  );
});

export default MovieSearch;
