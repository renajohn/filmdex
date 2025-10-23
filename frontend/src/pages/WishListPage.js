import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsTrash, BsCurrencyDollar, BsClipboard, BsMusicNote, BsFilm } from 'react-icons/bs';
import apiService from '../services/api';
import musicService from '../services/musicService';
import MovieThumbnail from '../components/MovieThumbnail';
import MovieDetailCard from '../components/MovieDetailCard';
import MusicDetailCard from '../components/MusicDetailCard';
import AddMusicDialog from '../components/AddMusicDialog';
import MusicForm from '../components/MusicForm';
import CircularProgressBar from '../components/CircularProgressBar';
import './WishListPage.css';

const WishListPage = forwardRef(({ searchCriteria, onAddMovie, onAddAlbum, onMovieMovedToCollection, onAlbumMovedToCollection, onShowAlert, onMovieAdded, onAlbumAdded, onSearch }, ref) => {
  const navigate = useNavigate();
  const [allMovies, setAllMovies] = useState([]);
  const [movies, setMovies] = useState([]);
  const [allAlbums, setAllAlbums] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [selectedMovieDetails, setSelectedMovieDetails] = useState(null);
  const [selectedAlbumDetails, setSelectedAlbumDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState({ show: false, itemId: null, itemType: null });
  const [showMarkOwnedModal, setShowMarkOwnedModal] = useState({ show: false, item: null, itemType: null });
  const [showAddMusicDialog, setShowAddMusicDialog] = useState(false);
  const [showMusicForm, setShowMusicForm] = useState(false);
  const [addingAlbum, setAddingAlbum] = useState(false);
  const [addError, setAddError] = useState('');
  const [markOwnedForm, setMarkOwnedForm] = useState({ 
    title: '', 
    format: 'Blu-ray 4K', 
    price: '', 
    condition: '', 
    purchasedAt: '', 
    notes: '' 
  });

  useEffect(() => {
    loadWishListItems();
  }, []);

  useImperativeHandle(ref, () => ({
    refreshItems: loadWishListItems
  }));

  const loadWishListItems = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load both movies and albums in parallel
      const [wishListMovies, wishListAlbums] = await Promise.all([
        apiService.getMoviesByStatus('wish'),
        musicService.getAlbumsByStatus('wish')
      ]);
      
      setAllMovies(wishListMovies);
      setMovies(wishListMovies);
      setAllAlbums(wishListAlbums);
      setAlbums(wishListAlbums);
    } catch (err) {
      setError('Failed to load wish list: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter items based on search text from searchCriteria
  useEffect(() => {
    const searchText = searchCriteria?.searchText || '';
    if (!searchText || searchText.trim() === '') {
      setMovies(allMovies);
      setAlbums(allAlbums);
    } else {
      // Use the same advanced search logic for both movies and albums
      performAdvancedSearch(searchText);
    }
  }, [searchCriteria, allMovies, allAlbums]);

  const performAdvancedSearch = async (searchText) => {
    try {
      // Search both movies and albums in parallel
      const [movieResults, albumResults] = await Promise.all([
        apiService.searchMovies({ 
          searchText, 
          title_status: 'wish' 
        }).catch(() => {
          // Fallback to simple search if advanced search fails
          const searchLower = searchText.toLowerCase().trim();
          return allMovies.filter(movie => {
            return (
              (movie.title && movie.title.toLowerCase().includes(searchLower)) ||
              (movie.original_title && movie.original_title.toLowerCase().includes(searchLower)) ||
              (movie.director && movie.director.toLowerCase().includes(searchLower)) ||
              (movie.comments && movie.comments.toLowerCase().includes(searchLower))
            );
          });
        }),
        // For albums, we need to search only within wish list albums
        Promise.resolve().then(() => {
          const searchLower = searchText.toLowerCase().trim();
          return allAlbums.filter(album => {
            // Only include wish list albums
            if (album.titleStatus !== 'wish') return false;
            
            const artistString = Array.isArray(album.artist) ? album.artist.join(', ') : album.artist;
            const genresString = Array.isArray(album.genres) ? album.genres.join(', ') : album.genres;
            return (
              (album.title && album.title.toLowerCase().includes(searchLower)) ||
              (artistString && artistString.toLowerCase().includes(searchLower)) ||
              (genresString && genresString.toLowerCase().includes(searchLower)) ||
              (album.catalogNumber && album.catalogNumber.toLowerCase().includes(searchLower)) ||
              (album.barcode && album.barcode.toLowerCase().includes(searchLower))
            );
          });
        })
      ]);
      
      setMovies(movieResults);
      setAlbums(albumResults);
    } catch (error) {
      console.error('Advanced search failed:', error);
      // Fallback to simple search
      const searchLower = searchText.toLowerCase().trim();
      setMovies(allMovies.filter(movie => {
        return (
          (movie.title && movie.title.toLowerCase().includes(searchLower)) ||
          (movie.original_title && movie.original_title.toLowerCase().includes(searchLower)) ||
          (movie.director && movie.director.toLowerCase().includes(searchLower)) ||
          (movie.comments && movie.comments.toLowerCase().includes(searchLower))
        );
      }));
      setAlbums(allAlbums.filter(album => {
        const artistString = Array.isArray(album.artist) ? album.artist.join(', ') : album.artist;
        const genresString = Array.isArray(album.genres) ? album.genres.join(', ') : album.genres;
        return (
          (album.title && album.title.toLowerCase().includes(searchLower)) ||
          (artistString && artistString.toLowerCase().includes(searchLower)) ||
          (genresString && genresString.toLowerCase().includes(searchLower)) ||
          (album.catalogNumber && album.catalogNumber.toLowerCase().includes(searchLower)) ||
          (album.barcode && album.barcode.toLowerCase().includes(searchLower))
        );
      }));
    }
  };

  const handleDeleteItem = async (itemId, itemType) => {
    try {
      setDeletingId(itemId);
      if (itemType === 'movie') {
        await apiService.deleteMovie(itemId);
        setAllMovies(allMovies.filter(movie => movie.id !== itemId));
        setMovies(movies.filter(movie => movie.id !== itemId));
      } else if (itemType === 'album') {
        await musicService.deleteAlbum(itemId);
        setAllAlbums(allAlbums.filter(album => album.id !== itemId));
        setAlbums(albums.filter(album => album.id !== itemId));
      }
    } catch (err) {
      setError(`Failed to delete ${itemType}: ` + err.message);
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

  const handleAddAlbum = () => {
    setShowAddMusicDialog(true);
  };

  const handleAddMusicDialogClose = () => {
    setShowAddMusicDialog(false);
  };

  const handleAddCd = async (cdData) => {
    try {
      // Set the album status to 'wish' for wish list, preserving all other data
      const albumData = { ...cdData, titleStatus: 'wish' };
      const newAlbum = await musicService.addAlbum(albumData);
      
      // Refresh the albums list
      loadWishListItems();
      setShowAddMusicDialog(false);
      
      if (onAlbumAdded) {
        onAlbumAdded(newAlbum.id);
      }
    } catch (error) {
      console.error('Error adding album:', error);
      if (onShowAlert) {
        onShowAlert('Failed to add album: ' + error.message, 'danger');
      }
    }
  };

  const handleAddCdFromMusicBrainz = async (releaseId, additionalData) => {
    try {
      // Set the album status to 'wish' for wish list
      const albumData = { ...additionalData, titleStatus: 'wish' };
      const newAlbum = await musicService.addAlbumFromMusicBrainz(releaseId, albumData);
      
      // Refresh the albums list
      loadWishListItems();
      setShowAddMusicDialog(false);
      
      if (onAlbumAdded) {
        onAlbumAdded(newAlbum.id);
      }
    } catch (error) {
      console.error('Error adding album:', error);
      if (onShowAlert) {
        onShowAlert('Failed to add album: ' + error.message, 'danger');
      }
    }
  };

  const handleAddCdByBarcode = async (barcode, additionalData) => {
    try {
      // Set the album status to 'wish' for wish list
      const albumData = { ...additionalData, titleStatus: 'wish' };
      const newAlbum = await musicService.addAlbumByBarcode(barcode, albumData);
      
      // Refresh the albums list
      loadWishListItems();
      setShowAddMusicDialog(false);
      
      if (onAlbumAdded) {
        onAlbumAdded(newAlbum.id);
      }
    } catch (error) {
      console.error('Error adding album:', error);
      if (onShowAlert) {
        onShowAlert('Failed to add album: ' + error.message, 'danger');
      }
    }
  };

  const handleReviewMetadata = async (release, allReleasesInGroup) => {
    console.log('handleReviewMetadata called with:', { 
      release: release ? (release.title || release.id) : 'null', 
      allReleasesInGroup: allReleasesInGroup ? allReleasesInGroup.length : 'undefined' 
    });
    
    if (release === null) {
      // Manual entry case - open MusicForm
      console.log('Opening MusicForm for manual entry');
      setShowAddMusicDialog(false);
      setShowMusicForm(true);
      return;
    }
    
    // Check if this is an album object (from the new workflow) or a release object (from the old workflow)
    if (release.id && !release.musicbrainzReleaseId) {
      // This is an album object from the new workflow - open detail view
      console.log('Opening detail view for album:', release.title);
      setShowAddMusicDialog(false);
      
      // Refresh the albums list to include the new album
      loadWishListItems();
      
      if (onAlbumAdded) {
        onAlbumAdded(release.id);
      }
      return;
    }
    
    // Old workflow - add the album directly without review
    try {
      console.log('Adding album directly to wish list:', release.title);
      setAddingAlbum(true);
      
      // Use the MusicBrainz service to add the album with full metadata
      const newAlbum = await musicService.addAlbumFromMusicBrainz(
        release.musicbrainzReleaseId, 
        { titleStatus: 'wish' }
      );
      
      // Refresh the albums list
      loadWishListItems();
      setShowAddMusicDialog(false);
      
      if (onAlbumAdded) {
        onAlbumAdded(newAlbum.id);
      }
      
      console.log('Album added successfully:', newAlbum.title);
    } catch (error) {
      console.error('Error adding album:', error);
      if (onShowAlert) {
        onShowAlert('Failed to add album: ' + error.message, 'danger');
      }
    } finally {
      setAddingAlbum(false);
    }
  };

  const handleMusicFormClose = () => {
    console.log('Closing MusicForm');
    setShowMusicForm(false);
  };

  const handleMusicFormSave = async (cdData) => {
    try {
      // Set the album status to 'wish' for wish list
      const albumData = { ...cdData, titleStatus: 'wish' };
      const newAlbum = await musicService.addAlbum(albumData);
      
      // Refresh the albums list
      loadWishListItems();
      setShowMusicForm(false);
      
      if (onAlbumAdded) {
        onAlbumAdded(newAlbum.id);
      }
      
      return newAlbum;
    } catch (error) {
      console.error('Error adding album:', error);
      if (onShowAlert) {
        onShowAlert('Failed to add album: ' + error.message, 'danger');
      }
      throw error;
    }
  };

  const handleItemClick = async (itemId, itemType) => {
    try {
      setLoadingDetails(true);
      if (itemType === 'movie') {
        const movieDetails = await apiService.getMovieDetails(itemId);
        setSelectedMovieDetails(movieDetails);
        setSelectedAlbumDetails(null);
      } else if (itemType === 'album') {
        const albumDetails = await musicService.getAlbumById(itemId);
        setSelectedAlbumDetails(albumDetails);
        setSelectedMovieDetails(null);
      }
    } catch (error) {
      console.error(`Failed to load ${itemType} details:`, error);
      setError(`Failed to load ${itemType} details: ` + error.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedMovieDetails(null);
    setSelectedAlbumDetails(null);
  };

  // Refresh function for detail card that updates thumbnails without affecting dialog
  const handleRefreshForDetailCard = async () => {
    try {
      const [wishListMovies, wishListAlbums] = await Promise.all([
        apiService.getMoviesByStatus('wish'),
        musicService.getAlbumsByStatus('wish')
      ]);
      
      // Update the lists to refresh thumbnails
      setAllMovies(wishListMovies);
      setMovies(wishListMovies);
      setAllAlbums(wishListAlbums);
      setAlbums(wishListAlbums);
      
      // If there's a selected item, update its data in the list without changing selected details
      if (selectedMovieDetails) {
        const updatedMovie = wishListMovies.find(movie => movie.id === selectedMovieDetails.id);
        if (updatedMovie) {
          setSelectedMovieDetails(prev => ({
            ...prev,
            ...updatedMovie
          }));
        }
      }
      
      if (selectedAlbumDetails) {
        const updatedAlbum = wishListAlbums.find(album => album.id === selectedAlbumDetails.id);
        if (updatedAlbum) {
          setSelectedAlbumDetails(prev => ({
            ...prev,
            ...updatedAlbum
          }));
        }
      }
    } catch (err) {
      console.error('Failed to refresh wish list:', err);
    }
  };

  const handleDeleteClick = (itemId, itemType, e) => {
    e.stopPropagation();
    setShowDeleteModal({ show: true, itemId, itemType });
  };

  const handleMarkOwnedClick = (item, itemType, e) => {
    e.stopPropagation();
    setMarkOwnedForm({
      title: item.title,
      format: itemType === 'movie' ? (item.format || 'Blu-ray 4K') : (item.format || 'CD'),
      price: ''
    });
    setShowMarkOwnedModal({ show: true, item, itemType });
  };

  const handleDeleteConfirm = async () => {
    if (showDeleteModal.itemId && showDeleteModal.itemType) {
      await handleDeleteItem(showDeleteModal.itemId, showDeleteModal.itemType);
      setShowDeleteModal({ show: false, itemId: null, itemType: null });
    }
  };

  const handleMarkOwnedConfirm = async () => {
    if (showMarkOwnedModal.item && showMarkOwnedModal.itemType) {
      try {
        const itemType = showMarkOwnedModal.itemType;
        const item = showMarkOwnedModal.item;
        
        if (itemType === 'movie') {
          const movieData = {
            title: markOwnedForm.title,
            format: markOwnedForm.format || 'Blu-ray 4K',
            price: markOwnedForm.price ? parseFloat(markOwnedForm.price) : null,
            acquired_date: new Date().toISOString().split('T')[0],
            title_status: 'owned'
          };

          await apiService.updateMovie(item.id, movieData);
          
          // Remove from wish list
          setAllMovies(allMovies.filter(m => m.id !== item.id));
          setMovies(movies.filter(m => m.id !== item.id));
          
          // Notify parent component to refresh collection
          if (onMovieMovedToCollection) {
            onMovieMovedToCollection();
          }
        } else if (itemType === 'album') {
          const albumData = {
            ...item,
            titleStatus: 'owned',
            ownership: {
              ...item.ownership,
              condition: markOwnedForm.condition || item.ownership?.condition,
              purchasedAt: markOwnedForm.purchasedAt || item.ownership?.purchasedAt,
              priceChf: parseFloat(markOwnedForm.price) || item.ownership?.priceChf,
              notes: markOwnedForm.notes || item.ownership?.notes
            }
          };
          
          await musicService.updateAlbum(item.id, albumData);
          
          // Remove from wish list
          setAllAlbums(allAlbums.filter(a => a.id !== item.id));
          setAlbums(albums.filter(a => a.id !== item.id));
          
          // Notify parent component to refresh collection
          if (onAlbumMovedToCollection) {
            onAlbumMovedToCollection(item);
          }
        }
        
        // Show success message
        setError(''); // Clear any previous errors
        console.log(`${itemType === 'movie' ? 'Movie' : 'Album'} "${markOwnedForm.title}" successfully moved to collection!`);
        
        setShowMarkOwnedModal({ show: false, item: null, itemType: null });
        setMarkOwnedForm({ 
          title: '', 
          format: 'Blu-ray 4K', 
          price: '', 
          condition: '', 
          purchasedAt: '', 
          notes: '' 
        });
      } catch (err) {
        setError(`Failed to mark ${showMarkOwnedModal.itemType} as owned: ` + err.message);
      }
    }
  };

  const handleCopyToClipboard = async () => {
    if (allMovies.length === 0 && allAlbums.length === 0) return;
    
    // Create markdown list from all items (not filtered)
    let markdown = 'wishlist:\n';
    
    // Add movies
    allMovies.forEach(movie => {
      const year = getYear(movie);
      const format = movie.format || 'Unspecified';
      markdown += ` - 🎬 ${movie.title} (${year}) in ${format}\n`;
    });
    
    // Add albums
    allAlbums.forEach(album => {
      const year = album.releaseYear || 'Unknown';
      const format = album.format || 'CD';
      const artistString = Array.isArray(album.artist) ? album.artist.join(', ') : album.artist;
      markdown += ` - 🎵 ${album.title} by ${artistString} (${year}) in ${format}\n`;
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

  const handleDeleteItemFromDetails = async (itemId, itemType) => {
    try {
      if (itemType === 'movie') {
        await apiService.deleteMovie(itemId);
        setAllMovies(allMovies.filter(movie => movie.id !== itemId));
        setMovies(movies.filter(movie => movie.id !== itemId));
        setSelectedMovieDetails(null);
      } else if (itemType === 'album') {
        await musicService.deleteAlbum(itemId);
        setAllAlbums(allAlbums.filter(album => album.id !== itemId));
        setAlbums(albums.filter(album => album.id !== itemId));
        setSelectedAlbumDetails(null);
      }
    } catch (err) {
      setError(`Failed to delete ${itemType}: ` + err.message);
    }
  };

  const handleCopyBarcode = (barcode) => {
    navigator.clipboard.writeText(barcode);
    if (onShowAlert) {
      onShowAlert('Barcode copied to clipboard!', 'info');
    }
  };

  const handleCopyCatalogNumber = (catalogNumber) => {
    navigator.clipboard.writeText(catalogNumber);
    if (onShowAlert) {
      onShowAlert('Catalog number copied to clipboard!', 'info');
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
  const totalItems = movies.length + albums.length;
  const totalAllItems = allMovies.length + allAlbums.length;

  return (
    <div className="wishlist-page">
      <div className="wishlist-header">
        <div className="wishlist-title-section">
          <h1>My Wish List</h1>
          {totalAllItems > 0 && (
            <span className="wishlist-count">
              ({totalItems}{hasSearchText ? ` of ${totalAllItems}` : ''} item{totalItems !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="wishlist-actions">
          {totalAllItems > 0 && (
            <button 
              className="copy-clipboard-btn"
              onClick={handleCopyToClipboard}
              title="Copy wishlist to clipboard as markdown"
            >
              <BsClipboard />
            </button>
          )}
          <div className="add-buttons">
            <button 
              className="add-movie-btn"
              onClick={handleAddMovie}
              title="Add Movie to Wish List"
            >
              <BsFilm className="me-2" />
              Add Movie
            </button>
            <button 
              className="add-album-btn"
              onClick={handleAddAlbum}
              title="Add Album to Wish List"
            >
              <BsMusicNote className="me-2" />
              Add Album
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {totalAllItems === 0 ? (
        <div className="empty-wishlist">
          <h3>Your wish list is empty</h3>
          <p>Add movies and albums you'd like to acquire to your collection.</p>
          <div className="add-buttons">
            <button 
              className="add-movie-btn"
              onClick={handleAddMovie}
            >
              <BsFilm className="me-2" />
              Add Your First Movie
            </button>
            <button 
              className="add-album-btn"
              onClick={handleAddAlbum}
            >
              <BsMusicNote className="me-2" />
              Add Your First Album
            </button>
          </div>
        </div>
      ) : totalItems === 0 ? (
        <div className="empty-wishlist">
          <h3>No items found</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div className="wishlist-content">
          {/* Movies Section */}
          {movies.length > 0 && (
            <div className="wishlist-section">
              <h2 className="wish-list-section-title">
                <BsFilm className="me-2" />
                Movies ({movies.length})
              </h2>
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
                        key={`movie-${movie.id}`} 
                        className="clickable-row"
                        onClick={() => handleItemClick(movie.id, 'movie')}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(movie.id, 'movie', e);
                              }}
                              disabled={deletingId === movie.id}
                              title="Delete movie"
                            >
                              <BsTrash />
                            </button>
                            <button 
                              type="button" 
                              className="action-button mark-owned"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkOwnedClick(movie, 'movie', e);
                              }}
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
            </div>
          )}

          {/* Albums Section */}
          {albums.length > 0 && (
            <div className="wishlist-section">
              <h2 className="wish-list-section-title">
                <BsMusicNote className="me-2" />
                Albums ({albums.length})
              </h2>
              <div className="table-responsive">
                <table className="table table-dark table-striped table-hover">
                  <thead className="thead-dark">
                    <tr>
                      <th scope="col">Cover</th>
                      <th scope="col">Title</th>
                      <th scope="col">Artist</th>
                      <th scope="col">Year</th>
                      <th scope="col">Format</th>
                      <th scope="col">Added Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {albums.map((album) => (
                      <tr 
                        key={`album-${album.id}`} 
                        className="clickable-row"
                        onClick={() => handleItemClick(album.id, 'album')}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="album-poster">
                            <img 
                              src={musicService.getImageUrl(album.cover) || musicService.getImageUrl('/placeholder-album.png')} 
                              alt={album.title}
                              className="music-thumbnail-table"
                              onError={(e) => {
                                e.target.src = musicService.getImageUrl('/placeholder-album.png');
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <div className="album-title-cell">
                            <strong>{album.title}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="artist-cell">
                            {Array.isArray(album.artist) ? album.artist.join(', ') : album.artist}
                          </div>
                        </td>
                        <td>{album.releaseYear || 'Unknown'}</td>
                        <td>{album.format || 'CD'}</td>
                        <td>{formatDate(album.createdAt)}</td>
                        <td>
                          <div className="actions-cell">
                            <button 
                              type="button" 
                              className="action-button delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(album.id, 'album', e);
                              }}
                              disabled={deletingId === album.id}
                              title="Delete album"
                            >
                              <BsTrash />
                            </button>
                            <button 
                              type="button" 
                              className="action-button mark-owned"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkOwnedClick(album, 'album', e);
                              }}
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
            </div>
          )}
        </div>
      )}

      {/* Detail Cards */}
      {(selectedMovieDetails && !loadingDetails) && (
        <MovieDetailCard 
          movieDetails={selectedMovieDetails} 
          loading={loadingDetails}
          onClose={handleCloseDetails}
          onEdit={handleEditMovie}
          onDelete={() => handleDeleteItemFromDetails(selectedMovieDetails.id, 'movie')}
          onShowAlert={onShowAlert}
          onRefresh={handleRefreshForDetailCard}
          onSearch={onSearch}
        />
      )}

      {(selectedAlbumDetails && !loadingDetails) && (
        <MusicDetailCard
          cd={selectedAlbumDetails}
          onClose={handleCloseDetails}
          onDelete={() => handleDeleteItemFromDetails(selectedAlbumDetails.id, 'album')}
          onSearch={onSearch}
          onMarkOwned={() => handleMarkOwnedClick(selectedAlbumDetails, 'album', { stopPropagation: () => {} })}
          onCopyBarcode={handleCopyBarcode}
          onCopyCatalogNumber={handleCopyCatalogNumber}
        />
      )}

      {/* Loading indicator for detail cards */}
      {loadingDetails && (
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body text-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3 mb-0">Loading details...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal.show && (
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete {showDeleteModal.itemType === 'movie' ? 'Movie' : 'Album'}</h5>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to remove this {showDeleteModal.itemType} from your wish list?</p>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowDeleteModal({ show: false, itemId: null, itemType: null })}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={handleDeleteConfirm}
                  disabled={deletingId === showDeleteModal.itemId}
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
                    {showMarkOwnedModal.itemType === 'movie' ? (
                      <>
                        <option value="Unspecified">Unspecified</option>
                        <option value="Blu-ray 4K">Blu-ray 4K</option>
                        <option value="Blu-ray">Blu-ray</option>
                        <option value="DVD">DVD</option>
                        <option value="Digital">Digital</option>
                      </>
                    ) : (
                      <>
                        <option value="CD">CD</option>
                        <option value="Vinyl">Vinyl</option>
                        <option value="Digital">Digital</option>
                        <option value="Cassette">Cassette</option>
                        <option value="Other">Other</option>
                      </>
                    )}
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
                {showMarkOwnedModal.itemType === 'album' && (
                  <>
                    <div className="form-group mb-3">
                      <label htmlFor="condition">Condition</label>
                      <select
                        id="condition"
                        className="form-control"
                        value={markOwnedForm.condition}
                        onChange={(e) => setMarkOwnedForm(prev => ({ ...prev, condition: e.target.value }))}
                      >
                        <option value="">-</option>
                        <option value="M">Mint (M)</option>
                        <option value="NM">Near Mint (NM)</option>
                        <option value="VG+">Very Good Plus (VG+)</option>
                        <option value="VG">Very Good (VG)</option>
                      </select>
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="purchasedAt">Purchased At</label>
                      <input
                        type="date"
                        id="purchasedAt"
                        className="form-control"
                        value={markOwnedForm.purchasedAt}
                        onChange={(e) => setMarkOwnedForm(prev => ({ ...prev, purchasedAt: e.target.value }))}
                      />
                    </div>
                    <div className="form-group mb-3">
                      <label htmlFor="notes">Notes</label>
                      <textarea
                        id="notes"
                        className="form-control"
                        rows={3}
                        value={markOwnedForm.notes}
                        onChange={(e) => setMarkOwnedForm(prev => ({ ...prev, notes: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowMarkOwnedModal({ show: false, item: null, itemType: null })}
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

      {/* Add Music Dialog */}
      {showAddMusicDialog && (
        <AddMusicDialog
          show={showAddMusicDialog}
          onHide={handleAddMusicDialogClose}
          onAddCd={handleAddCd}
          onAddCdFromMusicBrainz={handleAddCdFromMusicBrainz}
          onAddCdByBarcode={handleAddCdByBarcode}
          onReviewMetadata={handleReviewMetadata}
          defaultTitleStatus="wish"
          onAlbumAdded={() => {
            // Immediately refresh wishlist when album is added
            loadWishListItems();
            setAddingAlbum(false);
            setAddError('');
            if (onAlbumAdded) onAlbumAdded();
          }}
          onAddStart={() => {
            setShowAddMusicDialog(false); // close dialog instantly
            setAddingAlbum(true);
            setAddError('');
          }}
          onAddError={(err) => {
            setAddingAlbum(false);
            setAddError(err?.message || 'Failed to add album');
            if (onShowAlert) onShowAlert('Failed to add album: ' + (err?.message || ''), 'danger');
          }}
        />
      )}

      {/* Music Form for Manual Entry */}
      {showMusicForm && (
        <MusicForm
          onCancel={handleMusicFormClose}
          onSave={handleMusicFormSave}
        />
      )}

      {/* Loading indicator for album addition */}
      {addingAlbum && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-message">
            Adding album to your wish list...
          </div>
        </div>
      )}

      {addError && (
        <div className="error-message">
          {addError}
        </div>
      )}

     
      {/* Modal backdrop */}
      {(showDeleteModal.show || showMarkOwnedModal.show || loadingDetails || showAddMusicDialog || showMusicForm || addingAlbum) && (
        <div className="modal-backdrop show"></div>
      )}

    </div>
  );
});

export default WishListPage;
