import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import AutocompleteInput from '../components/AutocompleteInput';
import MovieForm from '../components/MovieForm';
import './AddMovie.css';

const AddMovie = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Search for movies using TMDB API
  const searchMovies = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      // Search TMDB for movies and TV shows to add (not local database)
      const results = await apiService.searchAllTMDB(query);
      setSearchResults(results);
    } catch (err) {
      setError('Failed to search movies: ' + err.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input change with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        searchMovies(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Helper function to construct Rotten Tomatoes link
  const constructRottenTomatoesLink = (title, releaseDate) => {
    if (!title) return '';
    
    // Convert title to Rotten Tomatoes URL format
    let urlTitle = title
      .toLowerCase()
      .replace(/^the\s+/, '') // Remove "the" from the beginning
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters but keep hyphens
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/-/g, '_') // Replace hyphens with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
    
    return `https://www.rottentomatoes.com/m/${urlTitle}`;
  };

  const handleMovieSelect = async (movie) => {
    try {
      // Just populate the form with the selected movie data, don't add to collection yet
      const movieData = {
        title: movie.title,
        original_title: movie.original_title || '',
        original_language: movie.original_language || '',
        release_date: movie.release_date || '',
        overview: movie.overview || '',
        poster_path: movie.poster_path || '',
        backdrop_path: movie.backdrop_path || '',
        vote_average: movie.vote_average || '',
        vote_count: movie.vote_count || '',
        popularity: movie.popularity || '',
        tmdb_id: movie.id,
        genre: movie.genre_ids ? await getGenresFromIds(movie.genre_ids) : '',
        imdb_rating: movie.vote_average ? movie.vote_average.toString() : '',
        rotten_tomato_rating: '',
        plot: movie.overview || '',
        imdb_id: '',
        rotten_tomatoes_link: constructRottenTomatoesLink(movie.title, movie.release_date),
        format: 'Blu-ray',
        acquired_date: new Date().toISOString().split('T')[0],
        price: '',
        director: '',
        cast: ''
      };

      setSelectedMovie(movieData);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.warn('Failed to process movie selection:', error);
      setError('Failed to select movie: ' + error.message);
    }
  };

  // Helper function to get genre names from TMDB genre IDs
  const getGenresFromIds = async (genreIds) => {
    try {
      const genres = await apiService.getTMDBGenres();
      const genreMap = {};
      genres.forEach(genre => {
        genreMap[genre.id] = genre.name;
      });
      return genreIds.map(id => genreMap[id]).filter(Boolean).join(', ');
    } catch (error) {
      console.warn('Failed to fetch genres:', error);
      return '';
    }
  };

  const handleManualEntry = () => {
    setShowManualForm(true);
    setSelectedMovie(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleBackToSearch = () => {
    setShowManualForm(false);
    setSelectedMovie(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleMovieSave = () => {
    // Navigate back to movies list or show success message
    navigate('/');
  };

  const handleCancel = () => {
    navigate('/');
  };

  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is
    if (posterPath.startsWith('/images/')) {
      return posterPath; // Use relative path
    }
    // Fallback to TMDB URL for backward compatibility
    return `https://image.tmdb.org/t/p/w200${posterPath}`;
  };

  if (showManualForm) {
    return (
      <div className="add-movie-page">
        <div className="add-movie-header">
          <h1>Add New Movie - Manual Entry</h1>
          <button 
            className="back-to-search-btn"
            onClick={handleBackToSearch}
          >
            ← Back to Search
          </button>
        </div>
        
        <MovieForm
          onSave={handleMovieSave}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  if (selectedMovie) {
    return (
      <div className="add-movie-page">
        <div className="add-movie-header">
          <h1>Add New Movie - Edit Details</h1>
          <button 
            className="back-to-search-btn"
            onClick={handleBackToSearch}
          >
            ← Back to Search
          </button>
        </div>
        
        <div className="selected-movie-info">
          {selectedMovie.poster_path && (
            <img 
              src={getPosterUrl(selectedMovie.poster_path)} 
              alt={selectedMovie.title}
              className="movie-poster"
            />
          )}
          <div className="movie-basic-info">
            <h2>{selectedMovie.title}</h2>
            {selectedMovie.original_title !== selectedMovie.title && (
              <p className="original-title">{selectedMovie.original_title}</p>
            )}
            {selectedMovie.release_date && (
              <p className="release-date">
                {new Date(selectedMovie.release_date).getFullYear()}
              </p>
            )}
            {selectedMovie.overview && (
              <p className="overview">{selectedMovie.overview}</p>
            )}
          </div>
        </div>
        
        <MovieForm
          prefilledData={selectedMovie}
          onSave={handleMovieSave}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="add-movie-page">
      <div className="add-movie-header">
        <h1>Add New Movie</h1>
        <button 
          className="manual-entry-btn"
          onClick={handleManualEntry}
        >
          Manual Entry
        </button>
      </div>

      <div className="search-section">
        <div className="search-input-container">
          <AutocompleteInput
            field="title"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search for a movie..."
            type="text"
          />
          {isSearching && (
            <div className="search-loading">
              <div className="loading-spinner"></div>
              <span>Searching...</span>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="search-results">
            <h3>Search Results</h3>
            <div className="movie-grid">
              {searchResults.map((movie) => (
                <div 
                  key={movie.id} 
                  className="movie-card"
                  onClick={() => handleMovieSelect(movie)}
                >
                  {movie.poster_path && (
                    <img 
                      src={getPosterUrl(movie.poster_path)} 
                      alt={movie.title}
                      className="movie-poster-small"
                    />
                  )}
                  <div className="movie-info">
                    <h4 className="movie-title">{movie.title}</h4>
                    {movie.original_title !== movie.title && (
                      <p className="original-title-small">{movie.original_title}</p>
                    )}
                    {movie.release_date && (
                      <p className="release-year">
                        {new Date(movie.release_date).getFullYear()}
                      </p>
                    )}
                    {movie.vote_average && (
                      <p className="rating">⭐ {movie.vote_average.toFixed(1)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchQuery && searchResults.length === 0 && !isSearching && (
          <div className="no-results">
            <p>No movies found for "{searchQuery}"</p>
            <button 
              className="manual-entry-btn"
              onClick={handleManualEntry}
            >
              Add Manually Instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddMovie;
