import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import './AddMovieSimple.css';

const AddMovieSimple = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    year: '',
    format: 'Blu-ray 4k',
    price: '',
    acquired_date: new Date().toISOString().split('T')[0],
    comments: '',
    never_seen: false
  });

  const searchInputRef = useRef(null);

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
    setError('');

    try {
      const results = await apiService.searchAllTMDB(query);
      setSearchResults(results);
    } catch (err) {
      setError('Failed to search movies: ' + err.message);
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
    setSelectedMovie(movie);
    setFormData(prev => ({
      ...prev,
      // Always use the selected movie's title when a movie is selected
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear().toString() : ''
    }));
    setSearchResults([]);
  };

  const handleBackToSearch = () => {
    setSelectedMovie(null);
    setFormData(prev => ({
      ...prev,
      title: '',
      year: ''
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const movieData = {
        title: formData.title,
        year: formData.year ? parseInt(formData.year) : null,
        format: formData.format,
        price: formData.price ? parseFloat(formData.price) : null,
        acquired_date: formData.acquired_date,
        comments: formData.comments,
        never_seen: formData.never_seen,
        // Add the selected movie data so backend knows which TMDB movie to use
        tmdb_id: selectedMovie?.id,
        tmdb_data: selectedMovie
      };

      console.log('Sending movie data:', movieData);
      const result = await apiService.addMovie(movieData);
      
      setSuccess(true);
      
    } catch (err) {
      setError('Failed to add movie: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  if (success) {
    return (
      <div className="add-movie-simple">
        <div className="success-message">
          <h2>✅ Movie Added Successfully!</h2>
          <p>Your movie has been added to your collection with all the details from TMDB.</p>
          <div className="success-actions">
            <button 
              className="btn btn-primary"
              onClick={() => {
                setSuccess(false);
                setSelectedMovie(null);
                setFormData({
                  title: '',
                  year: '',
                  format: 'Blu-ray 4k',
                  price: '',
                  acquired_date: new Date().toISOString().split('T')[0],
                  comments: '',
                  never_seen: false
                });
                setError('');
                // Focus the search input after state updates
                setTimeout(() => {
                  if (searchInputRef.current) {
                    searchInputRef.current.focus();
                  }
                }, 100);
              }}
            >
              Add Another Movie
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate('/')}
            >
              View Collection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-movie-simple">
      <div className="add-movie-header">
        <h1>Add New Movie</h1>
        <button 
          className="cancel-btn"
          onClick={handleCancel}
          disabled={loading}
        >
          Cancel
        </button>
      </div>

      <div className="add-movie-content">
        <div className="info-box">
          <h3>How it works:</h3>
          <ol>
            <li>Search for the movie in TMDB to see details and preview</li>
            <li>Select the correct movie from the search results</li>
            <li>Fill in your collection details (format, price, etc.)</li>
            <li>Click "Add Movie" - we'll automatically fetch all the details from TMDB</li>
          </ol>
        </div>

        {!selectedMovie ? (
          <div className="search-section">
            <h3>Search for Movie</h3>
            
            <div className="search-input-container">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for a movie..."
                value={formData.title}
                onChange={handleSearchChange}
                className="search-input"
              />
              {searching && <div className="search-loading">Searching...</div>}
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                <h4>Search Results</h4>
                <div className="movie-grid">
                  {searchResults.map((movie) => (
                    <div 
                      key={movie.id} 
                      className="movie-card"
                      onClick={() => handleMovieSelect(movie)}
                    >
                      {movie.poster_path && (
                        <img 
                          src={movie.poster_path.startsWith('/images/') 
                            ? movie.poster_path
                            : `https://image.tmdb.org/t/p/w200${movie.poster_path}`
                          }
                          alt={movie.title}
                          className="movie-poster"
                        />
                      )}
                      <div className="movie-info">
                        <h4 className="movie-title">{movie.title}</h4>
                        {movie.original_title !== movie.title && (
                          <p className="original-title">{movie.original_title}</p>
                        )}
                        {movie.release_date && (
                          <p className="release-year">
                            {new Date(movie.release_date).getFullYear()}
                          </p>
                        )}
                        {movie.vote_average && (
                          <p className="rating">⭐ {movie.vote_average.toFixed(1)}</p>
                        )}
                        {movie.overview && (
                          <p className="overview">{movie.overview.substring(0, 100)}...</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="selected-movie-section">
            <div className="selected-movie-header">
              <h3>Selected Movie</h3>
              <button 
                className="back-to-search-btn"
                onClick={handleBackToSearch}
              >
                ← Back to Search
              </button>
            </div>
            
            <div className="selected-movie-info">
              <div className="movie-preview">
                {selectedMovie.poster_path && (
                  <img 
                    src={selectedMovie.poster_path.startsWith('/images/') 
                      ? selectedMovie.poster_path
                      : `https://image.tmdb.org/t/p/w300${selectedMovie.poster_path}`
                    }
                    alt={selectedMovie.title}
                    className="preview-poster"
                  />
                )}
                <div className="preview-details">
                  <h4>{selectedMovie.title}</h4>
                  {selectedMovie.original_title !== selectedMovie.title && (
                    <p className="original-title">({selectedMovie.original_title})</p>
                  )}
                  {selectedMovie.release_date && (
                    <p className="release-year">
                      {new Date(selectedMovie.release_date).getFullYear()}
                    </p>
                  )}
                  {selectedMovie.vote_average && (
                    <p className="rating">⭐ {selectedMovie.vote_average.toFixed(1)}</p>
                  )}
                  {selectedMovie.overview && (
                    <p className="overview">{selectedMovie.overview}</p>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="movie-form">
              <div className="form-section">
                <h3>Your Collection Details</h3>
                
                <div className="form-group">
                  <label htmlFor="title">Title</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="Movie title"
                    required
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="format">Format</label>
                    <select
                      id="format"
                      name="format"
                      value={formData.format}
                      onChange={handleInputChange}
                    >
                      <option value="Blu-ray">Blu-ray</option>
                      <option value="Blu-ray 4K">Blu-ray 4K</option>
                      <option value="DVD">DVD</option>
                      <option value="Digital">Digital</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="price">Price (CHF)</label>
                    <input
                      type="number"
                      id="price"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      placeholder="e.g., 19.99"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="acquired_date">Acquired Date</label>
                    <input
                      type="date"
                      id="acquired_date"
                      name="acquired_date"
                      value={formData.acquired_date}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="comments">Comments</label>
                  <textarea
                    id="comments"
                    name="comments"
                    value={formData.comments}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Personal notes about this movie..."
                  />
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="never_seen"
                      checked={formData.never_seen}
                      onChange={handleInputChange}
                    />
                    <span className="checkbox-text">Never Seen</span>
                  </label>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="cancel-btn"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="add-btn"
                  disabled={loading || !formData.title.trim()}
                >
                  {loading ? 'Adding Movie...' : 'Add Movie'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddMovieSimple;
