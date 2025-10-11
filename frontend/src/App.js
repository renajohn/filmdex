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
import { BsSearch, BsX, BsCollectionFill, BsHeart } from 'react-icons/bs';
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
      'actor:', 'director:', 'title:', 'collection:', 'genre:', 'format:', 
      'original_language:', 'media_type:', 'year:', 'year:>', 'year:<', 'year:>=', 'year:<=',
      'imdb_rating:', 'imdb_rating:>', 'imdb_rating:<', 'imdb_rating:>=', 'imdb_rating:<=',
      'recommended_age:', 'recommended_age:>', 'recommended_age:<', 'recommended_age:>=', 'recommended_age:<=',
      'price:', 'price:>', 'price:<', 'price:>=', 'price:<='
    ];
    
    // Get the cursor position (end of text)
    const cursorPos = text.length;
    
    // Find the last word being typed (after last space or at start)
    const beforeCursor = text.substring(0, cursorPos);
    const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
    const currentWord = beforeCursor.substring(lastSpaceIndex + 1);
    
    // Check if we're inside a filter value (after a keyword)
    const filterMatch = currentWord.match(/^(actor|director|title|collection|genre|format|original_language|media_type):(.*)$/);
    
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

  const selectAutocompleteSuggestion = async (option) => {
    console.log('Selecting autocomplete option:', option); // Debug log
    console.log('Current search text:', searchCriteria.searchText); // Debug log
    console.log('Replace text:', option.replaceText); // Debug log
    
    // First, close the dropdown
    setShowAutocomplete(false);
    setAutocompleteIndex(-1);
    
    // Update the search text
    setSearchCriteria(prev => ({
      ...prev,
      searchText: option.replaceText
    }));
    
    // Keep focus on input and set cursor position
    if (searchInputRef.current) {
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

  // Close autocomplete on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setShowAutocomplete(false);
        setAutocompleteIndex(-1);
      }
    };

    if (showAutocomplete) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAutocomplete]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
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
    if (!location.search && searchCriteria.searchText) {
      const previousPath = sessionStorage.getItem('previousPath');
      if (previousPath && previousPath !== location.pathname) {
        setSearchCriteria({ searchText: '' });
      }
    }
    sessionStorage.setItem('previousPath', location.pathname);
  }, [location.pathname, location.search, searchCriteria.searchText]);

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
        <div className={`App-header-content ${!showSearchBar ? 'no-search' : ''}`}>
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
                <BsSearch className="search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  name="searchText"
                  value={searchCriteria.searchText}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
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
                {showAutocomplete && autocompleteOptions.length > 0 && (
                  <div className="search-autocomplete-dropdown">
                    {autocompleteOptions.map((option, index) => (
                      <div
                        key={option.keyword + index}
                        className={`search-autocomplete-item ${index === autocompleteIndex ? 'active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Clicking autocomplete item:', option); // Debug log
                          selectAutocompleteSuggestion(option);
                        }}
                        onMouseEnter={() => setAutocompleteIndex(index)}
                      >
                        <span className={option.isValue ? 'autocomplete-value' : 'autocomplete-keyword'}>
                          {option.keyword}
                        </span>
                        <span className="autocomplete-hint">
                          {option.isValue && option.filterType === 'actor' && '(Actor)'}
                          {option.isValue && option.filterType === 'director' && '(Director)'}
                          {option.isValue && option.filterType === 'title' && '(Title)'}
                          {option.isValue && option.filterType === 'collection' && '(Collection)'}
                          {option.isValue && option.filterType === 'genre' && '(Genre)'}
                          {option.isValue && option.filterType === 'format' && '(Format)'}
                          {option.isValue && option.filterType === 'original_language' && '(Language)'}
                          {option.isValue && option.filterType === 'media_type' && '(Media Type)'}
                          {!option.isValue && option.keyword === 'actor:' && 'Search by actor name'}
                          {!option.isValue && option.keyword === 'director:' && 'Search by director name'}
                          {!option.isValue && option.keyword === 'title:' && 'Search by movie title'}
                          {!option.isValue && option.keyword === 'collection:' && 'Search by collection name'}
                          {!option.isValue && option.keyword === 'genre:' && 'Search by genre'}
                          {!option.isValue && option.keyword === 'format:' && 'Search by format'}
                          {!option.isValue && option.keyword === 'original_language:' && 'Search by language'}
                          {!option.isValue && option.keyword === 'media_type:' && 'Search by media type'}
                          {!option.isValue && option.keyword === 'year:' && 'Exact year match'}
                          {!option.isValue && option.keyword === 'year:>' && 'Year greater than'}
                          {!option.isValue && option.keyword === 'year:<' && 'Year less than'}
                          {!option.isValue && option.keyword === 'year:>=' && 'Year greater or equal'}
                          {!option.isValue && option.keyword === 'year:<=' && 'Year less or equal'}
                          {!option.isValue && option.keyword === 'imdb_rating:' && 'Exact IMDB rating match'}
                          {!option.isValue && option.keyword === 'imdb_rating:>' && 'IMDB rating greater than'}
                          {!option.isValue && option.keyword === 'imdb_rating:<' && 'IMDB rating less than'}
                          {!option.isValue && option.keyword === 'imdb_rating:>=' && 'IMDB rating greater or equal'}
                          {!option.isValue && option.keyword === 'imdb_rating:<=' && 'IMDB rating less or equal'}
                          {!option.isValue && option.keyword === 'recommended_age:' && 'Exact age recommendation match'}
                          {!option.isValue && option.keyword === 'recommended_age:>' && 'Age recommendation greater than'}
                          {!option.isValue && option.keyword === 'recommended_age:<' && 'Age recommendation less than'}
                          {!option.isValue && option.keyword === 'recommended_age:>=' && 'Age recommendation greater or equal'}
                          {!option.isValue && option.keyword === 'recommended_age:<=' && 'Age recommendation less or equal'}
                          {!option.isValue && option.keyword === 'price:' && 'Exact price match'}
                          {!option.isValue && option.keyword === 'price:>' && 'Price greater than'}
                          {!option.isValue && option.keyword === 'price:<' && 'Price less than'}
                          {!option.isValue && option.keyword === 'price:>=' && 'Price greater or equal'}
                          {!option.isValue && option.keyword === 'price:<=' && 'Price less or equal'}
                        </span>
                      </div>
                    ))}
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
