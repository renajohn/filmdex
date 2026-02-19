import React, { useState, useEffect } from 'react';
import './UnmatchedBooks.css';
import apiService from '../services/api';

const UnmatchedBooks = ({ importId, onImportComplete, setCurrentStep }) => {
  const [unmatchedBooks, setUnmatchedBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUnmatchedBooks();
  }, [importId]);

  const loadUnmatchedBooks = async () => {
    try {
      const response = await apiService.makeRequest(`/import/${importId}`);
      if (response.ok) {
        const status = await response.json();
        setUnmatchedBooks(status.unmatchedBooks || []);
      }
    } catch (error) {
      console.error('Error loading unmatched books:', error);
      setError('Failed to load unmatched books');
    }
  };

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const response = await apiService.makeRequest(`/books/search/external?q=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
      } else {
        throw new Error('Failed to search for books');
      }
    } catch (error) {
      console.error('Error searching for books:', error);
      setError('Failed to search for books: ' + error.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInputChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length >= 2) {
      handleSearch(query);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectBook = (book) => {
    setSelectedBook(book);
    // Scroll to top to show selection
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResolve = async () => {
    if (!selectedBook || !selectedBook.id) return;

    setIsResolving(true);
    setError(null);

    try {
      const response = await apiService.makeRequest(`/import/${importId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importId,
          unmatchedMovieTitle: selectedBook.title,
          resolvedMovie: selectedBook
        })
      });

      if (response.ok) {
        // Refresh unmatched books list
        await loadUnmatchedBooks();
        setSelectedBook(null);
        setSearchQuery('');
        setSearchResults([]);

        // If no more unmatched books, mark as complete
        if (unmatchedBooks.length === 1) {
          onImportComplete();
        }
      } else {
        throw new Error('Failed to resolve book');
      }
    } catch (error) {
      console.error('Error resolving book:', error);
      setError('Failed to resolve book: ' + error.message);
    } finally {
      setIsResolving(false);
    }
  };

  const handleIgnore = async (bookTitle) => {
    setIsResolving(true);
    setError(null);

    try {
      const response = await apiService.makeRequest(`/import/${importId}/ignore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importId,
          movieTitle: bookTitle
        })
      });

      if (response.ok) {
        // Refresh unmatched books list
        await loadUnmatchedBooks();
        setSelectedBook(null);
        setSearchQuery('');
        setSearchResults([]);

        // If no more unmatched books, mark as complete
        if (unmatchedBooks.length === 1) {
          onImportComplete();
        }
      } else {
        throw new Error('Failed to ignore book');
      }
    } catch (error) {
      console.error('Error ignoring book:', error);
      setError('Failed to ignore book: ' + error.message);
    } finally {
      setIsResolving(false);
    }
  };

  const handleStartOver = () => {
    setCurrentStep('upload');
  };

  if (error) {
    return (
      <div className="unmatched-books">
        <div className="error-message">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{error}</span>
            <button onClick={() => setError(null)} className="error-close">×</button>
          </div>
        </div>
        <button onClick={handleStartOver} className="btn btn-secondary">
          Start Over
        </button>
      </div>
    );
  }

  return (
    <div className="unmatched-books">
      <h2>Resolve Unmatched Books</h2>
      <p>These books couldn't be automatically matched with our database. Please help us identify them.</p>

      <div className="unmatched-list">
        {unmatchedBooks.length === 0 ? (
          <div className="empty-state">
            <p>No unmatched books found.</p>
            <button onClick={handleStartOver} className="btn btn-primary">
              Back to Collection
            </button>
          </div>
        ) : (
          <>
            {unmatchedBooks.map((book, index) => (
              <div key={index} className="unmatched-item">
                <div className="unmatched-info">
                  <h3>{book.title}</h3>
                  {book.original_title && <p className="original-title">Original: {book.original_title}</p>}
                  {book.csv_data?.authors && <p className="author">Author: {book.csv_data.authors}</p>}
                  {book.csv_data?.isbn && <p className="isbn">ISBN: {book.csv_data.isbn}</p>}
                  {book.csv_data?.publisher && <p className="publisher">Publisher: {book.csv_data.publisher}</p>}
                  {book.csv_data?.published_year && <p className="year">Year: {book.csv_data.published_year}</p>}
                </div>

                <div className="unmatched-actions">
                  <button
                    onClick={() => handleIgnore(book.title)}
                    className="btn btn-outline-secondary"
                    disabled={isResolving}
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="resolve-section">
        <h3>Search for a Book</h3>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search for a book by title, author, or ISBN..."
            value={searchQuery}
            onChange={handleSearchInputChange}
            className="search-input"
            disabled={isSearching}
          />
          {isSearching && <span className="search-spinner">🔍 Searching...</span>}
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            <h4>Search Results ({searchResults.length})</h4>
            <ul className="results-list">
              {searchResults.map((result, index) => (
                <li
                  key={index}
                  className={`result-item ${selectedBook?.id === result.id ? 'selected' : ''}`}
                  onClick={() => handleSelectBook(result)}
                >
                  <div className="result-info">
                    <h4>{result.title}</h4>
                    {result.authors && <p className="result-authors">by {result.authors}</p>}
                    {result.isbn && <p className="result-isbn">ISBN: {result.isbn}</p>}
                    {result.publisher && <p className="result-publisher">{result.publisher}</p>}
                    {result.year && <p className="result-year">{result.year}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedBook && (
          <div className="selected-book">
            <h4>Selected Book:</h4>
            <div className="selected-book-info">
              <h3>{selectedBook.title}</h3>
              {selectedBook.authors && <p>by {selectedBook.authors}</p>}
              {selectedBook.isbn && <p>ISBN: {selectedBook.isbn}</p>}
              {selectedBook.publisher && <p>{selectedBook.publisher}</p>}
              {selectedBook.year && <p>{selectedBook.year}</p>}
            </div>

            <button
              onClick={handleResolve}
              className="btn btn-primary"
              disabled={isResolving}
            >
              {isResolving ? 'Resolving...' : 'Add to Collection'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnmatchedBooks;