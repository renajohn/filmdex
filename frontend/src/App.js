import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MovieSearch from './components/MovieSearch';
import AddMovieDialog from './components/AddMovieDialog';
import ImportPage from './pages/ImportPage';
import WishListPage from './pages/WishListPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CogDropdown from './components/CogDropdown';
import BackfillModal from './components/BackfillModal';
import ScrollToTop from './components/ScrollToTop';
import apiService from './services/api';
import { BsX, BsCollectionFill, BsHeart, BsChevronDown } from 'react-icons/bs';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function AppContent() {
  const [refreshTrigger] = useState(0);
  const movieSearchRef = useRef(null);
  const wishListRef = useRef(null);
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchCriteria, setSearchCriteria] = useState({
    searchText: ''
  });
  const [loading, setLoading] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [hasCheckedBackfill, setHasCheckedBackfill] = useState(false);
  const [showAddMovieDialog, setShowAddMovieDialog] = useState(false);
  const [addMovieMode, setAddMovieMode] = useState('collection');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success');
  const [showAlert, setShowAlert] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const autocompleteTimeoutRef = useRef(null);
  const emptyFieldTimerRef = useRef(null);
  const mouseEnterTimeoutRef = useRef(null);
  const filterDropdownRef = useRef(null);
  const filterButtonRef = useRef(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [collections, setCollections] = useState([]);
  const [boxSets, setBoxSets] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Check if we're on the thumbnail view (root path)
  const isThumbnailView = location.pathname === '/';
  
  // Check if we should show the search bar (collection or wishlist)
  const showSearchBar = location.pathname === '/' || location.pathname === '/wishlist';
  
  // Get the page title based on current route
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'FilmDex';
      case '/import':
        return 'FilmDex - CSV Import';
      case '/wishlist':
        return 'FilmDex';
      default:
        return 'FilmDex';
    }
  };


  const getAutocompleteOptions = async (text) => {
    const keywords = [
      'actor:', 'director:', 'title:', 'collection:', 'box_set:', 'genre:', 'format:', 
      'original_language:', 'media_type:', 'year:', 'year:>', 'year:<', 'year:>=', 'year:<=',
      'imdb_rating:', 'imdb_rating:>', 'imdb_rating:<', 'imdb_rating:>=', 'imdb_rating:<=',
      'tmdb_rating:', 'tmdb_rating:>', 'tmdb_rating:<', 'tmdb_rating:>=', 'tmdb_rating:<=',
      'rotten_tomato_rating:', 'rotten_tomato_rating:>', 'rotten_tomato_rating:<', 'rotten_tomato_rating:>=', 'rotten_tomato_rating:<=',
      'recommended_age:', 'recommended_age:>', 'recommended_age:<', 'recommended_age:>=', 'recommended_age:<=',
      'price:', 'price:>', 'price:<', 'price:>=', 'price:<=',
      'has_comments:true', 'has_comments:false'
    ];
    
    // If text is empty, return all keywords (for the 5-second delay feature)
    if (text.trim() === '') {
      return keywords.map(kw => ({
        keyword: kw,
        replaceText: kw,
        isValue: false
      }));
    }
    
    // Get the cursor position (end of text)
    const cursorPos = text.length;
    
    // Find the last word being typed (after last space or at start)
    const beforeCursor = text.substring(0, cursorPos);
    const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
    const currentWord = beforeCursor.substring(lastSpaceIndex + 1);
    
    // Check if we're inside a filter value (after a keyword)
    const filterMatch = currentWord.match(/^(actor|director|title|collection|box_set|genre|format|original_language|media_type|imdb_rating|tmdb_rating|rotten_tomato_rating):(.*)$/);
    
    if (filterMatch) {
      const [, filterType, filterValue] = filterMatch;
      
      // Don't show suggestions if already inside quotes
      if (filterValue.includes('"')) {
        return [];
      }
      
      // Show suggestions immediately when predicate is typed (even with empty value)
      // or when user starts typing a value
      
      // Fetch value suggestions from backend
      try {
        const response = await apiService.getAutocompleteSuggestions(filterType, filterValue);
        
        // Extract values from response (backend now returns {field: value} format)
        let values = response.map(item => item[filterType]).filter(value => value && value !== 'undefined');
        
        // For collections, include collection type information
        let collectionTypes = {};
        if (filterType === 'collection' || filterType === 'box_set') {
          collectionTypes = response.reduce((acc, item) => {
            const name = item[filterType];
            const type = item.collection_type;
            if (name && type) {
              acc[name] = type;
            }
            return acc;
          }, {});
        }
        
        // For actors, we get JSON arrays, so parse them to extract individual names
        if (filterType === 'actor') {
          values = values.map(cast => {
            if (typeof cast === 'string') {
              try {
                const parsed = JSON.parse(cast);
                return Array.isArray(parsed) ? parsed : [cast];
              } catch (e) {
                return [cast];
              }
            }
            return Array.isArray(cast) ? cast : [cast];
          }).flat();
          
          // Filter actors to only show those that match the search term
          const searchTerm = filterValue.toLowerCase();
          values = values.filter(actor => 
            actor && typeof actor === 'string' && actor.toLowerCase().includes(searchTerm)
          );
        }
        
        // Remove duplicates and limit to 20
        values = [...new Set(values)].slice(0, 20);
        
        return values.map(value => ({
          isValue: true,
          keyword: value,
          filterType,
          collectionType: collectionTypes[value], // Include collection type for proper hinting
          replaceText: text.substring(0, lastSpaceIndex + 1) + `${filterType}:"${value}"`
        }));
      } catch (error) {
        console.error('Error fetching autocomplete suggestions:', error);
        return [];
      }
    }
    
    // Otherwise, show keyword suggestions
    const currentWordLower = currentWord.toLowerCase();
    
    // Only show keyword suggestions if typing a partial keyword
    if (currentWord.length === 0 || currentWord.includes(':') || currentWord.includes('"')) {
      return [];
    }
    
    // Filter keywords that start with current word
    const matches = keywords.filter(kw => kw.startsWith(currentWordLower));
    
    return matches.map(kw => ({
      isValue: false,
      keyword: kw,
      replaceText: text.substring(0, lastSpaceIndex + 1) + kw
    }));
  };

  const handleSearchChange = async (e) => {
    const { name, value } = e.target;
    setSearchCriteria(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear existing timeout
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }
    
    // Clear empty field timer if field is no longer empty
    if (value.trim() !== '') {
      if (emptyFieldTimerRef.current) {
        clearTimeout(emptyFieldTimerRef.current);
        emptyFieldTimerRef.current = null;
      }
    }
    
    // Debounce autocomplete suggestions by 300ms
    autocompleteTimeoutRef.current = setTimeout(async () => {
      const options = await getAutocompleteOptions(value);
      setAutocompleteOptions(options);
      setShowAutocomplete(options.length > 0);
      setAutocompleteIndex(-1);
    }, 300);
  };

  const handleSearchKeyDown = (e) => {
    if (!showAutocomplete || autocompleteOptions.length === 0) return;
    
    if (e.key === 'Tab') {
      e.preventDefault();
      // Select first option or currently highlighted option
      const indexToSelect = autocompleteIndex >= 0 ? autocompleteIndex : 0;
      selectAutocompleteSuggestion(autocompleteOptions[indexToSelect]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocompleteIndex(prev => 
        prev < autocompleteOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocompleteIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && autocompleteIndex >= 0) {
      e.preventDefault();
      selectAutocompleteSuggestion(autocompleteOptions[autocompleteIndex]);
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
      setAutocompleteIndex(-1);
    }
  };

  const handleSearchFocus = () => {
    // Start timer for empty field if field is empty
    if (searchCriteria.searchText.trim() === '') {
      emptyFieldTimerRef.current = setTimeout(async () => {
        const options = await getAutocompleteOptions('');
        setAutocompleteOptions(options);
        setShowAutocomplete(options.length > 0);
        setAutocompleteIndex(-1);
      }, 5000); // 5 seconds
    }
  };

  const handleSearchBlur = () => {
    // Clear empty field timer when losing focus
    if (emptyFieldTimerRef.current) {
      clearTimeout(emptyFieldTimerRef.current);
      emptyFieldTimerRef.current = null;
    }
  };

  // Fetch collections and box sets for filter dropdown
  const fetchFilterData = async () => {
    try {
      // Fetch all collections (both user collections and box sets)
      const collectionsData = await apiService.getAllCollections();
      
      // Separate user collections from box sets
      const userCollections = collectionsData
        .filter(c => c.type === 'user')
        .map(c => c.name)
        .sort();
      
      const boxSetCollections = collectionsData
        .filter(c => c.type === 'box_set')
        .map(c => c.name)
        .sort();
      
      setCollections(userCollections);
      setBoxSets(boxSetCollections);
    } catch (error) {
      console.error('Failed to fetch collections:', error);
    }
  };

  // Handle filter selection and generate predicates
  const handleFilterSelection = (filterType, filterValue) => {
    let predicate = '';
    
    switch (filterType) {
      case 'media_type':
        predicate = `media_type:${filterValue}`;
        break;
      case 'format':
        predicate = `format:"${filterValue}"`;
        break;
      case 'genre':
        predicate = `genre:"${filterValue}"`;
        break;
      case 'collection':
        predicate = `collection:"${filterValue}"`;
        break;
      case 'box_set':
        predicate = `box_set:"${filterValue}"`;
        break;
      case 'age_group':
        const ageRanges = {
          'All Ages (0-3)': 'recommended_age:>=0 recommended_age:<=3',
          'Children (4-9)': 'recommended_age:>=4 recommended_age:<=9',
          'Pre-teens (10-14)': 'recommended_age:>=10 recommended_age:<=14',
          'Teens & Adults (15+)': 'recommended_age:>=15'
        };
        predicate = ageRanges[filterValue] || '';
        break;
      case 'imdb_rating':
        predicate = `imdb_rating:>=${filterValue}`;
        break;
      case 'tmdb_rating':
        predicate = `tmdb_rating:>=${filterValue}`;
        break;
      case 'rotten_tomato_rating':
        predicate = `rotten_tomato_rating:>=${filterValue}`;
        break;
      case 'year':
        predicate = `year:${filterValue}`;
        break;
      case 'comments':
        predicate = 'has_comments:true';
        break;
      default:
        return;
    }
    
    if (predicate) {
      const currentText = searchCriteria.searchText.trim();
      const newText = currentText ? `${currentText} ${predicate}` : predicate;
      
      // Update the state first
      setSearchCriteria({ searchText: newText });
      
      // Then update the input field directly to ensure immediate visual update
      if (searchInputRef.current) {
        searchInputRef.current.value = newText;
        // Trigger the change event to ensure React knows about the change
        const event = new Event('input', { bubbles: true });
        searchInputRef.current.dispatchEvent(event);
      }
    }
    
    setShowFilterDropdown(false);
  };
  const handleMouseEnter = (index) => {
    if (mouseEnterTimeoutRef.current) {
      clearTimeout(mouseEnterTimeoutRef.current);
    }
    mouseEnterTimeoutRef.current = setTimeout(() => {
      setAutocompleteIndex(index);
    }, 16); // ~60fps throttling
  };
  const getAutocompleteHint = (option) => {
    if (option.isValue) {
      // Special handling for collections to show collection type
      if (option.filterType === 'collection' || option.filterType === 'box_set') {
        if (option.collectionType === 'box_set') {
          return '(Box Set)';
        } else {
          return '(Collection)';
        }
      }
      
      const hintMap = {
        'actor': '(Actor)',
        'director': '(Director)',
        'title': '(Title)',
        'collection': '(Collection)',
        'box_set': '(Box Set)',
        'genre': '(Genre)',
        'format': '(Format)',
        'original_language': '(Language)',
        'media_type': '(Media Type)'
      };
      return hintMap[option.filterType] || '';
    } else {
      const hintMap = {
        'actor:': 'Search by actor name',
        'director:': 'Search by director name',
        'title:': 'Search by movie title',
        'collection:': 'Search by collection name',
        'box_set:': 'Search by box set collection name',
        'genre:': 'Search by genre',
        'format:': 'Search by format',
        'original_language:': 'Search by language',
        'media_type:': 'Search by media type',
        'year:': 'Exact year match',
        'year:>': 'Year greater than',
        'year:<': 'Year less than',
        'year:>=': 'Year greater or equal',
        'year:<=': 'Year less or equal',
        'imdb_rating:': 'Exact IMDB rating match',
        'imdb_rating:>': 'IMDB rating greater than',
        'imdb_rating:<': 'IMDB rating less than',
        'imdb_rating:>=': 'IMDB rating greater or equal',
        'imdb_rating:<=': 'IMDB rating less or equal',
        'tmdb_rating:': 'Exact TMDB rating match',
        'tmdb_rating:>': 'TMDB rating greater than',
        'tmdb_rating:<': 'TMDB rating less than',
        'tmdb_rating:>=': 'TMDB rating greater or equal',
        'tmdb_rating:<=': 'TMDB rating less or equal',
        'rotten_tomato_rating:': 'Exact Rotten Tomatoes rating match',
        'rotten_tomato_rating:>': 'Rotten Tomatoes rating greater than',
        'rotten_tomato_rating:<': 'Rotten Tomatoes rating less than',
        'rotten_tomato_rating:>=': 'Rotten Tomatoes rating greater or equal',
        'rotten_tomato_rating:<=': 'Rotten Tomatoes rating less or equal',
        'recommended_age:': 'Exact age recommendation match',
        'recommended_age:>': 'Age recommendation greater than',
        'recommended_age:<': 'Age recommendation less than',
        'recommended_age:>=': 'Age recommendation greater or equal',
        'recommended_age:<=': 'Age recommendation less or equal',
        'price:': 'Exact price match',
        'price:>': 'Price greater than',
        'price:<': 'Price less than',
        'price:>=': 'Price greater or equal',
        'price:<=': 'Price less or equal',
        'has_comments:true': 'Movies with comments',
        'has_comments:false': 'Movies without comments'
      };
      return hintMap[option.keyword] || '';
    }
  };

  const selectAutocompleteSuggestion = async (option) => {
    // Clear any existing autocomplete timeout to prevent interference
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
      autocompleteTimeoutRef.current = null;
    }
    
    // First, close the dropdown
    setShowAutocomplete(false);
    setAutocompleteIndex(-1);
    
    // Directly set the input value first
    if (searchInputRef.current) {
      searchInputRef.current.value = option.replaceText;
      
      // Also update the state
      setSearchCriteria(prev => ({
        ...prev,
        searchText: option.replaceText
      }));
      
      // Keep focus on input and set cursor position
      searchInputRef.current.focus();
      
      // Use setTimeout to ensure state update has been processed
      setTimeout(() => {
        // Move cursor to end of the inserted text
        const cursorPosition = option.replaceText.length;
        searchInputRef.current.setSelectionRange(cursorPosition, cursorPosition);
        
        // Only add space and trigger autocomplete if we selected a VALUE (not a keyword)
        if (option.isValue) {
          setTimeout(async () => {
            const newText = option.replaceText + ' ';
            searchInputRef.current.value = newText;
            setSearchCriteria(prev => ({
              ...prev,
              searchText: newText
            }));
            
            // Trigger autocomplete for the next part
            const options = await getAutocompleteOptions(newText);
            setAutocompleteOptions(options);
            setShowAutocomplete(options.length > 0);
            setAutocompleteIndex(-1);
          }, 100);
        } else {
          // For keywords (like "collection:"), trigger autocomplete immediately for values
          setTimeout(async () => {
            const options = await getAutocompleteOptions(option.replaceText);
            setAutocompleteOptions(options);
            setShowAutocomplete(options.length > 0);
            setAutocompleteIndex(-1);
          }, 100);
        }
      }, 10);
    }
  };

  const handleFilmDexClick = () => {
    navigate('/');
  };

  const handleImportMovies = () => {
    navigate('/import');
  };

  const handleAddMovie = () => {
    setAddMovieMode('collection');
    setShowAddMovieDialog(true);
  };

  const handleExportCSV = () => {
    if (movieSearchRef.current) {
      movieSearchRef.current.handleExportCSVClick();
    }
  };

  const handleAnalytics = () => {
    navigate('/analytics');
  };


  const handleCollection = () => {
    navigate('/');
  };

  const handleWishList = () => {
    navigate('/wishlist');
  };

  const handleBackfillComplete = () => {
    // Refresh the movie list if we're on the main page
    // Add a small delay to ensure the modal closes first
    setTimeout(() => {
      if (movieSearchRef.current && movieSearchRef.current.refreshMovies) {
        movieSearchRef.current.refreshMovies();
      }
    }, 100);
  };

  const handleBackfillIgnore = () => {
    // Store in localStorage that user has ignored the backfill
    localStorage.setItem('filmdex_backfill_ignored', 'true');
  };

  const handleAddMovieDialogClose = () => {
    setShowAddMovieDialog(false);
  };

  const handleWishListAddMovie = (mode) => {
    setAddMovieMode(mode);
    setShowAddMovieDialog(true);
  };

  const handleMovieMovedToCollection = () => {
    // Refresh collection when a movie is moved from wish list to collection
    if (movieSearchRef.current && movieSearchRef.current.refreshMovies) {
      movieSearchRef.current.refreshMovies();
    }
  };

  const handleAddMovieSuccess = () => {
    // Refresh movies when a movie is successfully added
    if (movieSearchRef.current && movieSearchRef.current.refreshMovies) {
      movieSearchRef.current.refreshMovies();
    }
    // Also refresh wish list if we're on the wish list page
    if (wishListRef.current && wishListRef.current.refreshMovies) {
      wishListRef.current.refreshMovies();
    }
  };

  const handleShowAlert = (message, type) => {
    setAlertMessage(message);
    setAlertType(type);
    setShowAlert(true);
    
    // Auto-hide after 6 seconds
    setTimeout(() => {
      setShowAlert(false);
      setAlertMessage('');
    }, 6000);
  };

  const handleMovieAdded = (message, type) => {
    handleShowAlert(message, type);
    
    // Refresh the appropriate list based on current page
    setTimeout(() => {
      if (location.pathname === '/wishlist' && wishListRef.current && wishListRef.current.refreshMovies) {
        wishListRef.current.refreshMovies();
      } else if (movieSearchRef.current && movieSearchRef.current.refreshMovies) {
        movieSearchRef.current.refreshMovies();
      }
    }, 100);
  };

  // Close autocomplete and filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const searchInput = searchInputRef.current;
      const filterDropdown = filterDropdownRef.current;
      const filterButton = filterButtonRef.current;
      
      if (searchInput && !searchInput.contains(event.target) && 
          (!filterDropdown || !filterDropdown.contains(event.target)) &&
          (!filterButton || !filterButton.contains(event.target))) {
        setShowAutocomplete(false);
        setAutocompleteIndex(-1);
        setShowFilterDropdown(false);
      }
    };

    if (showAutocomplete || showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAutocomplete, showFilterDropdown]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
      }
      if (emptyFieldTimerRef.current) {
        clearTimeout(emptyFieldTimerRef.current);
      }
      if (mouseEnterTimeoutRef.current) {
        clearTimeout(mouseEnterTimeoutRef.current);
      }
    };
  }, []);

  // Handle search query parameter from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search');
    
    if (searchParam) {
      // Set the search criteria
      setSearchCriteria({ searchText: searchParam });
      // Clear the URL parameter after a brief delay to keep URL clean
      setTimeout(() => {
        navigate(location.pathname, { replace: true });
      }, 100);
    }
  }, [location.search, navigate, location.pathname]);

  // Clear search when navigating between pages (without search param)
  useEffect(() => {
    // Only clear search if we're changing paths and there's no search param
    if (!location.search) {
      const previousPath = sessionStorage.getItem('previousPath');
      if (previousPath && previousPath !== location.pathname) {
        setSearchCriteria({ searchText: '' });
      }
    }
    sessionStorage.setItem('previousPath', location.pathname);
  }, [location.pathname, location.search]);

  // Check for backfill on app startup
  useEffect(() => {
    const checkBackfillStatus = async () => {
      if (hasCheckedBackfill) return;
      
      // Check if user has previously ignored the backfill
      const hasIgnoredBackfill = localStorage.getItem('filmdex_backfill_ignored') === 'true';
      if (hasIgnoredBackfill) {
        setHasCheckedBackfill(true);
        return;
      }
      
      try {
        const response = await apiService.getBackfillStatus();
        if (response.success && response.data.moviesWithoutAge > 0) {
          // Show backfill modal if there are movies without age
          setShowBackfillModal(true);
        }
      } catch (error) {
        console.error('Error checking backfill status:', error);
      } finally {
        setHasCheckedBackfill(true);
      }
    };

    checkBackfillStatus();
  }, [hasCheckedBackfill]);


  return (
    <div className="App">
      <header className="App-header">
        <div className={`App-header-content ${!showSearchBar ? 'no-search' : ''} ${isSearchFocused ? 'search-focused' : ''}`}>
          {showSearchBar ? (
            <div className="segmented-control">
              <button 
                className={`segment ${location.pathname === '/' ? 'active' : ''}`}
                onClick={handleCollection}
              >
                <BsCollectionFill className="segment-icon" />
                <span className="segment-text">FilmDex</span>
              </button>
              <button 
                className={`segment ${location.pathname === '/wishlist' ? 'active' : ''}`}
                onClick={handleWishList}
              >
                <BsHeart className="segment-icon" />
                <span className="segment-text">Wish List</span>
              </button>
            </div>
          ) : (
            <div className="App-title" onClick={handleFilmDexClick}>
              <h1>{getPageTitle()}</h1>
            </div>
          )}
          {showSearchBar && (
            <div className="App-search">
              <div className="search-input-container">
                <input
                  ref={searchInputRef}
                  type="text"
                  name="searchText"
                  value={searchCriteria.searchText}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => {
                    handleSearchFocus();
                    setIsSearchFocused(true);
                  }}
                  onBlur={() => {
                    handleSearchBlur();
                    setIsSearchFocused(false);
                  }}
                  placeholder={location.pathname === '/wishlist' ? 'Search wish list by title, director...' : 'Search FilmDex by title, director...'}
                  className="search-input-large"
                  autoComplete="off"
                />
                {searchCriteria.searchText && (
                  <button 
                    className="search-clear-button"
                    onClick={() => {
                      setSearchCriteria({ searchText: '' });
                      setShowAutocomplete(false);
                    }}
                    type="button"
                  >
                    <BsX />
                  </button>
                )}
                <button 
                  ref={filterButtonRef}
                  className={`search-filter-button ${showFilterDropdown ? 'active' : ''}`}
                  onClick={() => {
                    if (!showFilterDropdown) {
                      // Fetch data when opening dropdown
                      fetchFilterData();
                    }
                    setShowFilterDropdown(!showFilterDropdown);
                  }}
                  type="button"
                  title="Advanced Filters"
                >
                  <BsChevronDown className={`chevron-icon ${showFilterDropdown ? 'rotated' : ''}`} />
                </button>
                {showAutocomplete && autocompleteOptions.length > 0 && (
                  <div className="search-autocomplete-dropdown">
                    {autocompleteOptions.slice(0, 50).map((option, index) => (
                      <div
                        key={option.keyword + index}
                        className={`search-autocomplete-item ${index === autocompleteIndex ? 'active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          selectAutocompleteSuggestion(option);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseEnter={() => handleMouseEnter(index)}
                      >
                        <span className={option.isValue ? 'autocomplete-value' : 'autocomplete-keyword'}>
                          {option.keyword}
                        </span>
                        <span className="autocomplete-hint">
                          {getAutocompleteHint(option)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {showFilterDropdown && (
                  <div className="search-filter-dropdown" ref={filterDropdownRef}>
                    <div className="filter-section">
                      <div className="filter-section-title">Age Groups</div>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('age_group', 'All Ages (0-3)');
                        }}
                      >
                        All Ages (0-3)
                      </button>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('age_group', 'Children (4-9)');
                        }}
                      >
                        Children (4-9)
                      </button>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('age_group', 'Pre-teens (10-14)');
                        }}
                      >
                        Pre-teens (10-14)
                      </button>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('age_group', 'Teens & Adults (15+)');
                        }}
                      >
                        Teens & Adults (15+)
                      </button>
                    </div>
                    
                    <div className="filter-section">
                      <div className="filter-section-title">Formats</div>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('format', 'Blu-ray 4K');
                        }}
                      >
                        Blu-ray 4K
                      </button>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('format', 'Blu-ray');
                        }}
                      >
                        Blu-ray
                      </button>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('format', 'DVD');
                        }}
                      >
                        DVD
                      </button>
                    </div>
                    
                    <div className="filter-section">
                      <div className="filter-section-title">Special</div>
                      <button 
                        className="filter-option"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFilterSelection('comments', '');
                        }}
                      >
                        Has Comments
                      </button>
                    </div>
                    
                    {collections.length > 0 && (
                      <div className="filter-section">
                        <div className="filter-section-title">Collections</div>
                        {collections.map(collection => (
                          <button 
                            key={collection}
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('collection', collection);
                            }}
                          >
                            {collection}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {boxSets.length > 0 && (
                      <div className="filter-section">
                        <div className="filter-section-title">Box Sets</div>
                        {boxSets.map(boxSet => (
                          <button 
                            key={boxSet}
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('box_set', boxSet);
                            }}
                          >
                            {boxSet}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="App-toolbar">
            <CogDropdown 
              onImportMovies={handleImportMovies}
              onAddMovie={handleAddMovie}
              onExportCSV={handleExportCSV}
              onAnalytics={handleAnalytics}
            />
          </div>
        </div>
      </header>

      <main className="App-main">
        <Routes>
          <Route 
            path="/" 
            element={
              <MovieSearch 
                ref={movieSearchRef}
                refreshTrigger={refreshTrigger}
                searchCriteria={searchCriteria}
                loading={loading}
                setLoading={setLoading}
                onShowAlert={handleMovieAdded}
              />
            } 
          />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/wishlist" element={<WishListPage ref={wishListRef} searchCriteria={searchCriteria} onAddMovie={handleWishListAddMovie} onMovieMovedToCollection={handleMovieMovedToCollection} onShowAlert={handleShowAlert} onMovieAdded={handleMovieAdded} />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Routes>
      </main>

      {/* Main Screen Alert */}
      {showAlert && alertMessage && (
        <div className={`alert alert-${alertType} alert-dismissible fade show main-screen-alert`} role="alert">
          {alertMessage}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setShowAlert(false)}
            aria-label="Close"
          ></button>
        </div>
      )}

      <AddMovieDialog 
        isOpen={showAddMovieDialog}
        onClose={handleAddMovieDialogClose}
        initialMode={addMovieMode}
        onSuccess={handleAddMovieSuccess}
        onMovieAdded={handleMovieAdded}
      />

      <BackfillModal 
        isOpen={showBackfillModal}
        onClose={() => {
          setShowBackfillModal(false);
          // Refresh movies when modal closes (in case it was closed without completion)
          setTimeout(() => {
            if (movieSearchRef.current && movieSearchRef.current.refreshMovies) {
              movieSearchRef.current.refreshMovies();
            }
          }, 100);
        }}
        onComplete={handleBackfillComplete}
        onIgnore={handleBackfillIgnore}
      />

      {/* Scroll to Top FAB - Mobile Only */}
      <ScrollToTop />
    </div>
  );
}

function App() {
  // Dynamically determine the basename based on the current URL
  const getBasename = () => {
    const pathname = window.location.pathname;
    
    // Check if we're running in Home Assistant ingress mode
    if (pathname.includes('/api/hassio_ingress/')) {
      // Extract the ingress path from the current URL
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        return match[0];
      }
    }
    
    // Default to / for normal mode (simplified)
    return '/';
  };

  const basename = getBasename();
  
  return (
    <Router basename={basename}>
      <AppContent />
    </Router>
  );
}

export default App;
