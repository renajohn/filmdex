import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { Dropdown } from 'react-bootstrap';
import apiService from '../services/api';
import MovieThumbnail from './MovieThumbnail';
import MovieDetailCard from './MovieDetailCard';
import { 
  BsFilter, 
  BsSortDown, 
  BsChevronDown, 
  BsCheck, 
  BsFilm, 
  BsTv, 
  BsChatText,
  BsThreeDots,
  BsGrid3X3Gap,
  BsX
} from 'react-icons/bs';
// Note: We use popcorn emoji directly instead of an icon import
import './MovieSearch.css';

const MovieSearch = forwardRef(({ refreshTrigger, searchCriteria, loading, setLoading, onShowAlert, onAddMovie }, ref) => {
  const [movies, setMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]); // Store all movies from backend
  const [filteredMovies, setFilteredMovies] = useState([]); // Store filtered movies
  const [sortBy, setSortBy] = useState('title'); // Current sort option
  const [sortLoading, setSortLoading] = useState(false); // Sort loading state
  const [groupBy, setGroupBy] = useState('none'); // Current group option
  const [groupLoading, setGroupLoading] = useState(false); // Group loading state
  const [expandedGroups, setExpandedGroups] = useState(new Set()); // Track expanded groups
  const [expandAllGroups, setExpandAllGroups] = useState(false); // Expand/collapse all state
  const previousSearchTextRef = useRef(''); // Track previous search text to avoid infinite loops
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedMovieDetails, setSelectedMovieDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  const sortMovies = useCallback((moviesToSort, sortOption) => {
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
      case 'ageAsc':
        return sorted.sort((a, b) => {
          const ageA = a.recommended_age ?? 999; // Treat null/undefined as highest (oldest)
          const ageB = b.recommended_age ?? 999;
          return ageA - ageB; // Youngest first
        });
      case 'ageDesc':
        return sorted.sort((a, b) => {
          const ageA = a.recommended_age ?? -1; // Treat null/undefined as lowest (youngest)
          const ageB = b.recommended_age ?? -1;
          return ageB - ageA; // Oldest first
        });
      default:
        return sorted;
    }
  }, []);

  const loadAllMovies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getAllMovies();
      
      setAllMovies(data);
      setFilteredMovies(data);
      // Apply current sort to all movies
      const sorted = sortMovies(data, sortBy);
      setMovies(sorted);
      
      // If we have a selected movie, refresh its details to get updated collection data
      if (selectedMovieDetails?.id) {
        try {
          const updatedDetails = await apiService.getMovieDetails(selectedMovieDetails.id);
          setSelectedMovieDetails(updatedDetails);
        } catch (error) {
          // Failed to refresh selected movie details
        }
      }
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load movies: ' + err.message, 'danger');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, selectedMovieDetails?.id]);

  // Refresh only Watch Next movies
  const refreshWatchNextMovies = useCallback(async () => {
    try {
      const watchNextMovies = await apiService.getWatchNextMovies();
      setWatchNextMovies(watchNextMovies);
    } catch (error) {
      // Failed to refresh Watch Next movies
    }
  }, []);

  // Refresh movie data while preserving current search/filter state
  const refreshMovieData = useCallback(async (skipSelectedMovieRefresh = false) => {
    try {
      const data = await apiService.getAllMovies();
      setAllMovies(data);
      
      // Reapply search if there's a search term
      if (searchCriteria?.searchText) {
        handleSearch(searchCriteria);
      } else {
        // No search, just apply current sort
        const sorted = sortMovies(data, sortBy);
        setMovies(sorted);
        setFilteredMovies(data);
      }
      
      // If we have a selected movie, refresh its details to get updated collection data
      // Skip this if called from detail card to avoid closing/reopening dialog
      if (selectedMovieDetails?.id && !skipSelectedMovieRefresh) {
        try {
          const updatedDetails = await apiService.getMovieDetails(selectedMovieDetails.id);
          setSelectedMovieDetails(updatedDetails);
        } catch (error) {
          console.warn('Failed to refresh selected movie details:', error);
        }
      }
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to refresh movies: ' + err.message, 'danger');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCriteria, sortBy, selectedMovieDetails?.id]);

  // Refresh all movie data including box set status (used by detail view)
  const refreshAllMovieData = useCallback(async (skipSelectedMovieRefresh = false) => {
    try {
      await refreshWatchNextMovies();
      await refreshMovieData(skipSelectedMovieRefresh);
    } catch (error) {
      console.error('Failed to refresh movie data:', error);
    }
  }, [refreshWatchNextMovies, refreshMovieData]);

  // Wrapper for detail card that skips selected movie refresh to avoid dialog closing/reopening
  const refreshForDetailCard = useCallback(async () => {
    await refreshAllMovieData(true);
  }, [refreshAllMovieData]);

  const handleSearch = useCallback(async (criteria) => {
    try {
      setLoading(true);
      
      // If no search text, load all movies, otherwise search
      if (criteria.searchText && criteria.searchText.trim()) {
        // When searching, we need both: all movies for count AND search results for display
        const [allData, searchData] = await Promise.all([
          apiService.getAllMovies(),
          apiService.searchMovies({ searchText: criteria.searchText })
        ]);
        
        setAllMovies(allData); // Keep full collection for count
        setFilteredMovies(searchData);
        const sorted = sortMovies(searchData, sortBy);
        setMovies(sorted);
      } else {
        // No search - load all movies
        const data = await apiService.getAllMovies();
        setAllMovies(data);
        setFilteredMovies(data);
        const sorted = sortMovies(data, sortBy);
        setMovies(sorted);
      }
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to search movies: ' + err.message, 'danger');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    refreshMovies: () => {
      // When refreshing, respect current search criteria
      if (searchCriteria?.searchText && searchCriteria.searchText.trim()) {
        handleSearch(searchCriteria);
      } else {
        loadAllMovies();
      }
    },
  }));

  // Initial load on mount
  useEffect(() => {
    loadAllMovies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Load movies based on search criteria with debouncing
  useEffect(() => {
    const currentSearchText = searchCriteria?.searchText || '';
    
    // Only run if search text has actually changed
    if (currentSearchText !== previousSearchTextRef.current) {
      previousSearchTextRef.current = currentSearchText;
      
      // Debounce search by 200ms
      const timeoutId = setTimeout(() => {
        // Only run search if searchText has a value, otherwise load all
        if (currentSearchText.trim()) {
          handleSearch(searchCriteria);
        } else {
          loadAllMovies();
        }
      }, 200);

      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCriteria?.searchText]); // Only re-run when the actual search text changes

  useEffect(() => {
    if (refreshTrigger) {
      refreshMovieData();
    }
  }, [refreshTrigger, refreshMovieData]);

  // Handle ESC key press for modals
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (showExportModal) {
          setShowExportModal(false);
        } else if (selectedMovieDetails) {
          setSelectedMovieDetails(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExportModal, selectedMovieDetails]);


  // Edit is now handled directly in the detail card - no separate form needed




  const handleMovieClick = async (movieId) => {
    try {
      setLoadingDetails(true);
      const details = await apiService.getMovieDetails(movieId);
      setSelectedMovieDetails(details);
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load movie details: ' + err.message, 'danger');
      }
    } finally {
      setLoadingDetails(false);
    }
  };


  // Reusable movie card renderer
  const renderMovieCard = (movie) => {
    return (
      <div key={movie.id} className="movie-card-compact" onClick={() => handleMovieClick(movie.id)}>
        <div className="movie-poster-compact">
          <MovieThumbnail 
            imdbLink={movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}` : movie.imdb_link} 
            title={movie.title}
            year={movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year}
            className="movie-thumbnail-compact"
            disableZoom={true}
            posterPath={movie.poster_path}
            recommendedAge={null}
          />
          <div className="poster-info-hover">
            {movie.recommended_age != null && (
              <span className="age-badge-hover">{movie.recommended_age}+</span>
            )}
            {movie.format && (
              <span className="format-badge-hover">
                {movie.format === 'Blu-ray 4K' ? '4K' : 
                 movie.format === 'Blu-ray' ? 'BR' : 
                 movie.format === 'DVD' ? 'DVD' : 
                 movie.format === 'Digital' ? 'DIG' : 
                 movie.format.substring(0, 3).toUpperCase()}
              </span>
            )}
          </div>
          {!searchCriteria?.searchText && (
            <button 
              className={`watch-next-badge-toggle ${watchNextMovies.some(wm => wm.id === movie.id) ? 'active' : ''}`}
              onClick={(e) => handleWatchNextToggle(e, movie)}
              title={watchNextMovies.some(wm => wm.id === movie.id) ? "Remove from Watch Next" : "Add to Watch Next"}
              aria-label="Toggle Watch Next"
            >
              <svg 
                className="star-icon" 
                viewBox="0 0 24 24" 
                fill={watchNextMovies.some(wm => wm.id === movie.id) ? "currentColor" : "none"}
                stroke="currentColor"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="movie-info-compact">
          <div className="movie-header-compact">
            <h4 title={`${movie.title} (${movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year || ''})`}>
              <span className="movie-title-text">{movie.title}</span>
              {(movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year) && 
                <span className="movie-year-inline"> ({movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year})</span>
              }
            </h4>
            {(() => {
              const collectionParts = [];
              
              // Priority 1: Box set
              if (movie.has_box_set && movie.box_set_name) {
                collectionParts.push(`${movie.box_set_name} box set`);
              }
              
              // Priority 2: User collections
              if (movie.collection_names && movie.collection_names.length > 0) {
                const collectionsText = movie.collection_names.map(name => `${name} collection`).join(', ');
                collectionParts.push(collectionsText);
              }
              
              if (collectionParts.length > 0) {
                return (
                  <div className="movie-collection-info" title={`Part of ${collectionParts.join(', ')}`}>
                    Part of {collectionParts.join(', ')}
            </div>
                );
              }
              return null;
            })()}
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
    );
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
      
      // Apply current sort to updated data
      const sorted = sortMovies(updatedMovies, sortBy);
      setMovies(sorted);
      setFilteredMovies(updatedMovies);
      
      if (onShowAlert) {
        onShowAlert('Movie deleted successfully', 'success');
      }
    } catch (error) {
      if (onShowAlert) {
        onShowAlert('Failed to delete movie: ' + error.message, 'danger');
      }
    }
  };

  const handleWatchNextToggle = async (e, movie) => {
    e.stopPropagation(); // Prevent opening movie details
    
    // Check if movie is currently in Watch Next
    const isCurrentlyInWatchNext = watchNextMovies.some(m => m.id === movie.id);
    const newWatchNextValue = !isCurrentlyInWatchNext;
    const isAdding = newWatchNextValue; // true if adding to watch next
    
    // Check if this is the last movie in watch next
    const isLastMovie = isCurrentlyInWatchNext && watchNextMovies.length === 1;
    
    // Handle removal animation in background (non-blocking)
    if (!isAdding && isCurrentlyInWatchNext) {
      const cardElement = e.currentTarget.closest('.watch-next-poster-card');
      if (cardElement) {
        cardElement.classList.add('removing');
      }
      
      // If this is the last movie, also animate the banner closing
      if (isLastMovie) {
        const bannerElement = document.querySelector('.watch-next-banner');
        if (bannerElement) {
          bannerElement.classList.add('closing');
        }
      }
    }
    
    // Then make the API call
    try {
      await apiService.toggleWatchNext(movie.id);
      
      // Refresh Watch Next movies after successful toggle
      const updatedWatchNextMovies = await apiService.getWatchNextMovies();
      setWatchNextMovies(updatedWatchNextMovies);
      
    } catch (error) {
      console.error('Error toggling watch next:', error);
      
      if (onShowAlert) {
        onShowAlert('Failed to update Watch Next status', 'danger');
      }
    }
  };

  // Sort functions
  const sortOptions = [
    { value: 'title', label: 'Title' },
    { value: 'titleReverse', label: 'Title - reverse' },
    { value: 'lastAddedFirst', label: 'Last acquired first' },
    { value: 'lastAddedLast', label: 'Last acquired last' },
    { value: 'rating', label: 'Highest rating first' },
    { value: 'ratingLowest', label: 'Lowest rating first' },
    { value: 'ageAsc', label: 'Age - youngest first' },
    { value: 'ageDesc', label: 'Age - oldest first' }
  ];

  const groupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'collection', label: 'Group by Box Set' },
    { value: 'director', label: 'Group by Director' },
    { value: 'genre', label: 'Group by Genre' },
    { value: 'format', label: 'Group by Format' },
    { value: 'decade', label: 'Group by Decade' },
    { value: 'ageGroup', label: 'Group by Age Rating' }
  ];

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

  // Grouping functions
  const groupMovies = (moviesToGroup, groupOption) => {
    if (groupOption === 'none') {
      return { 'All Movies': moviesToGroup };
    }

    const groups = {};
    
    moviesToGroup.forEach(movie => {
      let groupKeys = [];
      
      switch (groupOption) {
        case 'collection':
          // Box sets are now managed via collections - grouping removed from thumbnail view
          groupKeys = ['All Movies'];
          break;
        case 'director':
          groupKeys = [movie.director || 'Unknown Director'];
          break;
        case 'genre':
          if (movie.genre) {
            // Split comma-separated genres and trim whitespace
            groupKeys = movie.genre.split(',').map(g => g.trim()).filter(g => g.length > 0);
          } else {
            groupKeys = ['Unknown Genre'];
          }
          break;
        case 'format':
          groupKeys = [movie.format || 'Unknown Format'];
          break;
        case 'decade':
          const year = movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year;
          if (year && !isNaN(year)) {
            const decade = Math.floor(year / 10) * 10;
            groupKeys = [`${decade}s`];
          } else {
            groupKeys = ['Unknown Decade'];
          }
          break;
        case 'ageGroup':
          if (movie.recommended_age !== null && movie.recommended_age !== undefined) {
            const age = movie.recommended_age;
            if (age <= 3) {
              groupKeys = ['All Ages (0-3)'];
            } else if (age < 10) {
              groupKeys = ['Children (4-9)'];
            } else if (age <= 14) {
              groupKeys = ['Pre-teens (10-14)'];
            } else {
              groupKeys = ['Teens & Adults (15+)'];
            }
          } else {
            groupKeys = ['Not Rated'];
          }
          break;
        default:
          groupKeys = ['All Movies'];
      }
      
      // Add movie to each group it belongs to
      groupKeys.forEach(groupKey => {
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(movie);
      });
    });

    // Sort groups alphabetically by key
    const sortedGroups = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  };

  const handleGroupChange = async (groupOption) => {
    setGroupBy(groupOption);
    setGroupLoading(true);
    
    // Add a small delay to show loading state for better UX
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Apply grouping to current filtered movies
    const grouped = groupMovies(filteredMovies, groupOption);
    
    // If grouping is enabled, expand all groups initially
    if (groupOption !== 'none') {
      const allGroupKeys = Object.keys(grouped);
      setExpandedGroups(new Set(allGroupKeys));
      setExpandAllGroups(true);
    } else {
      setExpandedGroups(new Set());
      setExpandAllGroups(false);
    }
    
    setGroupLoading(false);
  };

  const toggleGroup = (groupKey) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupKey)) {
      newExpandedGroups.delete(groupKey);
    } else {
      newExpandedGroups.add(groupKey);
    }
    setExpandedGroups(newExpandedGroups);
  };

  const toggleAllGroups = () => {
    if (groupBy === 'none') return;
    
    const grouped = groupMovies(filteredMovies, groupBy);
    const allGroupKeys = Object.keys(grouped);
    
    if (expandAllGroups) {
      setExpandedGroups(new Set());
      setExpandAllGroups(false);
    } else {
      setExpandedGroups(new Set(allGroupKeys));
      setExpandAllGroups(true);
    }
  };

  // Get Watch Next movies for banner (already sorted by API)
  const [watchNextMovies, setWatchNextMovies] = useState([]);
  
  useEffect(() => {
    const loadWatchNextMovies = async () => {
      try {
        const movies = await apiService.getWatchNextMovies();
        setWatchNextMovies(movies);
      } catch (error) {
        console.warn('Failed to load Watch Next movies:', error);
        setWatchNextMovies([]);
      }
    };
    
    loadWatchNextMovies();
  }, [refreshTrigger]);

  // Helper function to get poster URL
  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/') || posterPath.startsWith('/api/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${posterPath}`;
    }
    // If it's already a full URL, return as is
    return posterPath;
  };

  return (
    <div className="movie-search">


      {/* Watch Next Banner */}
      {watchNextMovies.length > 0 && !searchCriteria?.searchText && (
        <div className="watch-next-banner">
          <div className="watch-next-banner-header">
            <div className="banner-title-section">
              <svg 
                className="banner-star-icon" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <h2>Watch Next</h2>
              <span className="watch-next-count">{watchNextMovies.length} {watchNextMovies.length === 1 ? 'movie' : 'movies'}</span>
            </div>
          </div>
          <div className="watch-next-carousel">
            <div className="carousel-track">
              {watchNextMovies.map((movie) => (
                <div 
                  key={movie.id} 
                  className="watch-next-poster-card"
                >
                  <button
                    className="remove-from-watch-next"
                    onClick={(e) => handleWatchNextToggle(e, movie)}
                    title="Remove from Watch Next"
                    aria-label="Remove from Watch Next"
                  >
                    <BsX size={20} />
                  </button>
                  <div 
                    className="poster-card-image"
                    onClick={() => handleMovieClick(movie.id)}
                  >
                    {movie.poster_path ? (
                      <img 
                        src={getPosterUrl(movie.poster_path)}
                        alt={movie.title}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.classList.add('no-poster');
                        }}
                      />
                    ) : (
                      <div className="poster-card-placeholder">
                        <BsFilm size={40} />
                      </div>
                    )}
                    <div className="poster-card-overlay">
                      <h3>{movie.title}</h3>
                      <div className="poster-card-meta">
                        {movie.release_date && (
                          <span>{new Date(movie.release_date).getFullYear()}</span>
                        )}
                        {movie.format && <span className="format-tag">{movie.format}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="movies-results">
        <div className="movies-results-header">
          <div className="movies-count-display">
            Showing {filteredMovies.length} of {allMovies.length} movies
          </div>
          
          {/* Dropdowns Container */}
          <div className="dropdowns-container">
            {/* Sort Dropdown */}
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

            {/* Group Dropdown */}
            <Dropdown className="group-dropdown-container">
              <Dropdown.Toggle 
                as="button"
                className={`filter-pill group-dropdown-button ${loading || groupLoading ? 'filter-pill-loading' : ''}`}
                disabled={groupLoading}
              >
                {groupLoading ? (
                  <>
                    <span className="group-loading-spinner"></span>
                    Grouping...
                  </>
                ) : (
                  <>
                    <BsGrid3X3Gap className="group-icon" />
                    {groupOptions.find(opt => opt.value === groupBy)?.label}
                  </>
                )}
              </Dropdown.Toggle>
              
              <Dropdown.Menu className="group-dropdown-menu">
                {groupOptions.map(option => (
                  <Dropdown.Item
                    key={option.value}
                    className={`group-dropdown-item ${groupBy === option.value ? 'active' : ''}`}
                    onClick={() => handleGroupChange(option.value)}
                  >
                    {option.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            {/* Collapse All Button - Only show when grouping is enabled */}
            {groupBy !== 'none' && (
              <button 
                className="collapse-all-btn"
                onClick={toggleAllGroups}
              >
                {expandAllGroups ? 'Collapse All' : 'Expand All'}
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="loading">Loading movies...</div>
        ) : movies.length === 0 ? (
          /* Empty State - Check if it's a search or truly empty database */
          searchCriteria?.searchText && searchCriteria.searchText.trim() ? (
            /* Search returned no results */
            <div className="empty-state">
              <div className="empty-state-icon">🎬</div>
              <h3 className="empty-state-title">No Results Found</h3>
              <p className="empty-state-description">
                No movies match "{searchCriteria.searchText}"
              </p>
              <p className="empty-state-hint">
                Try different keywords or clear your search
              </p>
              <div className="empty-state-collection-info">
                You have <strong>{allMovies.length}</strong> {allMovies.length === 1 ? 'movie' : 'movies'} in your collection
              </div>
            </div>
          ) : (
            /* Database is empty */
            <div className="empty-state">
              <div className="empty-state-icon">🍿</div>
              <h3 className="empty-state-title">Welcome to FilmDex!</h3>
              <p className="empty-state-description">
                Your movie collection is empty. Add your first movie to get started and begin tracking your film library.
              </p>
             
              <button 
                className="btn btn-primary btn-lg mt-4"
                onClick={onAddMovie}
              >
                <BsFilm className="me-2" />
                Add Your First Movie
              </button>
            </div>
          )
        ) : (
          <>
            {/* Movies Grid - Grouped or Ungrouped */}
            {groupBy === 'none' ? (
              <div className={`movies-grid ${sortLoading ? 'sort-loading' : ''}`}>
                {movies && movies.map((movie) => renderMovieCard(movie))}
              </div>
            ) : (
              <div className={`movies-groups ${sortLoading || groupLoading ? 'sort-loading' : ''}`}>
                {(() => {
                  const grouped = groupMovies(filteredMovies, groupBy);
                  
                  // Sort group keys logically for age groups
                  const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
                    if (groupBy === 'ageGroup') {
                      // Custom sorting for age groups: logical order
                      const ageGroupOrder = {
                        'All Ages (0-3)': 1,
                        'Children (4-9)': 2,
                        'Pre-teens (10-14)': 3,
                        'Teens & Adults (15+)': 4,
                        'Not Rated': 5
                      };
                      
                      const orderA = ageGroupOrder[a] || 999;
                      const orderB = ageGroupOrder[b] || 999;
                      return orderA - orderB;
                    }
                    return a.localeCompare(b);
                  });
                  
                  return sortedGroupKeys.map((groupKey) => {
                    const groupMovies = grouped[groupKey];
                    const isExpanded = expandedGroups.has(groupKey);
                    const sortedGroupMovies = sortMovies(groupMovies, sortBy);
                    
                    return (
                      <div key={groupKey} className="movie-group">
                        <div 
                          className="group-header"
                          onClick={() => toggleGroup(groupKey)}
                        >
                          <div className="group-title">
                            <BsChevronDown className={`group-chevron ${isExpanded ? 'expanded' : ''}`} />
                            <span>{groupKey}</span>
                            <span className="group-count">({groupMovies.length})</span>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="movies-grid">
                            {sortedGroupMovies.map((movie) => renderMovieCard(movie))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Movie Detail Card */}
      {(selectedMovieDetails || loadingDetails) && (
        <MovieDetailCard 
          movieDetails={selectedMovieDetails} 
          loading={loadingDetails}
          onClose={handleCloseDetails}
          onDelete={handleDeleteMovie}
          onShowAlert={onShowAlert}
          onRefresh={refreshForDetailCard}
          onMovieClick={handleMovieClick}
        />
      )}

    </div>
  );
});

export default MovieSearch;
