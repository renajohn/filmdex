import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MovieSearch from './components/MovieSearch';
import AddMovieSimple from './pages/AddMovieSimple';
import ImportPage from './pages/ImportPage';
import CogDropdown from './components/CogDropdown';
import BackfillModal from './components/BackfillModal';
import apiService from './services/api';
import { BsSearch, BsX } from 'react-icons/bs';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function AppContent() {
  const [refreshTrigger] = useState(0);
  const movieSearchRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchCriteria, setSearchCriteria] = useState({
    searchText: ''
  });
  const [loading, setLoading] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [hasCheckedBackfill, setHasCheckedBackfill] = useState(false);

  // Check if we're on the thumbnail view (root path)
  const isThumbnailView = location.pathname === '/';
  
  // Get the page title based on current route
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'FilmDex';
      case '/import':
        return 'FilmDex - CSV Import';
      case '/add-movie-simple':
        return 'FilmDex - Add Movie';
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
    navigate('/add-movie-simple');
  };

  const handleExportCSV = () => {
    if (movieSearchRef.current) {
      movieSearchRef.current.handleExportCSVClick();
    }
  };

  const handleBackfill = () => {
    setShowBackfillModal(true);
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

  // Check for backfill on app startup
  useEffect(() => {
    const checkBackfillStatus = async () => {
      if (hasCheckedBackfill) return;
      
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
        <div className={`App-header-content ${!isThumbnailView ? 'no-search' : ''}`}>
          <div className="App-title" onClick={handleFilmDexClick}>
            <h1>{getPageTitle()}</h1>
          </div>
          {isThumbnailView && (
            <div className="App-search">
              <div className="search-input-container">
                <BsSearch className="search-icon" />
                <input
                  type="text"
                  name="searchText"
                  value={searchCriteria.searchText}
                  onChange={handleSearchChange}
                  placeholder="Search by movie title, director..."
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
              onBackfill={handleBackfill}
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
              />
            } 
          />
          <Route path="/add-movie-simple" element={<AddMovieSimple />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </main>

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
      />
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
