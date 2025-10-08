import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MovieSearch from './components/MovieSearch';
import AddMovieDialog from './components/AddMovieDialog';
import ImportPage from './pages/ImportPage';
import WishListPage from './pages/WishListPage';
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


  const handleSearchChange = (e) => {
    const { name, value } = e.target;
    setSearchCriteria(prev => ({
      ...prev,
      [name]: value
    }));
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

  // Clear search when navigating between pages
  useEffect(() => {
    setSearchCriteria({ searchText: '' });
  }, [location.pathname]);

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
                  type="text"
                  name="searchText"
                  value={searchCriteria.searchText}
                  onChange={handleSearchChange}
                  placeholder={location.pathname === '/wishlist' ? 'Search wish list by title, director...' : 'Search FilmDex by title, director...'}
                  className="search-input-large"
                />
                {searchCriteria.searchText && (
                  <button 
                    className="search-clear-button"
                    onClick={() => setSearchCriteria({ searchText: '' })}
                    type="button"
                  >
                    <BsX />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="App-toolbar">
            <CogDropdown 
              onImportMovies={handleImportMovies}
              onAddMovie={handleAddMovie}
              onExportCSV={handleExportCSV}
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
