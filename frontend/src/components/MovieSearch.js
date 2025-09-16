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
                  <div className="movie-title-compact">
                    <h4 title={movie.title}>{movie.title}</h4>
                    {(movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year) && 
                      <span className="movie-year">({movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year})</span>
                    }
                    {movie.format && <span className="format-badge">{movie.format}</span>}
                  </div>
                  
                  
                  <div className="movie-ratings-compact">
                    {movie.imdb_rating && (
                      <div className="rating-item-compact" title={`IMDB Rating: ${movie.imdb_rating}/10`}>
                        <CircularProgressBar 
                          percentage={getRatingPercentage(movie.imdb_rating, 10)} 
                          color="#f5c518"
                          size="small"
                          className="imdb-progress"
                        />
                        <span className="rating-text">{formatRating(movie.imdb_rating)}</span>
                      </div>
                    )}
                    
                    {movie.rotten_tomato_rating && (
                      <div className="rating-item-compact" title={`Rotten Tomatoes: ${movie.rotten_tomato_rating}%`}>
                        <CircularProgressBar 
                          percentage={getRatingPercentage(movie.rotten_tomato_rating, 100)} 
                          color="#fa320a"
                          size="small"
                          className="rt-progress"
                        />
                        <span className="rating-text">{formatPercentage(movie.rotten_tomato_rating)}</span>
                      </div>
                    )}
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
