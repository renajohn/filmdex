import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsTrash, BsCurrencyDollar, BsClipboard } from 'react-icons/bs';
import apiService from '../services/api';
import MovieThumbnail from '../components/MovieThumbnail';
import MovieDetailCard from '../components/MovieDetailCard';
import CircularProgressBar from '../components/CircularProgressBar';
import './WishListPage.css';

const WishListPage = forwardRef(({ searchCriteria, onAddMovie, onMovieMovedToCollection, onShowAlert, onMovieAdded }, ref) => {
  const navigate = useNavigate();
  const [allMovies, setAllMovies] = useState([]);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [selectedMovieDetails, setSelectedMovieDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState({ show: false, movieId: null });
  const [showMarkOwnedModal, setShowMarkOwnedModal] = useState({ show: false, movie: null });
  const [markOwnedForm, setMarkOwnedForm] = useState({ title: '', format: 'Blu-ray 4K', price: '' });

  useEffect(() => {
    loadWishListMovies();
  }, []);

  useImperativeHandle(ref, () => ({
    refreshMovies: loadWishListMovies
  }));

  const loadWishListMovies = async () => {
    try {
      setLoading(true);
      setError('');
      const wishListMovies = await apiService.getMoviesByStatus('wish');
      setAllMovies(wishListMovies);
      setMovies(wishListMovies);
    } catch (err) {
      setError('Failed to load wish list: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter movies based on search text from searchCriteria
  useEffect(() => {
    const searchText = searchCriteria?.searchText || '';
    if (!searchText || searchText.trim() === '') {
      setMovies(allMovies);
    } else {
      // Use the same advanced search logic as MovieSearch
      performAdvancedSearch(searchText);
    }
  }, [searchCriteria, allMovies]);

  const performAdvancedSearch = async (searchText) => {
    try {
      // Use the backend search API which supports advanced predicates
      // Specify title_status to search only wish list movies
      const searchResults = await apiService.searchMovies({ 
        searchText, 
        title_status: 'wish' 
      });
      setMovies(searchResults);
    } catch (error) {
      console.error('Advanced search failed, falling back to simple search:', error);
      // Fallback to simple search if advanced search fails
      const searchLower = searchText.toLowerCase().trim();
      const filtered = allMovies.filter(movie => {
        return (
          (movie.title && movie.title.toLowerCase().includes(searchLower)) ||
          (movie.original_title && movie.original_title.toLowerCase().includes(searchLower)) ||
          (movie.director && movie.director.toLowerCase().includes(searchLower)) ||
          (movie.comments && movie.comments.toLowerCase().includes(searchLower))
        );
      });
      setMovies(filtered);
    }
  };

  const handleDeleteMovie = async (movieId) => {
    try {
      setDeletingId(movieId);
      await apiService.deleteMovie(movieId);
      setAllMovies(allMovies.filter(movie => movie.id !== movieId));
      setMovies(movies.filter(movie => movie.id !== movieId));
    } catch (err) {
      setError('Failed to delete movie: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };


  const handleAddMovie = () => {
    if (onAddMovie) {
      onAddMovie('wishlist');
    } else {
      navigate('/add-movie-simple?mode=wishlist');
    }
  };

  const handleMovieClick = async (movieId) => {
    try {
      setLoadingDetails(true);
      const movieDetails = await apiService.getMovieDetails(movieId);
      setSelectedMovieDetails(movieDetails);
    } catch (error) {
      console.error('Failed to load movie details:', error);
      setError('Failed to load movie details: ' + error.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedMovieDetails(null);
  };

  const handleDeleteClick = (movieId, e) => {
    e.stopPropagation();
    setShowDeleteModal({ show: true, movieId });
  };

  const handleMarkOwnedClick = (movie, e) => {
    e.stopPropagation();
    setMarkOwnedForm({
      title: movie.title,
      format: movie.format || 'Blu-ray 4K',
      price: ''
    });
    setShowMarkOwnedModal({ show: true, movie });
  };

  const handleDeleteConfirm = async () => {
    if (showDeleteModal.movieId) {
      await handleDeleteMovie(showDeleteModal.movieId);
      setShowDeleteModal({ show: false, movieId: null });
    }
  };

  const handleMarkOwnedConfirm = async () => {
    if (showMarkOwnedModal.movie) {
      try {
        const movieData = {
          title: markOwnedForm.title,
          format: markOwnedForm.format || 'Blu-ray 4K',
          price: markOwnedForm.price ? parseFloat(markOwnedForm.price) : null,
          acquired_date: new Date().toISOString().split('T')[0],
          title_status: 'owned'
        };

        await apiService.updateMovie(showMarkOwnedModal.movie.id, movieData);
        
        // Remove from wish list
        setAllMovies(allMovies.filter(m => m.id !== showMarkOwnedModal.movie.id));
        setMovies(movies.filter(m => m.id !== showMarkOwnedModal.movie.id));
        
        // Notify parent component to refresh collection
        if (onMovieMovedToCollection) {
          onMovieMovedToCollection();
        }
        
        // Show success message
        setError(''); // Clear any previous errors
        console.log(`Movie "${markOwnedForm.title}" successfully moved to collection!`);
        
        setShowMarkOwnedModal({ show: false, movie: null });
        setMarkOwnedForm({ title: '', format: 'Blu-ray 4K', price: '' });
      } catch (err) {
        setError('Failed to mark movie as owned: ' + err.message);
      }
    }
  };

  const handleCopyToClipboard = async () => {
    if (allMovies.length === 0) return;
    
    // Create markdown list from all movies (not filtered)
    let markdown = 'wishlist:\n';
    allMovies.forEach(movie => {
      const year = getYear(movie);
      const format = movie.format || 'Unspecified';
      markdown += ` - ${movie.title} (${year}) in ${format}\n`;
    });
    
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdown);
        if (onShowAlert) {
          onShowAlert('Wishlist copied to clipboard!', 'success');
        }
        return;
      }
    } catch (err) {
      console.log('Modern clipboard API failed, trying fallback method:', err);
    }
    
    // Fallback method for iframe/restricted contexts (like Home Assistant)
    try {
      // Save the current active element to restore focus later
      const activeElement = document.activeElement;
      
      const textArea = document.createElement('textarea');
      textArea.value = markdown;
      // Position off-screen to prevent any visual flickering
      textArea.style.position = 'absolute';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      textArea.style.width = '1px';
      textArea.style.height = '1px';
      textArea.style.padding = '0';
      textArea.style.border = '0';
      textArea.style.outline = '0';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.style.pointerEvents = 'none';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('aria-hidden', 'true');
      textArea.tabIndex = -1;
      
      document.body.appendChild(textArea);
      
      // Select the text
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);
      
      const successful = document.execCommand('copy');
      
      // Clean up
      document.body.removeChild(textArea);
      
      // Restore focus to prevent flickering
      if (activeElement && activeElement.focus) {
        activeElement.focus();
      }
      
      if (successful) {
        if (onShowAlert) {
          onShowAlert('Wishlist copied to clipboard!', 'success');
        }
      } else {
        throw new Error('execCommand failed');
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      if (onShowAlert) {
        onShowAlert('Failed to copy to clipboard', 'danger');
      }
    }
  };

  const handleEditMovie = (movieId) => {
    // Navigate to edit page or open edit modal
    console.log('Edit movie:', movieId);
  };

  const handleDeleteMovieFromDetails = async (movieId) => {
    try {
      await apiService.deleteMovie(movieId);
      setAllMovies(allMovies.filter(movie => movie.id !== movieId));
      setMovies(movies.filter(movie => movie.id !== movieId));
      setSelectedMovieDetails(null);
    } catch (err) {
      setError('Failed to delete movie: ' + err.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const getYear = (movie) => {
    if (movie.release_date) {
      return new Date(movie.release_date).getFullYear();
    }
    return movie.year || 'Unknown';
  };

  const getRatingPercentage = (rating, maxRating = 10) => {
    if (!rating || rating === '-') return 0;
    return Math.min(Math.max((parseFloat(rating) / maxRating) * 100, 0), 100);
  };

  const getRatingColor = (rating, maxRating = 10) => {
    if (!rating || rating === '-') return '#3a3a3a';
    
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

  const formatRating = (rating) => {
    return rating ? rating.toString() : '-';
  };

  if (loading) {
    return (
      <div className="wishlist-page">
        <div className="loading">Loading wish list...</div>
      </div>
    );
  }

  const searchText = searchCriteria?.searchText || '';
  const hasSearchText = searchText && searchText.trim() !== '';

  return (
    <div className="wishlist-page">
      <div className="wishlist-header">
        <div className="wishlist-title-section">
          <h1>My Wish List</h1>
          {allMovies.length > 0 && (
            <span className="wishlist-count">
              ({movies.length}{hasSearchText ? ` of ${allMovies.length}` : ''} item{movies.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="wishlist-actions">
          {allMovies.length > 0 && (
            <button 
              className="copy-clipboard-btn"
              onClick={handleCopyToClipboard}
              title="Copy wishlist to clipboard as markdown"
            >
              <BsClipboard />
            </button>
          )}
          <button 
            className="add-movie-btn"
            onClick={handleAddMovie}
          >
            Add to Wish List
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {allMovies.length === 0 ? (
        <div className="empty-wishlist">
          <h3>Your wish list is empty</h3>
          <p>Add movies you'd like to acquire to your collection.</p>
          <button 
            className="add-movie-btn"
            onClick={handleAddMovie}
          >
            Add Your First Movie
          </button>
        </div>
      ) : movies.length === 0 ? (
        <div className="empty-wishlist">
          <h3>No movies found</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-dark table-striped table-hover">
            <thead className="thead-dark">
              <tr>
                <th scope="col">Poster</th>
                <th scope="col">Title</th>
                <th scope="col">Year</th>
                <th scope="col">Ratings</th>
                <th scope="col">Added Date</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {movies.map((movie) => (
                <tr 
                  key={movie.id} 
                  className="clickable-row"
                  onClick={() => handleMovieClick(movie.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="table-poster">
                      <MovieThumbnail 
                        imdbLink={movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}` : movie.imdb_link} 
                        title={movie.title}
                        year={getYear(movie)}
                        className="movie-thumbnail-table"
                        disableZoom={true}
                        posterPath={movie.poster_path}
                        recommendedAge={movie.recommended_age}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="movie-title-cell">
                      <strong>{movie.title}</strong>
                      {movie.original_title && movie.original_title !== movie.title && (
                        <div className="original-title">{movie.original_title}</div>
                      )}
                    </div>
                  </td>
                  <td>{getYear(movie)}</td>
                  <td>
                    <div className="ratings-cell">
                      {movie.tmdb_rating && (
                        <div className="rating-widget">
                                  <CircularProgressBar 
                                    percentage={getRatingPercentage(movie.tmdb_rating, 10)} 
                                    color={getRatingColor(movie.tmdb_rating, 10)}
                                    size="medium"
                                    className="tmdb-progress"
                                  >
                            <span className="rating-score">{movie.tmdb_rating.toFixed(1)}</span>
                          </CircularProgressBar>
                          <span className="rating-label">TMDB</span>
                        </div>
                      )}
                      {movie.imdb_rating && (
                        <div className="rating-widget">
                                  <CircularProgressBar 
                                    percentage={getRatingPercentage(movie.imdb_rating, 10)} 
                                    color={getRatingColor(movie.imdb_rating, 10)}
                                    size="medium"
                                    className="imdb-progress"
                                  >
                            <span className="rating-score">{formatRating(movie.imdb_rating)}</span>
                          </CircularProgressBar>
                          <span className="rating-label">IMDB</span>
                        </div>
                      )}
                      {movie.rotten_tomato_rating && (
                        <div className="rating-widget">
                                  <CircularProgressBar 
                                    percentage={movie.rotten_tomato_rating} 
                                    color={getRatingColor(movie.rotten_tomato_rating, 100)}
                                    size="medium"
                                    className="rt-progress"
                                  >
                            <span className="rating-score">{movie.rotten_tomato_rating}%</span>
                          </CircularProgressBar>
                          <span className="rating-label">RT</span>
                        </div>
                      )}
                      {!movie.tmdb_rating && !movie.imdb_rating && !movie.rotten_tomato_rating && '-'}
                    </div>
                  </td>
                  <td>{formatDate(movie.acquired_date)}</td>
                  <td>
                    <div className="actions-cell">
                      <button 
                        type="button" 
                        className="action-button delete"
                        onClick={(e) => handleDeleteClick(movie.id, e)}
                        disabled={deletingId === movie.id}
                        title="Delete movie"
                      >
                        <BsTrash />
                      </button>
                      <button 
                        type="button" 
                        className="action-button mark-owned"
                        onClick={(e) => handleMarkOwnedClick(movie, e)}
                        title="Mark as owned"
                      >
                        <BsCurrencyDollar />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Movie Detail Card */}
      {(selectedMovieDetails || loadingDetails) && (
        <MovieDetailCard 
          movieDetails={selectedMovieDetails} 
          loading={loadingDetails}
          onClose={handleCloseDetails}
          onEdit={handleEditMovie}
          onDelete={handleDeleteMovieFromDetails}
          onShowAlert={onMovieAdded || onShowAlert}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal.show && (
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete Movie</h5>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to remove this movie from your wish list?</p>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowDeleteModal({ show: false, movieId: null })}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={handleDeleteConfirm}
                  disabled={deletingId === showDeleteModal.movieId}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Owned Modal */}
      {showMarkOwnedModal.show && (
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add to Collection</h5>
              </div>
              <div className="modal-body">
                <div className="form-group mb-3">
                  <label htmlFor="title">Title</label>
                  <input
                    type="text"
                    id="title"
                    className="form-control"
                    value={markOwnedForm.title}
                    onChange={(e) => setMarkOwnedForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="format">Format</label>
                  <select
                    id="format"
                    className="form-control"
                    value={markOwnedForm.format}
                    onChange={(e) => setMarkOwnedForm(prev => ({ ...prev, format: e.target.value }))}
                  >
                    <option value="Unspecified">Unspecified</option>
                    <option value="Blu-ray 4K">Blu-ray 4K</option>
                    <option value="Blu-ray">Blu-ray</option>
                    <option value="DVD">DVD</option>
                    <option value="Digital">Digital</option>
                  </select>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="price">Price</label>
                  <input
                    type="number"
                    id="price"
                    step="0.01"
                    className="form-control"
                    value={markOwnedForm.price}
                    onChange={(e) => setMarkOwnedForm(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="Price paid"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowMarkOwnedModal({ show: false, movie: null })}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-success" 
                  onClick={handleMarkOwnedConfirm}
                  disabled={!markOwnedForm.title.trim()}
                >
                  Add to Collection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal backdrop */}
      {(showDeleteModal.show || showMarkOwnedModal.show) && (
        <div className="modal-backdrop show"></div>
      )}

    </div>
  );
});

export default WishListPage;
