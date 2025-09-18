import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Dropdown } from 'react-bootstrap';
import apiService from '../services/api';
import MovieForm from './MovieForm';
import MovieThumbnail from './MovieThumbnail';
import MovieDetailCard from './MovieDetailCard';
import CircularProgressBar from './CircularProgressBar';
import { 
  BsFilter, 
  BsSortDown, 
  BsChevronDown, 
  BsX, 
  BsCheck, 
  BsFilm, 
  BsTv, 
  BsChatText,
  BsThreeDots
} from 'react-icons/bs';
import './MovieSearch.css';

const MovieSearch = forwardRef(({ refreshTrigger, searchCriteria, loading, setLoading }, ref) => {
  const [movies, setMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]); // Store all movies from backend
  const [filteredMovies, setFilteredMovies] = useState([]); // Store filtered movies
  const [activeFilters, setActiveFilters] = useState([]); // Store active filter pills
  const [sortBy, setSortBy] = useState('title'); // Current sort option
  const [sortLoading, setSortLoading] = useState(false); // Sort loading state
  const [filterLoading, setFilterLoading] = useState(false); // Filter loading state
  const [showMoreDropdown, setShowMoreDropdown] = useState(false); // More dropdown visibility
  const moreDropdownRef = useRef(null); // Ref for more dropdown
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
    loadAllMovies();
  }, []);

  // Handle click outside more dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(event.target)) {
        setShowMoreDropdown(false);
      }
    };

    if (showMoreDropdown) {
      // Add a small delay to prevent immediate closing
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showMoreDropdown]);

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



  const loadAllMovies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getAllMovies();
      setAllMovies(data);
      setFilteredMovies(data);
      // Apply current sort to all movies
      const sorted = sortMovies(data, sortBy);
      setMovies(sorted);
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
      
      // If no search text, load all movies, otherwise search
      let data;
      if (criteria.searchText && criteria.searchText.trim()) {
        data = await apiService.searchMovies({ searchText: criteria.searchText });
      } else {
        data = await apiService.getAllMovies();
      }
      setAllMovies(data);
      setFilteredMovies(data);
      // Apply current sort to search results
      const sorted = sortMovies(data, sortBy);
      setMovies(sorted);
      setActiveFilters([]); // Reset filters when search changes
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
    // Reapply current filters after loading new data
    applyFilters(activeFilters);
    
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
      
      // Update local state by removing the deleted movie
      const updatedMovies = allMovies.filter(movie => movie.id !== movieId);
      setAllMovies(updatedMovies);
      
      // Apply filters to the updated data
      if (activeFilters.length === 0) {
        setFilteredMovies(updatedMovies);
        setMovies(updatedMovies);
      } else {
        const filtered = updatedMovies.filter(movie => {
          return activeFilters.some(filter => {
            switch (filter.type) {
              case 'movies':
                return movie.media_type === 'movie' || !movie.media_type;
              case 'tvShows':
                return movie.media_type === 'tv';
              case 'comments':
                return movie.comments && movie.comments.trim();
              case 'format':
                return movie.format === filter.value;
              default:
                return false;
            }
          });
        });
        setFilteredMovies(filtered);
        setMovies(filtered);
      }
      
      setMessage('Movie deleted successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError('Failed to delete movie: ' + error.message);
    }
  };

  // Filter functions
  const getFilterCounts = () => {
    const counts = {
      all: allMovies.length,
      movies: allMovies.filter(movie => movie.media_type === 'movie' || !movie.media_type).length,
      tvShows: allMovies.filter(movie => movie.media_type === 'tv').length,
      comments: allMovies.filter(movie => movie.comments && movie.comments.trim()).length,
      formats: {}
    };

    // Count formats
    allMovies.forEach(movie => {
      if (movie.format) {
        counts.formats[movie.format] = (counts.formats[movie.format] || 0) + 1;
      }
    });

    return counts;
  };

  const applyFilters = async (filters) => {
    setFilterLoading(true);
    
    // Add a small delay to show loading state for better UX
    await new Promise(resolve => setTimeout(resolve, 150));
    
    let filtered;
    if (filters.length === 0) {
      filtered = allMovies;
    } else {
      filtered = allMovies.filter(movie => {
        return filters.some(filter => {
          switch (filter.type) {
            case 'movies':
              return movie.media_type === 'movie' || !movie.media_type;
            case 'tvShows':
              return movie.media_type === 'tv';
            case 'comments':
              return movie.comments && movie.comments.trim();
            case 'format':
              return movie.format === filter.value;
            default:
              return false;
          }
        });
      });
    }

    setFilteredMovies(filtered);
    // Apply current sort to filtered movies
    const sorted = sortMovies(filtered, sortBy);
    setMovies(sorted);
    setFilterLoading(false);
  };

  const handleFilterClick = async (filterType, filterValue = null) => {
    if (filterType === 'all') {
      setActiveFilters([]);
      await applyFilters([]);
      return;
    }

    const newFilter = { type: filterType, value: filterValue };
    const filterKey = filterValue ? `${filterType}-${filterValue}` : filterType;
    
    setActiveFilters(prev => {
      const isActive = prev.some(f => 
        f.type === filterType && (filterValue ? f.value === filterValue : true)
      );
      
      if (isActive) {
        // Remove filter
        const newFilters = prev.filter(f => 
          !(f.type === filterType && (filterValue ? f.value === filterValue : true))
        );
        applyFilters(newFilters);
        return newFilters;
      } else {
        // Add filter
        const newFilters = [...prev, newFilter];
        applyFilters(newFilters);
        return newFilters;
      }
    });
  };

  const handleMoreToggle = () => {
    setShowMoreDropdown(!showMoreDropdown);
  };

  const handleMorePillClick = (filterType, filterValue = null) => {
    handleFilterClick(filterType, filterValue);
    setShowMoreDropdown(false);
  };


  // Check if a filter is active
  const isFilterActive = (filterType, filterValue = null) => {
    return activeFilters.some(f => 
      f.type === filterType && (filterValue ? f.value === filterValue : true)
    );
  };

  // Sort functions
  const sortOptions = [
    { value: 'title', label: 'Title' },
    { value: 'titleReverse', label: 'Title - reverse' },
    { value: 'lastAddedFirst', label: 'Last acquired first' },
    { value: 'lastAddedLast', label: 'Last acquired last' },
    { value: 'rating', label: 'Highest rating first' },
    { value: 'ratingLowest', label: 'Lowest rating first' }
  ];

  const sortMovies = (moviesToSort, sortOption) => {
    const sorted = [...moviesToSort];
    
    switch (sortOption) {
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'titleReverse':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case 'lastAddedFirst':
        return sorted.sort((a, b) => new Date(b.acquired_date || b.created_at || b.updated_at) - new Date(a.acquired_date || a.created_at || a.updated_at));
      case 'lastAddedLast':
        return sorted.sort((a, b) => new Date(a.acquired_date || a.created_at || a.updated_at) - new Date(b.acquired_date || b.created_at || b.updated_at));
      case 'rating':
        return sorted.sort((a, b) => {
          const ratingA = getCombinedScore(a) || 0;
          const ratingB = getCombinedScore(b) || 0;
          return ratingB - ratingA; // Higher ratings first
        });
      case 'ratingLowest':
        return sorted.sort((a, b) => {
          const ratingA = getCombinedScore(a) || 0;
          const ratingB = getCombinedScore(b) || 0;
          return ratingA - ratingB; // Lower ratings first
        });
      default:
        return sorted;
    }
  };

  const handleSortChange = async (sortOption) => {
    setSortBy(sortOption);
    setSortLoading(true);
    
    // Add a small delay to show loading state for better UX
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Apply sorting to current filtered movies
    const sorted = sortMovies(filteredMovies, sortOption);
    setMovies(sorted);
    setSortLoading(false);
  };

  return (
    <div className="movie-search">

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      {loadingDetails && <div className="loading-details">Loading movie details...</div>}

      <div className="movies-results">
        <div className="movies-results-header">
          <div className="filter-pills">
            {(() => {
              const counts = getFilterCounts();
              const isAllActive = activeFilters.length === 0;
              const hasFormats = Object.keys(counts.formats).length > 0;
              const hasActiveFormatFilters = activeFilters.some(f => f.type === 'format');
              
              return (
                <>
                  {/* Main Category Pills */}
                  <button
                    className={`filter-pill ${isAllActive ? 'active' : ''} ${loading || filterLoading ? 'filter-pill-loading' : ''} first-child`}
                    onClick={() => handleFilterClick('all')}
                    disabled={filterLoading}
                  >
                    <BsFilter className="filter-icon" />
                    All ({counts.all})
                  </button>
                  
                  {counts.movies > 0 && (
                    <button
                      className={`filter-pill ${activeFilters.some(f => f.type === 'movies') ? 'active' : ''} ${loading || filterLoading ? 'filter-pill-loading' : ''}`}
                      onClick={() => handleFilterClick('movies')}
                      disabled={filterLoading}
                    >
                      <BsFilm className="filter-icon" />
                      Movies ({counts.movies})
                    </button>
                  )}
                  
                  {counts.tvShows > 0 && (
                    <button
                      className={`filter-pill ${activeFilters.some(f => f.type === 'tvShows') ? 'active' : ''} ${loading || filterLoading ? 'filter-pill-loading' : ''}`}
                      onClick={() => handleFilterClick('tvShows')}
                      disabled={filterLoading}
                    >
                      <BsTv className="filter-icon" />
                      TV Shows ({counts.tvShows})
                    </button>
                  )}
                  
                  {counts.comments > 0 && (
                    <button
                      className={`filter-pill ${activeFilters.some(f => f.type === 'comments') ? 'active' : ''} ${loading || filterLoading ? 'filter-pill-loading' : ''}`}
                      onClick={() => handleFilterClick('comments')}
                      disabled={filterLoading}
                    >
                      <BsChatText className="filter-icon" />
                      Comments ({counts.comments})
                    </button>
                  )}
                  
                  {/* More Dropdown for Formats */}
                  {hasFormats && (
                    <div className="more-dropdown-container" ref={moreDropdownRef}>
                      <button
                        className={`filter-pill more-pill ${hasActiveFormatFilters ? 'active' : ''} ${loading || filterLoading ? 'filter-pill-loading' : ''} last-child`}
                        onClick={handleMoreToggle}
                        disabled={filterLoading}
                      >
                        <BsThreeDots className="filter-icon" />
                      </button>
                      
                      {showMoreDropdown && (
                        <div className="more-dropdown-menu">
                          {Object.entries(counts.formats)
                            .filter(([format, count]) => count > 0)
                            .map(([format, count]) => {
                              const isActive = isFilterActive('format', format);
                              return (
                                <button
                                  key={format}
                                  className={`more-dropdown-item ${isActive ? 'active' : ''}`}
                                  onClick={() => handleMorePillClick('format', format)}
                                >
                                  {isActive && <BsCheck className="checkmark" />}
                                  {format} ({count})
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Filter Loading Spinner */}
                  {filterLoading && (
                    <div className="filter-loading-spinner-container">
                      <span className="filter-loading-spinner"></span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          
          {/* Sort Dropdown - Outside filter pills */}
          <Dropdown className="sort-dropdown-container">
            <Dropdown.Toggle 
              as="button"
              className={`filter-pill sort-dropdown-button ${loading || sortLoading ? 'filter-pill-loading' : ''}`}
              disabled={sortLoading}
            >
              {sortLoading ? (
                <>
                  <span className="sort-loading-spinner"></span>
                  Sorting...
                </>
              ) : (
                <>
                  <BsSortDown className="sort-icon" />
                  Sort: {sortOptions.find(opt => opt.value === sortBy)?.label}
                  
                </>
              )}
            </Dropdown.Toggle>
            
            <Dropdown.Menu className="sort-dropdown-menu">
              {sortOptions.map(option => (
                <Dropdown.Item
                  key={option.value}
                  className={`sort-dropdown-item ${sortBy === option.value ? 'active' : ''}`}
                  onClick={() => handleSortChange(option.value)}
                >
                  {option.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </div>
        
        {loading ? (
          <div className="loading">Loading movies...</div>
        ) : (
          <div className={`movies-grid ${sortLoading || filterLoading ? 'sort-loading' : ''}`}>
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
