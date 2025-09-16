import React, { useState, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import MovieSearch from './components/MovieSearch';
import AddMovie from './pages/AddMovie';
import AddMovieSimple from './pages/AddMovieSimple';
import ImportPage from './pages/ImportPage';
import CogDropdown from './components/CogDropdown';
import './App.css';

function AppContent() {
  const [refreshTrigger] = useState(0);
  const movieSearchRef = useRef(null);
  const navigate = useNavigate();


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


  return (
    <div className="App">
      <header className="App-header">
        <div className="App-header-content">
          <div className="App-title">
            <h1>FilmDex</h1>
            <p>Interactive index for physical movies and TV shows</p>
          </div>
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
              />
            } 
          />
          <Route path="/add-movie" element={<AddMovie />} />
          <Route path="/add-movie-simple" element={<AddMovieSimple />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </main>

    </div>
  );
}

function App() {
  return (
    <Router basename="/app">
      <AppContent />
    </Router>
  );
}

export default App;
