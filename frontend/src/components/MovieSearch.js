import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { Dropdown } from 'react-bootstrap';
import apiService from '../services/api';
import MovieForm from './MovieForm';
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

const MovieSearch = forwardRef(({ refreshTrigger, searchCriteria, loading, setLoading, onShowAlert }, ref) => {
  const [movies, setMovies] = useState([]);
  const [allMovies, setAllMovies] = useState([]); // Store all movies from backend
  const [filteredMovies, setFilteredMovies] = useState([]); // Store filtered movies
  const [activeFilters, setActiveFilters] = useState([]); // Store active filter pills
  const [sortBy, setSortBy] = useState('title'); // Current sort option
  const [sortLoading, setSortLoading] = useState(false); // Sort loading state
  const [filterLoading, setFilterLoading] = useState(false); // Filter loading state
  const [groupBy, setGroupBy] = useState('none'); // Current group option
  const [groupLoading, setGroupLoading] = useState(false); // Group loading state
  const [expandedGroups, setExpandedGroups] = useState(new Set()); // Track expanded groups
  const [expandAllGroups, setExpandAllGroups] = useState(false); // Expand/collapse all state
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
  }, []);

  const handleSearch = useCallback(async (criteria) => {
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
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    handleAddMovieClick,
    handleExportCSVClick,
    refreshMovies: loadAllMovies,
  }));

  useEffect(() => {
    loadAllMovies();
  }, [loadAllMovies]);

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
  }, [refreshTrigger, loadAllMovies]);

  useEffect(() => {
    // Real-time search with debouncing
    const timeoutId = setTimeout(() => {
      handleSearch(searchCriteria);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [searchCriteria, handleSearch]);

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

  const handleWatchNextToggle = async (e, movie) => {
    e.stopPropagation(); // Prevent opening movie details
    
    const newWatchNextValue = !movie.watch_next;
    
    // Check if this is the last movie in watch next
    const currentWatchNextMovies = allMovies.filter(m => m.watch_next);
    const isLastMovie = movie.watch_next && currentWatchNextMovies.length === 1;
    
    // If removing from watch next, add animation class first
    if (movie.watch_next) {
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
      
      // Wait for animation to complete before updating state
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    const updateMovieInLists = (moviesList) => {
      return moviesList.map(m => 
        m.id === movie.id ? { ...m, watch_next: newWatchNextValue } : m
      );
    };
    
    // Update all state lists
    setAllMovies(prev => updateMovieInLists(prev));
    setFilteredMovies(prev => updateMovieInLists(prev));
    setMovies(prev => updateMovieInLists(prev));
    
    // Then make the API call
    try {
      await apiService.toggleWatchNext(movie.id);
    } catch (error) {
      console.error('Error toggling watch next:', error);
      
      // Revert on error
      setAllMovies(prev => updateMovieInLists(prev).map(m => 
        m.id === movie.id ? { ...m, watch_next: !newWatchNextValue } : m
      ));
      setFilteredMovies(prev => updateMovieInLists(prev).map(m => 
        m.id === movie.id ? { ...m, watch_next: !newWatchNextValue } : m
      ));
      setMovies(prev => updateMovieInLists(prev).map(m => 
        m.id === movie.id ? { ...m, watch_next: !newWatchNextValue } : m
      ));
      
      if (onShowAlert) {
        onShowAlert('Failed to update Watch Next status', 'danger');
      }
    }
  };

  // Filter functions
  const getFilterCounts = () => {
    const counts = {
      all: allMovies.length,
      movies: allMovies.filter(movie => movie.media_type === 'movie' || !movie.media_type).length,
      tvShows: allMovies.filter(movie => movie.media_type === 'tv').length,
      comments: allMovies.filter(movie => movie.comments && movie.comments.trim()).length,
      watchNext: allMovies.filter(movie => movie.watch_next).length,
      formats: {},
      ageGroups: {}
    };

    // Count formats
    allMovies.forEach(movie => {
      if (movie.format) {
        counts.formats[movie.format] = (counts.formats[movie.format] || 0) + 1;
      }
    });

    // Count age groups
    allMovies.forEach(movie => {
      let ageGroup = 'Not Rated';
      if (movie.recommended_age !== null && movie.recommended_age !== undefined) {
        const age = movie.recommended_age;
        if (age <= 3) {
          ageGroup = 'All Ages (0-3)';
        } else if (age < 10) {
          ageGroup = 'Children (4-9)';
        } else if (age <= 14) {
          ageGroup = 'Pre-teens (10-14)';
        } else {
          ageGroup = 'Teens & Adults (15+)';
        }
      }
      counts.ageGroups[ageGroup] = (counts.ageGroups[ageGroup] || 0) + 1;
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
            case 'watchNext':
              return movie.watch_next;
            case 'format':
              return movie.format === filter.value;
            case 'ageGroup':
              let movieAgeGroup = 'Not Rated';
              if (movie.recommended_age !== null && movie.recommended_age !== undefined) {
                const age = movie.recommended_age;
                if (age <= 3) {
                  movieAgeGroup = 'All Ages (0-3)';
                } else if (age < 10) {
                  movieAgeGroup = 'Children (4-9)';
                } else if (age <= 14) {
                  movieAgeGroup = 'Pre-teens (10-14)';
                } else {
                  movieAgeGroup = 'Teens & Adults (15+)';
                }
              }
              return movieAgeGroup === filter.value;
            default:
              return false;
          }
        });
      });
    }

    setFilteredMovies(filtered);
    
    // Apply current grouping and sorting to filtered movies
    if (groupBy !== 'none') {
      // When grouping is enabled, we don't set movies directly
      // The grouped movies will be rendered in the JSX
    } else {
      // Apply current sort to filtered movies when not grouping
      const sorted = sortMovies(filtered, sortBy);
      setMovies(sorted);
    }
    
    setFilterLoading(false);
  };

  const handleFilterClick = async (filterType, filterValue = null) => {
    if (filterType === 'all') {
      setActiveFilters([]);
      await applyFilters([]);
      return;
    }

    const newFilter = { type: filterType, value: filterValue };
    
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
    { value: 'ratingLowest', label: 'Lowest rating first' },
    { value: 'ageAsc', label: 'Age - youngest first' },
    { value: 'ageDesc', label: 'Age - oldest first' }
  ];

  const groupOptions = [
    { value: 'none', label: 'No grouping' },
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

  // Get Watch Next movies for banner
  const watchNextMovies = allMovies.filter(movie => movie.watch_next);

  // Helper function to get poster URL
  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${posterPath}`;
    }
    // If it's already a full URL, return as is
    return posterPath;
  };

  return (
    <div className="movie-search">

      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      {loadingDetails && <div className="loading-details">Loading movie details...</div>}

      {/* Watch Next Banner */}
      {watchNextMovies.length > 0 && (
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
          <div className="filter-pills">
            {(() => {
              const counts = getFilterCounts();
              const isAllActive = activeFilters.length === 0;
              const hasFormats = Object.keys(counts.formats).length > 0;
              const hasAgeGroups = Object.keys(counts.ageGroups).length > 0;
              const hasActiveFormatFilters = activeFilters.some(f => f.type === 'format');
              const hasActiveAgeGroupFilters = activeFilters.some(f => f.type === 'ageGroup');
              
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
                  
                  {/* More Dropdown for Formats and Age Groups */}
                  {(hasFormats || hasAgeGroups) && (
                    <div className="more-dropdown-container" ref={moreDropdownRef}>
                      <button
                        className={`filter-pill more-pill ${(hasActiveFormatFilters || hasActiveAgeGroupFilters) ? 'active' : ''} ${loading || filterLoading ? 'filter-pill-loading' : ''} last-child`}
                        onClick={handleMoreToggle}
                        disabled={filterLoading}
                      >
                        <BsThreeDots className="filter-icon" />
                      </button>
                      
                      {showMoreDropdown && (
                        <div className="more-dropdown-menu">
                          {/* Age Group Filters */}
                          {hasAgeGroups && (
                            <>
                              <div className="more-dropdown-section-title">Age Groups</div>
                              {Object.entries(counts.ageGroups)
                                .filter(([ageGroup, count]) => count > 0)
                                .map(([ageGroup, count]) => {
                                  const isActive = isFilterActive('ageGroup', ageGroup);
                                  return (
                                    <button
                                      key={`age-${ageGroup}`}
                                      className={`more-dropdown-item ${isActive ? 'active' : ''}`}
                                      onClick={() => handleMorePillClick('ageGroup', ageGroup)}
                                    >
                                      {isActive && <BsCheck className="checkmark" />}
                                      {ageGroup} ({count})
                                    </button>
                                  );
                                })}
                            </>
                          )}
                          
                          {/* Format Filters */}
                          {hasFormats && (
                            <>
                              {hasAgeGroups && <div className="more-dropdown-section-title">Formats</div>}
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
                            </>
                          )}
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
          
          {/* Dropdowns Container - Grouped on the right */}
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
        ) : (
          <>
            {/* Movies Grid - Grouped or Ungrouped */}
            {groupBy === 'none' ? (
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
                        recommendedAge={movie.recommended_age}
                      />
                      <button 
                        className={`watch-next-badge-toggle ${movie.watch_next ? 'active' : ''}`}
                        onClick={(e) => handleWatchNextToggle(e, movie)}
                        title={movie.watch_next ? "Remove from Watch Next" : "Add to Watch Next"}
                        aria-label="Toggle Watch Next"
                      >
                        <svg 
                          className="star-icon" 
                          viewBox="0 0 24 24" 
                          fill={movie.watch_next ? "currentColor" : "none"}
                          stroke="currentColor"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
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
            ) : (
              <div className={`movies-groups ${sortLoading || filterLoading || groupLoading ? 'sort-loading' : ''}`}>
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
                            {sortedGroupMovies.map((movie) => (
                              <div key={movie.id} className="movie-card-compact" onClick={() => handleMovieClick(movie.id)}>
                                <div className="movie-poster-compact">
                                  <MovieThumbnail 
                                    imdbLink={movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}` : movie.imdb_link} 
                                    title={movie.title}
                                    year={movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year}
                                    className="movie-thumbnail-compact"
                                    disableZoom={true}
                                    posterPath={movie.poster_path}
                                    recommendedAge={movie.recommended_age}
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
                    );
                  });
                })()}
              </div>
            )}
          </>
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
          onShowAlert={onShowAlert}
        />
      )}

    </div>
  );
});

export default MovieSearch;
