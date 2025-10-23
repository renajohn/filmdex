import React, { useState, useEffect, useRef } from 'react';
import { FormControl, Dropdown } from 'react-bootstrap';
import CircularProgressBar from './CircularProgressBar';
import CompactRatingsWidget from './CompactRatingsWidget';
import InlinePosterSelector from './InlinePosterSelector';
import CollectionTagsInput from './CollectionTagsInput';
import CollectionRenameDialog from './CollectionRenameDialog';
import apiService from '../services/api';
import { getLanguageName } from '../services/languageCountryUtils';
import { BsX, BsPlay, BsTrash, BsCheck, BsX as BsXIcon, BsArrowClockwise, BsCopy, BsFilm, BsGripVertical } from 'react-icons/bs';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './MovieDetailCard.css';

// Sortable Collection Member Component
const SortableCollectionMember = ({ movie, collectionName, onMovieClick, getPosterUrl, currentMovieId }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${collectionName}-${movie.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : 'transform 0.1s ease',
    ...(isDragging && {
      transform: `${CSS.Transform.toString(transform)} rotate(-1deg) scale(1.1)`,
      
      zIndex: 1001,
      position: 'relative'
    }),
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`collection-poster-item ${movie.id === currentMovieId ? 'current' : ''}`}
      data-dragging={isDragging}
      onClick={() => onMovieClick(movie.id)}
    >
      <div className="collection-poster-drag-handle" {...attributes} {...listeners}>
        <BsGripVertical size={16} />
      </div>
      <div className="collection-poster-container">
        {movie.poster_path ? (
          <img 
            src={getPosterUrl(movie.poster_path)} 
            alt={movie.title}
            className="collection-poster-image"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <div className="collection-poster-placeholder">
            <BsFilm size={32} />
          </div>
        )}
        <div className="collection-poster-overlay">
          <div className="collection-poster-title">{movie.title}</div>
        </div>
      </div>
    </div>
  );
};

const MovieDetailCard = ({ movieDetails, onClose, onEdit, onDelete, onShowAlert, onRefresh, onMovieClick, onSearch, loading = false }) => {
  const [showTrailer, setShowTrailer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteBtnRef = useRef(null);
  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  
  // In-place editing state
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [localMovieData, setLocalMovieData] = useState(movieDetails);
  const [showCopyIcon, setShowCopyIcon] = useState(false);
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const [posterLoading, setPosterLoading] = useState(false);
  const [boxSetNames, setBoxSetNames] = useState([]);
  const [showBoxSetDropdown, setShowBoxSetDropdown] = useState(false);
  const [filteredBoxSets, setFilteredBoxSets] = useState([]);
  const [boxSetMembers, setBoxSetMembers] = useState([]);
  const [showPropagationDialog, setShowPropagationDialog] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [collections, setCollections] = useState([]);
  const [showCollectionRenameDialog, setShowCollectionRenameDialog] = useState(false);
  const [collectionRenameData, setCollectionRenameData] = useState({ oldName: '', newName: '', action: 'create' });
  const [collectionMembers, setCollectionMembers] = useState({}); // { collectionName: [movies] }
  const posterRef = useRef(null);
  
  // Search handlers
  const handleDirectorClick = (directorName) => {
    if (onSearch) {
      onSearch(`director:"${directorName}"`);
      onClose(); // Close the detail dialog
    }
  };

  const handleActorClick = (actorName) => {
    if (onSearch) {
      onSearch(`actor:"${actorName}"`);
      onClose(); // Close the detail dialog
    }
  };

  const handleGenreClick = (genreName) => {
    if (onSearch) {
      onSearch(`genre:"${genreName}"`);
      onClose(); // Close the detail dialog
    }
  };

  const handleAgeClick = (age) => {
    if (onSearch && age !== null && age !== undefined) {
      onSearch(`recommended_age:${age}`);
      onClose(); // Close the detail dialog
    }
  };

  // Helper function to render clickable genres
  const renderGenres = (genresString) => {
    if (!genresString) return null;
    
    // Split by comma and trim whitespace
    const genreList = genresString.split(',').map(genre => genre.trim()).filter(genre => genre);
    
    return genreList.map((genre, index) => (
      <span key={index}>
        <span 
          className="clickable-name" 
          onClick={() => handleGenreClick(genre)}
        >
          {genre}
        </span>
        {index < genreList.length - 1 && ', '}
      </span>
    ));
  };

  // Helper function to render clickable age
  const renderClickableAge = (age) => {
    if (age === null || age === undefined) {
      return <span className="fact-item">NR</span>;
    }
    
    return (
      <span 
        className="clickable-name" 
        onClick={() => handleAgeClick(age)}
      >
        {age}+
      </span>
    );
  };
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Initialize local movie data when movieDetails changes
  useEffect(() => {
    setLocalMovieData(movieDetails);
  }, [movieDetails]);

  // Prevent body scroll when detail view is open
  useEffect(() => {
    if (movieDetails) {
      // Disable body scroll
      document.body.style.overflow = 'hidden';
      return () => {
        // Re-enable body scroll when component unmounts
        document.body.style.overflow = 'unset';
      };
    }
  }, [movieDetails]);
  
  // Handle ESC key press for main detail view
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !showTrailer) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTrailer, onClose]);

  // Handle ESC key press for trailer modal
  useEffect(() => {
    if (!showTrailer) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setShowTrailer(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showTrailer]);

  // Update local data when movieDetails prop changes
  useEffect(() => {
    setLocalMovieData(movieDetails);
  }, [movieDetails]);

  // Load cast and crew data
  useEffect(() => {
    const loadCastAndCrew = async () => {
      if (!movieDetails?.id) return;
      
      try {
        const [castData, crewData] = await Promise.all([
          apiService.getMovieCast(movieDetails.id),
          apiService.getMovieCrew(movieDetails.id)
        ]);
        setCast(castData);
        setCrew(crewData);
      } catch (error) {
        // Failed to load cast and crew
      }
    };

    loadCastAndCrew();
  }, [movieDetails?.id]);

  // Load collection names for autocomplete
  // Load collection names
  const loadBoxSetNames = async () => {
    try {
      const allCollections = await apiService.getAllCollections();
      const boxSetCollections = allCollections.filter(c => c.type === 'box_set');
      const names = boxSetCollections.map(c => c.name);
      setBoxSetNames(names);
    } catch (error) {
      // Failed to load box set names
    }
  };

  // Load box set names on component mount
  useEffect(() => {
    loadBoxSetNames();
  }, []);

  // Clear box set members when no box set collection exists
  useEffect(() => {
    const boxSetCollection = collections.find(c => c.type === 'box_set');
    if (!boxSetCollection) {
      setBoxSetMembers([]);
    }
  }, [collections]);

  // Load box set members when movie has a box set
  useEffect(() => {
    const loadBoxSetMembers = async () => {
      // Check if movie is in any box_set collection
      const boxSetCollection = collections.find(c => c.type === 'box_set');
      if (!boxSetCollection) {
        return; // Already handled by the effect above
      }

      try {
        const members = await apiService.getMoviesByCollection(boxSetCollection.name);
        setBoxSetMembers(members);
      } catch (error) {
        setBoxSetMembers([]);
      }
    };

    loadBoxSetMembers();
  }, [collections, movieDetails?.id]);


  // Load collections when movie changes
  useEffect(() => {
    const loadCollections = async () => {
      if (!movieDetails?.id) {
        setCollections([]);
        setCollectionMembers({});
        return;
      }

      try {
        const movieCollections = await apiService.getMovieCollections(movieDetails.id);
        const collectionNames = movieCollections.map(c => c.collection_name);
        
        // Get full collection objects with type information
        const allCollections = await apiService.getAllCollections();
        const movieCollectionObjects = collectionNames.map(name => 
          allCollections.find(c => c.name === name)
        ).filter(Boolean);
        
        setCollections(movieCollectionObjects);
        
        // Load members for each collection
        if (collectionNames.length > 0) {
          const membersPromises = collectionNames.map(async (collectionName) => {
            try {
              const collection = allCollections.find(c => c.name === collectionName);
              if (collection) {
                const result = await apiService.getCollectionMovies(collection.id);
                return { collectionName, movies: result.movies };
              }
              return { collectionName, movies: [] };
            } catch (error) {
              console.error(`Error loading members for collection ${collectionName}:`, error);
              return { collectionName, movies: [] };
            }
          });
          
          const membersResults = await Promise.all(membersPromises);
          const membersMap = {};
          membersResults.forEach(({ collectionName, movies }) => {
            // Check if this is the Watch Next collection and reverse the order
            const collection = allCollections.find(c => c.name === collectionName);
            if (collection && collection.type === 'watch_next') {
              membersMap[collectionName] = movies.reverse();
            } else {
              membersMap[collectionName] = movies;
            }
          });
          
          setCollectionMembers(membersMap);
        } else {
          setCollectionMembers({});
        }
      } catch (error) {
        console.error('Error loading collections:', error);
        setCollections([]);
        setCollectionMembers({});
      }
    };

    loadCollections();
  }, [movieDetails?.id]);

  // Close box set dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showBoxSetDropdown && !event.target.closest('.box-set-dropdown') && !event.target.closest('.input-group')) {
        setShowBoxSetDropdown(false);
      }
    };

    if (showBoxSetDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showBoxSetDropdown]);
  
  if (!movieDetails && !loading) return null;

  // Use local data for display, fallback to original movieDetails
  const currentData = localMovieData || movieDetails;
  
  // Only destructure if we have data (not in loading state)
  const {
    title,
    plot,
    director,
    imdb_rating,
    rotten_tomato_rating,
    rotten_tomatoes_link,
    year,
    release_date,
    format,
    acquired_date,
    poster_path,
    backdrop_path,
    overview,
    genres,
    runtime,
    budget,
    revenue,
    original_title,
    original_language,
    imdb_link,
    tmdb_link,
    tmdb_rating,
    id,
    price,
    comments,
    trailer_key,
    trailer_site,
    recommended_age,
    title_status,
    media_type
  } = currentData || {};

  const formatRating = (rating) => {
    return rating ? rating.toString() : '-';
  };

  const formatPercentage = (rating) => {
    return rating ? `${rating}%` : '-';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatRuntime = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatCurrency = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
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


  const getStatusLabel = (status) => {
    switch (status) {
      case 'owned': return 'Owned';
      case 'wish': return 'Wish List';
      case 'to_sell': return 'To Sell';
      default: return 'Unknown';
    }
  };



  const getPosterUrl = (posterPath) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/') || posterPath.startsWith('/api/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${posterPath}`; // Use dynamic base URL for ingress
    }
   
    // If it's already a full URL, return as is
    return posterPath;
  };

  const getBackdropUrl = (backdropPath) => {
    if (!backdropPath) return null;
    
    // Already a full URL
    if (backdropPath.startsWith('http')) {
      return backdropPath;
    }
    
    // Detect if we're in Home Assistant ingress mode
    const pathname = window.location.pathname;
    if (pathname.includes('/api/hassio_ingress/')) {
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        // If path starts with /api/images/, prepend ingress path
        if (backdropPath.startsWith('/api/images/')) {
          return `${ingressPath}${backdropPath}`;
        }
        // If path starts with /images/, convert to /api/images/ and prepend ingress
        if (backdropPath.startsWith('/images/')) {
          return `${ingressPath}/api${backdropPath}`;
        }
        // Otherwise, assume it needs /api/images/ prefix
        return `${ingressPath}/api/images/${backdropPath}`;
      }
    }
    
    // Normal mode - just return the path as-is if it starts with /api/images/
    if (backdropPath.startsWith('/api/images/') || backdropPath.startsWith('/images/')) {
      return backdropPath;
    }
    
    // Default: prepend /api/images/
    return `/api/images/${backdropPath}`;
  };

  const getProfileUrl = (profilePath) => {
    if (!profilePath) return null;
    
    // Already a full URL
    if (profilePath.startsWith('http')) {
      return profilePath;
    }
    
    // Detect if we're in Home Assistant ingress mode
    const pathname = window.location.pathname;
    if (pathname.includes('/api/hassio_ingress/')) {
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        // If path starts with /api/images/, prepend ingress path
        if (profilePath.startsWith('/api/images/')) {
          return `${ingressPath}${profilePath}`;
        }
        // If path starts with /images/, convert to /api/images/ and prepend ingress
        if (profilePath.startsWith('/images/')) {
          return `${ingressPath}/api${profilePath}`;
        }
        // Otherwise, assume it needs /api/images/ prefix
        return `${ingressPath}/api/images/${profilePath}`;
      }
    }
    
    // Normal mode - just return the path as-is if it starts with /api/images/
    if (profilePath.startsWith('/api/images/') || profilePath.startsWith('/images/')) {
      return profilePath;
    }
    
    // Default: prepend /api/images/
    return `/api/images/${profilePath}`;
  };

  const getTrailerUrl = (trailerKey, trailerSite) => {
    if (!trailerKey || trailerSite !== 'YouTube') return null;
    return `https://www.youtube.com/watch?v=${trailerKey}`;
  };

  const getTrailerEmbedUrl = (trailerKey, trailerSite) => {
    if (!trailerKey || trailerSite !== 'YouTube') {
      return null;
    }
    return `https://www.youtube.com/embed/${trailerKey}?rel=0&modestbranding=1&showinfo=0`;
  };

  const trailerEmbedUrl = getTrailerEmbedUrl(trailer_key, trailer_site);

  // In-place editing functions
  const startEditing = (field, currentValue) => {
    setEditingField(field);
    // Special handling for acquired_date to ensure proper format
    if (field === 'acquired_date' && currentValue) {
      try {
        const date = new Date(currentValue);
        if (!isNaN(date.getTime())) {
          setEditValue(date.toISOString().split('T')[0]);
        } else {
          setEditValue('');
        }
      } catch {
        setEditValue('');
      }
    } else {
      setEditValue(currentValue || '');
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
    setShowBoxSetDropdown(false);
    setFilteredBoxSets([]);
  };

  // Collection name typeahead functions
  const handleBoxSetInputChange = (value) => {
    setEditValue(value);
    
    if (value.length > 0) {
      const filtered = boxSetNames.filter(name => 
        name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredBoxSets(filtered);
      setShowBoxSetDropdown(filtered.length > 0);
    } else {
      setFilteredBoxSets([]);
      setShowBoxSetDropdown(false);
    }
  };

  const handleBoxSetSelect = async (boxSetName) => {
    setEditValue(boxSetName);
    setShowBoxSetDropdown(false);
    setFilteredBoxSets([]);
    
    // Save the box set collection using the same logic as performUpdate
    await performUpdate('box_set_collection', boxSetName, false);
  };

  const handleBoxSetInputFocus = () => {
    if (editValue.length > 0) {
      const filtered = boxSetNames.filter(name => 
        name.toLowerCase().includes(editValue.toLowerCase())
      );
      setFilteredBoxSets(filtered);
      setShowBoxSetDropdown(filtered.length > 0);
    }
  };

  const saveEdit = async () => {
    if (!editingField) return;
    
    // Check if this field should trigger box set propagation dialog
    const propagationFields = ['format', 'price', 'acquired_date', 'title_status'];
    const boxSetCollection = collections.find(c => c.type === 'box_set');
    const shouldShowDialog = boxSetCollection && boxSetMembers.length > 1 && propagationFields.includes(editingField);
    
    if (shouldShowDialog) {
      // Store the pending update and show dialog
      setPendingUpdate({
        field: editingField,
        value: editValue,
        updateData: editingField === 'title_status' ? { title_status: editValue } : { [editingField]: editValue }
      });
      setShowPropagationDialog(true);
      return;
    }
    
    // Proceed with normal save if no dialog needed
    await performUpdate(editingField, editValue, false);
  };

  const performUpdate = async (field, value, propagateToAll = false) => {
    setSaving(true);
    try {
      let updateData;
      
      // Special handling for title_status
      if (field === 'title_status') {
        updateData = { title_status: value };
        if (propagateToAll) {
          // Update all movies in the box set
          for (const member of boxSetMembers) {
            await apiService.updateMovieStatus(member.id, value);
          }
        } else {
          await apiService.updateMovieStatus(id, value);
        }
      } else if (field === 'box_set_collection') {
        // Special handling for box set name - rename collection or create new one
        const currentBoxSetCollection = collections.find(c => c.type === 'box_set');
        
        if (value && value.trim()) {
          const newBoxSetName = value.trim();
          
          // Get all collections to check if target box set exists
          const allCollections = await apiService.getAllCollections();
          const targetBoxSetCollection = allCollections.find(c => c.name === newBoxSetName && c.type === 'box_set');
          
          if (currentBoxSetCollection) {
            // Case 2: Existing box set, new name doesn't exist - rename collection
            if (!targetBoxSetCollection) {
              await apiService.updateCollectionName(currentBoxSetCollection.id, newBoxSetName);
            }
            // Case 3: Existing box set, target box set exists - move movie
            else if (currentBoxSetCollection.id !== targetBoxSetCollection.id) {
              await apiService.removeMovieFromCollection(id, currentBoxSetCollection.id);
              await apiService.addMovieToCollection(id, newBoxSetName, 'box_set');
            }
            // Same box set, do nothing
          } else {
            // Case 1: No box set, create new one
            if (!targetBoxSetCollection) {
              await apiService.addMovieToCollection(id, newBoxSetName, 'box_set');
            }
            // Case 4: No box set, add to existing box set
            else {
              await apiService.addMovieToCollection(id, newBoxSetName, 'box_set');
            }
          }
        } else {
          // Case 5: Remove from box set (will auto-delete if empty)
          if (currentBoxSetCollection) {
            await apiService.removeMovieFromCollection(id, currentBoxSetCollection.id);
          }
        }
        
        // Refresh collections
        const movieCollections = await apiService.getMovieCollections(id);
        const collectionNames = movieCollections.map(c => c.collection_name);
        
        const allCollections = await apiService.getAllCollections();
        const movieCollectionObjects = collectionNames.map(name => 
          allCollections.find(c => c.name === name)
        ).filter(Boolean);
        
        setCollections(movieCollectionObjects);
        
        // Refresh box set members if we have a box set
        const newBoxSetCollection = movieCollectionObjects.find(c => c.type === 'box_set');
        if (newBoxSetCollection) {
          const members = await apiService.getMoviesByCollection(newBoxSetCollection.name);
          setBoxSetMembers(members);
        } else {
          setBoxSetMembers([]);
        }
        
        // Clean up any empty collections AFTER refreshing UI
        setTimeout(async () => {
          try {
            const cleanupResult = await apiService.cleanupEmptyCollections();
            
            // If collections were cleaned up, refresh the collections list
            if (cleanupResult.cleanedCount > 0) {
              const refreshedCollections = await apiService.getAllCollections();
              const refreshedMovieCollections = await apiService.getMovieCollections(id);
              const refreshedCollectionNames = refreshedMovieCollections.map(c => c.collection_name);
              const refreshedMovieCollectionObjects = refreshedCollectionNames.map(name => 
                refreshedCollections.find(c => c.name === name)
              ).filter(Boolean);
              
              setCollections(refreshedMovieCollectionObjects);
              
              // Also refresh box set members after cleanup
              const newBoxSetCollection = refreshedMovieCollectionObjects.find(c => c.type === 'box_set');
              if (newBoxSetCollection) {
                const members = await apiService.getMoviesByCollection(newBoxSetCollection.name);
                setBoxSetMembers(members);
              } else {
                setBoxSetMembers([]);
              }
            }
          } catch (error) {
            // Failed to cleanup empty collections
          }
        }, 200);
        
        // Exit edit mode for box set field
        setEditingField(null);
        setEditValue('');
        
        // Refresh main movie list to update box set pill
        if (onRefresh) {
          onRefresh();
        }
        
        return; // Don't continue with normal update logic
      } else {
        // Map frontend field names to backend field names
        const fieldMapping = {
          'overview': 'plot'
        };
        const backendField = fieldMapping[field] || field;
        
        updateData = { [backendField]: value };
        
        if (propagateToAll) {
          // Update all movies in the box set
          for (const member of boxSetMembers) {
            await apiService.updateMovie(member.id, updateData);
          }
        } else {
          await apiService.updateMovie(id, updateData);
        }
      }
      
      // Update local data
      setLocalMovieData(prev => ({
        ...prev,
        [field]: value
      }));
      
      setEditingField(null);
      setEditValue('');
      
      // Refresh the movie list to update thumbnails (without closing detail view)
      if (onRefresh) {
        onRefresh();
      }
      
      // Refresh box set names if box_set_collection was updated
      if (field === 'box_set_collection') {
        await loadBoxSetNames();
        // Also refresh collections to show the new box set
        const movieCollections = await apiService.getMovieCollections(movieDetails.id);
        const collectionNames = movieCollections.map(c => c.collection_name);
        
        const allCollections = await apiService.getAllCollections();
        const movieCollectionObjects = collectionNames.map(name => 
          allCollections.find(c => c.name === name)
        ).filter(Boolean);
        
        setCollections(movieCollectionObjects);
      }
    } catch (error) {
      console.error('Error updating movie:', error);
      
      // Check if it's a duplicate edition error (409 status)
      if (error.status === 409 && error.code === 'DUPLICATE_EDITION') {
        if (onShowAlert) {
          onShowAlert('⚠️ A movie with this title, format, and TMDB ID already exists in your collection. To add a different edition, please use a unique title (e.g., add "Director\'s Cut", "Extended Edition") or choose a different format.', 'danger');
        }
      } else if (error.status === 409) {
        // Other 409 conflicts
        if (onShowAlert) {
          onShowAlert('⚠️ ' + (error.data?.error || error.message || 'This movie already exists'), 'danger');
        }
      } else if (error.data?.error) {
        // Show specific error message from server
        if (onShowAlert) {
          onShowAlert('Failed to update: ' + error.data.error, 'danger');
        }
      } else {
        // Generic error
        if (onShowAlert) {
          onShowAlert('Failed to update movie: ' + error.message, 'danger');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const refreshRatings = async () => {
    if (!id) return;
    
    setRefreshingRatings(true);
    try {
      const updatedMovie = await apiService.refreshMovieRatings(id);
      
      setLocalMovieData(prev => ({
        ...prev,
        ...updatedMovie
      }));
      
    } catch (error) {
      console.error('Error refreshing ratings:', error);
      if (onShowAlert) {
        onShowAlert('Failed to refresh ratings. Please try again.', 'danger');
      }
    } finally {
      setRefreshingRatings(false);
    }
  };

  const copyTitleToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(title);
      // Title copied successfully
    } catch (error) {
      console.error('Failed to copy title:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = title;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(movieDetails.id);
      setConfirmDelete(false);
    } catch (error) {
      console.error('Error deleting movie:', error);
      if (onShowAlert) {
        onShowAlert('Failed to delete movie. Please try again.', 'danger');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleWatchNextToggle = async (e) => {
    e.stopPropagation();
    
    // Check if movie is currently in Watch Next collection
    const isCurrentlyInWatchNext = collections.some(c => c.type === 'watch_next');
    
    try {
      const result = await apiService.toggleWatchNext(movieDetails.id);
      
      // Refresh collections to show/hide Watch Next collection immediately
      const movieCollections = await apiService.getMovieCollections(movieDetails.id);
      const collectionNames = movieCollections.map(c => c.collection_name);
      
      // Get full collection objects with type information
      const allCollections = await apiService.getAllCollections();
      const movieCollectionObjects = collectionNames.map(name => 
        allCollections.find(c => c.name === name)
      ).filter(Boolean);
      
      setCollections(movieCollectionObjects);
      
      // Load members for each collection
      if (collectionNames.length > 0) {
        const membersPromises = collectionNames.map(async (collectionName) => {
          try {
            const collection = allCollections.find(c => c.name === collectionName);
            if (collection) {
              const result = await apiService.getCollectionMovies(collection.id);
              return { collectionName, movies: result.movies };
            }
            return { collectionName, movies: [] };
          } catch (error) {
            console.error(`Error loading members for collection ${collectionName}:`, error);
            return { collectionName, movies: [] };
          }
        });
        
        const membersResults = await Promise.all(membersPromises);
        const membersMap = {};
        membersResults.forEach(({ collectionName, movies }) => {
          // Check if this is the Watch Next collection and reverse the order
          const collection = allCollections.find(c => c.name === collectionName);
          if (collection && collection.type === 'watch_next') {
            membersMap[collectionName] = movies.reverse();
          } else {
            membersMap[collectionName] = movies;
          }
        });
        
        setCollectionMembers(membersMap);
      } else {
        setCollectionMembers({});
      }
      
      // Refresh the main screen to update Watch Next UI
      if (onRefresh) {
        // Use setTimeout to avoid immediate refresh that might conflict with thumbnail updates
        setTimeout(() => {
          onRefresh();
        }, 100);
      }
    } catch (error) {
      console.error('Error toggling watch next:', error);
      
      // No rollback needed since we don't use optimistic updates anymore
      
      if (onShowAlert) {
        onShowAlert('Failed to update Watch Next status', 'danger');
      }
      
      // Refresh the main screen even on error to ensure consistency
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 100);
      }
    }
  };

  const handlePosterClick = () => {
    if (currentData.tmdb_id) {
      // Calculate position based on actual poster element dimensions
      if (posterRef.current) {
        const posterElement = posterRef.current.querySelector('.movie-detail-poster');
        const headerElement = posterRef.current.closest('.movie-detail-header');
        const card = posterRef.current.closest('.movie-detail-card');
        
        if (posterElement && headerElement && card) {
          // Get actual computed dimensions (works for all screen sizes)
          const posterRect = posterElement.getBoundingClientRect();
          const headerRect = headerElement.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          
          // Get computed padding from header
          const headerStyles = window.getComputedStyle(headerElement);
          const headerPadding = parseInt(headerStyles.paddingLeft) || 20;
          
          // Account for scroll position
          const scrollTop = card.scrollTop || 0;
          
          setSelectorPosition({
            // Position relative to card's top, accounting for scroll
            top: headerRect.top - cardRect.top + scrollTop + posterElement.offsetHeight + headerPadding + 10,
            left: headerPadding,
            right: headerPadding,
            arrowLeft: posterRect.left - cardRect.left + (posterElement.offsetWidth / 2) - 12 // Center of poster - half arrow width
          });
        }
      }
      setShowPosterSelector(prev => !prev); // Toggle open/close
    }
  };

  const handlePosterSelect = async (poster) => {
    // Check if this is a custom uploaded poster or a TMDB poster
    const isCustomPoster = poster.isCustom || poster.file_path.startsWith('/api/images/');
    
    // For custom posters, use the file_path directly; for TMDB posters, construct full URL
    const posterUrl = isCustomPoster 
      ? `${apiService.getImageBaseUrl()}${poster.file_path}`
      : `https://image.tmdb.org/t/p/original${poster.file_path}`;
    
    // Show loading spinner immediately
    setPosterLoading(true);
    
    // Close the poster selector immediately
    setShowPosterSelector(false);
    
    // Preload the image
    const img = new Image();
    img.src = posterUrl;
    
    img.onload = async () => {
      // Image loaded, update UI immediately
      setLocalMovieData(prev => ({
        ...prev,
        poster_path: posterUrl
      }));
      
      // Hide spinner
      setPosterLoading(false);
      
      try {
        // For custom posters, the backend already updated the movie record
        if (isCustomPoster) {
          if (onShowAlert) {
            onShowAlert('Custom poster uploaded successfully', 'success');
          }
        } else {
          // For TMDB posters, update the movie record
          const latestMovie = await apiService.getMovieById(movieDetails.id);
          
          // Update movie with new poster path - preserve ALL existing fields
          const updateData = {
            ...latestMovie,
            poster_path: posterUrl
          };
          
          await apiService.updateMovie(movieDetails.id, updateData);
          
          if (onShowAlert) {
            onShowAlert('Poster updated successfully', 'success');
          }
        }
        
        // Refresh the movie list to show new poster (without closing detail view)
        if (onRefresh) {
          onRefresh();
        }
      } catch (error) {
        console.error('Error updating poster:', error);
        
        // ROLLBACK: Revert to original poster on error
        setLocalMovieData(prev => ({
          ...prev,
          poster_path: movieDetails.poster_path
        }));
        
        if (onShowAlert) {
          onShowAlert('Failed to update poster', 'danger');
        }
      }
    };
    
    img.onerror = () => {
      // Image failed to load
      setPosterLoading(false);
      if (onShowAlert) {
        onShowAlert('Failed to load poster image', 'danger');
      }
    };
  };

  // Reset confirm state when clicking outside delete button (hook not conditional; handler is)
  useEffect(() => {
    const handleDocClick = (e) => {
      if (confirmDelete && deleteBtnRef.current && !deleteBtnRef.current.contains(e.target)) {
        setConfirmDelete(false);
      }
    };
    document.addEventListener('click', handleDocClick, true);
    return () => document.removeEventListener('click', handleDocClick, true);
  }, [confirmDelete]);


  // Skeleton loading state
  if (loading) {
    return (
      <>
        <div className="movie-detail-overlay" onClick={onClose}>
          <div className="movie-detail-card skeleton-loading" onClick={(e) => e.stopPropagation()}>
            <button className="movie-detail-close" onClick={onClose}>
              <BsX />
            </button>
            
            <div className="movie-detail-content">
              {/* Header Section Skeleton */}
              <div className="movie-detail-header skeleton-header">
                <div className="movie-detail-poster-container">
                  <div className="movie-detail-poster skeleton-poster">
                    <div className="skeleton-placeholder"></div>
                  </div>
                </div>
                
                <div className="movie-detail-main-info">
                  {/* Just the poster placeholder - no other placeholders */}
                </div>
              </div>
              
              {/* Content Section Skeleton */}
              <div className="movie-detail-body">
                <div className="movie-detail-section">
                  <h3 className="section-title skeleton-section-title">
                    <div className="skeleton-placeholder"></div>
                  </h3>
                  <div className="skeleton-placeholder skeleton-plot"></div>
                  <div className="skeleton-placeholder skeleton-plot"></div>
                  <div className="skeleton-placeholder skeleton-plot-short"></div>
                </div>
                
                <div className="movie-detail-section">
                  <h3 className="section-title skeleton-section-title">
                    <div className="skeleton-placeholder"></div>
                  </h3>
                  <div className="skeleton-placeholder skeleton-info"></div>
                  <div className="skeleton-placeholder skeleton-info"></div>
                  <div className="skeleton-placeholder skeleton-info"></div>
                </div>
              </div>
              
              {/* Loading Spinner */}
              <div className="skeleton-loading-spinner">
                <div className="poster-spinner"></div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const handleMovieTitleClick = (movieId) => {
    if (onMovieClick) {
      onMovieClick(movieId);
    }
  };

  const handlePropagationChoice = async (propagateToAll) => {
    if (pendingUpdate) {
      await performUpdate(pendingUpdate.field, pendingUpdate.value, propagateToAll);
      setPendingUpdate(null);
    }
    setShowPropagationDialog(false);
  };

  const handlePropagationCancel = () => {
    setPendingUpdate(null);
    setShowPropagationDialog(false);
    setEditingField(null);
    setEditValue('');
  };

  // Collections handling functions
  const handleCollectionsChange = async (newUserCollectionNames) => {
    try {
      setSaving(true);
      
      // Get current non-user collections (watch_next, box_set)
      const currentNonUserCollections = collections.filter(c => c.type !== 'user');
      const currentNonUserNames = currentNonUserCollections.map(c => c.name);
      
      // Combine user collections with existing non-user collections
      const allCollectionNames = [...newUserCollectionNames, ...currentNonUserNames];
      
      await apiService.updateMovieCollections(movieDetails.id, allCollectionNames);
      
      // Get full collection objects with type information
      const allCollections = await apiService.getAllCollections();
      const movieCollectionObjects = allCollectionNames.map(name => 
        allCollections.find(c => c.name === name)
      ).filter(Boolean);
      
      setCollections(movieCollectionObjects);
      
      // Reload collection members for the updated collections
      if (allCollectionNames.length > 0) {
        const membersPromises = allCollectionNames.map(async (collectionName) => {
          try {
            const collection = allCollections.find(c => c.name === collectionName);
            if (collection) {
              const result = await apiService.getCollectionMovies(collection.id);
              return { collectionName, movies: result.movies };
            }
            return { collectionName, movies: [] };
          } catch (error) {
            console.error(`Error loading members for collection ${collectionName}:`, error);
            return { collectionName, movies: [] };
          }
        });
        
        const membersResults = await Promise.all(membersPromises);
        const membersMap = {};
        membersResults.forEach(({ collectionName, movies }) => {
          // Check if this is the Watch Next collection and reverse the order
          const collection = allCollections.find(c => c.name === collectionName);
          if (collection && collection.type === 'watch_next') {
            membersMap[collectionName] = movies.reverse();
          } else {
            membersMap[collectionName] = movies;
          }
        });
        
        setCollectionMembers(membersMap);
      } else {
        setCollectionMembers({});
      }
      
      onRefresh(); // Refresh the movie data
    } catch (error) {
      console.error('Error updating collections:', error);
      onShowAlert('Failed to update collections', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCollectionRename = (action) => {
    setCollectionRenameData(prev => ({ ...prev, action }));
    setShowCollectionRenameDialog(false);
    // The actual rename logic will be handled by the dialog
  };

  const handleCollectionRenameConfirm = async (action) => {
    try {
      await apiService.handleCollectionNameChange(
        collectionRenameData.oldName, 
        collectionRenameData.newName, 
        action
      );
      // Reload collections after rename
      const movieCollections = await apiService.getMovieCollections(movieDetails.id);
      const collectionNames = movieCollections.map(c => c.collection_name);
      
      // Get full collection objects with type information
      const allCollections = await apiService.getAllCollections();
      const movieCollectionObjects = collectionNames.map(name => 
        allCollections.find(c => c.name === name)
      ).filter(Boolean);
      
      setCollections(movieCollectionObjects);
      onRefresh();
    } catch (error) {
      console.error('Error handling collection rename:', error);
      onShowAlert('Failed to handle collection rename', 'error');
    }
  };

  // Drag and drop handler for collection reordering
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    // Extract collection name and movie IDs from the drag event
    const activeId = active.id;
    const overId = over.id;
    
    // Find which collection this belongs to
    let targetCollection = null;
    let activeMovie = null;
    let overMovie = null;
    
    for (const [collectionName, movies] of Object.entries(collectionMembers)) {
      const activeFound = movies.find(m => `${collectionName}-${m.id}` === activeId);
      const overFound = movies.find(m => `${collectionName}-${m.id}` === overId);
      
      if (activeFound && overFound) {
        targetCollection = collectionName;
        activeMovie = activeFound;
        overMovie = overFound;
        break;
      }
    }

    if (!targetCollection || !activeMovie || !overMovie) {
      return;
    }

    try {
      // Get the collection ID
      const allCollections = await apiService.getAllCollections();
      const collection = allCollections.find(c => c.name === targetCollection);
      
      if (!collection) {
        console.error('Collection not found:', targetCollection);
        return;
      }

      // Calculate new order
      const movies = collectionMembers[targetCollection];
      const oldIndex = movies.findIndex(m => m.id === activeMovie.id);
      const newIndex = movies.findIndex(m => m.id === overMovie.id);
      
      // Update local state immediately for better UX
      const newMovies = arrayMove(movies, oldIndex, newIndex);
      setCollectionMembers(prev => ({
        ...prev,
        [targetCollection]: newMovies
      }));

      // Update ALL movies in the collection with appropriate ordering
      const updatePromises = newMovies.map((movie, index) => {
        // For Watch Next collection, use reverse order (highest order first)
        // For other collections, use sequential order (lowest order first)
        const order = collection.type === 'watch_next' 
          ? newMovies.length - index  // Reverse order: first item gets highest number
          : index + 1;                 // Sequential order: first item gets 1
        return apiService.updateMovieOrder(movie.id, collection.id, order);
      });
      
      // Update backend and refresh main UI
      Promise.all(updatePromises).then(() => {
        // Success: refresh main UI to reflect changes
        onRefresh();
      }).catch(error => {
        console.error('Error updating collection order:', error);
        onShowAlert('Failed to update collection order', 'error');
        // Revert local state on error
        onRefresh();
      });
    } catch (error) {
      console.error('Error updating collection order:', error);
      onShowAlert('Failed to update collection order', 'error');
      // Revert local state on error
      onRefresh();
    }
  };

  return (
    <>
      <div 
        className="movie-detail-overlay" 
        onClick={onClose}
        onWheel={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onScroll={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div 
          className="movie-detail-card" 
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onScroll={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <button className="movie-detail-close" onClick={onClose}>
            <BsX />
          </button>

          {/* Inline Poster Selector - positioned relative to card */}
          <InlinePosterSelector
            movie={currentData}
            isOpen={showPosterSelector}
            onSelectPoster={handlePosterSelect}
            currentPosterPath={poster_path}
            position={selectorPosition}
          />
          
          <div className="movie-detail-content">
            {/* Overlay when poster selector is open - covers all content */}
            {showPosterSelector && (
              <div 
                className="poster-selector-overlay"
                onClick={() => setShowPosterSelector(false)}
              />
            )}
            {/* Main Header Section */}
            <div 
              className="movie-detail-header"
              style={{
                '--backdrop-image': backdrop_path 
                  ? `url(${getBackdropUrl(backdrop_path)})` 
                  : 'none'
              }}
            >
              <div className="movie-detail-poster-container" ref={posterRef}>
                <div 
                  className="movie-detail-poster"
                  onClick={handlePosterClick}
                  style={{ cursor: currentData.tmdb_id ? 'pointer' : 'default' }}
                  title={currentData.tmdb_id ? 'Click to change poster' : ''}
                >
                  {poster_path ? (
                    <img 
                      src={getPosterUrl(poster_path)} 
                      alt={`${title} poster`}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="movie-detail-poster-placeholder">
                      No Image Available
                    </div>
                  )}
                  
                  {/* Loading spinner overlay */}
                  {posterLoading && (
                    <div className="poster-loading-overlay">
                      <div className="poster-spinner"></div>
                    </div>
                  )}
                  
                  {/* Watch Next Star Overlay */}
                  <button
                    className={`poster-watch-next-star ${collections.some(c => c.type === 'watch_next') ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWatchNextToggle(e);
                    }}
                    title={collections.some(c => c.type === 'watch_next') ? 'Remove from Watch Next' : 'Add to Watch Next'}
                    aria-label="Toggle Watch Next"
                  >
                    <svg 
                      className="star-icon" 
                      viewBox="0 0 24 24" 
                      fill={collections.some(c => c.type === 'watch_next') ? "currentColor" : "none"}
                      stroke="currentColor"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="movie-detail-main-info">
                <h1 
                  className="movie-detail-title"
                  onMouseEnter={() => setShowCopyIcon(true)}
                  onMouseLeave={() => setShowCopyIcon(false)}
                >
                  {editingField === 'title' ? (
                    <div className="input-group">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="form-control"
                        style={{ fontSize: '2rem', fontWeight: '700', paddingRight: '60px' }}
                      />
                      <div className="input-group-append">
                        <button 
                          className="edit-action-btn" 
                          onClick={saveEdit}
                          disabled={saving}
                          title="Sauver"
                        >
                          <BsCheck size={12} />
                        </button>
                        <button 
                          className="edit-action-btn" 
                          onClick={cancelEditing}
                          title="Annuler"
                        >
                          <BsX size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="title-container">
                      <span 
                        className="editable" 
                        onClick={() => startEditing('title', title)}
                      >
                        {title}
                        {(release_date ? new Date(release_date).getFullYear() : year) && 
                          ` (${release_date ? new Date(release_date).getFullYear() : year})`
                        }
                      </span>
                      {showCopyIcon && (
                        <button 
                          className="copy-title-btn"
                          onClick={copyTitleToClipboard}
                          title="Copier le titre"
                        >
                          <BsCopy size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </h1>
                {director && (
                    <span className="fact-item director">
                      Directed by <span 
                        className="clickable-name" 
                        onClick={() => handleDirectorClick(director)}
                      >
                        {director}
                      </span>
                    </span>
                  )}
                <div className="movie-detail-facts">
                  <span className="fact-item">
                    {renderGenres(genres)} | {formatRuntime(runtime)} | {renderClickableAge(recommended_age)}
                  </span>
                </div>

                {/* Ratings Section */}
                <CompactRatingsWidget
                  tmdbRating={tmdb_rating}
                  imdbRating={imdb_rating}
                  rottenTomatoRating={rotten_tomato_rating}
                  tmdbLink={tmdb_link}
                  imdbLink={imdb_link}
                  rottenTomatoesLink={rotten_tomatoes_link || `https://www.rottentomatoes.com/m/${original_title?.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
                  onRefresh={refreshRatings}
                  refreshing={refreshingRatings}
                />

                {/* Overview */}
                <div className="movie-detail-overview">
                  <h3>Overview</h3>
                  {editingField === 'overview' ? (
                    <div className="input-group">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        rows="4"
                        className="form-control"
                        placeholder="Enter movie overview..."
                        style={{ paddingRight: '60px', resize: 'vertical' }}
                      />
                      <div className="input-group-append">
                        <button 
                          className="edit-action-btn" 
                          onClick={saveEdit}
                          disabled={saving}
                          title="Sauver"
                        >
                          <BsCheck size={12} />
                        </button>
                        <button 
                          className="edit-action-btn" 
                          onClick={cancelEditing}
                          title="Annuler"
                        >
                          <BsX size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p 
                      className="editable" 
                      onClick={() => startEditing('overview', overview || plot)}
                    >
                      {overview || plot || 'Click to add overview...'}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="movie-detail-actions">
                  <div className="action-buttons">
                    {trailerEmbedUrl ? (
                      <button 
                        className="action-btn play-trailer"
                        onClick={() => setShowTrailer(true)}
                      >
                        <BsPlay className="action-icon" />
                        Play Trailer
                      </button>
                    ) : (
                      <button className="action-btn play-trailer" disabled>
                        <BsPlay className="action-icon" />
                        No Trailer Available
                      </button>
                    )}
                    
                    {onDelete && (
                      <button 
                        ref={deleteBtnRef}
                        className={`action-btn ${confirmDelete ? 'delete-movie-confirm' : 'delete-movie'}`}
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        <BsTrash className="action-icon" />
                        {confirmDelete ? 'Are you sure?' : 'Delete Movie'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="movie-detail-body">
              <div className="movie-detail-main">
                {/* Cast Section */}
                {cast && cast.length > 0 && (
                  <div className="movie-detail-cast">
                    <h3>Cast</h3>
                    <div className="cast-horizontal">
                      {cast.slice(0, 10).map((actor, index) => (
                        <div key={index} className="cast-member">
                          {actor.local_profile_path ? (
                            <img 
                              src={getProfileUrl(actor.local_profile_path)} 
                              alt={actor.name}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="cast-placeholder">
                              No Photo
                            </div>
                          )}
                          <div className="cast-info">
                            <span 
                              className="cast-name clickable-name" 
                              onClick={() => handleActorClick(actor.name)}
                            >
                              {actor.name}
                            </span>
                            <span className="cast-character">{actor.character || ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Box Set Members Section */}
                {boxSetMembers && boxSetMembers.length > 1 && collections.find(c => c.type === 'box_set') && (() => {
                  const boxSetCollection = collections.find(c => c.type === 'box_set');
                  return (
                  <div className="movie-detail-boxset">
                    <h3>"{collections.find(c => c.type === 'box_set')?.name}" box set</h3>
                    <div className="boxset-posters-horizontal">
                      {boxSetMembers.map((member, index) => (
                        <div 
                          key={`boxset-${member.id}`} 
                          className={`boxset-poster-item ${member.id === id ? 'current' : ''}`}
                          onClick={() => handleMovieTitleClick(member.id)}
                        >
                          <div className="boxset-poster-container">
                            {member.poster_path ? (
                              <img 
                                src={getPosterUrl(member.poster_path)} 
                                alt={member.title}
                                className="boxset-poster-image"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="boxset-poster-placeholder">
                                <BsFilm size={32} />
                              </div>
                            )}
                            <div className="boxset-poster-overlay">
                              <div className="boxset-poster-title">{member.title}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })()}

                {/* Collection Members Sections */}
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  autoScroll={{
                    enabled: true,
                    threshold: {
                      x: 0.2,
                      y: 0
                    },
                    acceleration: 10,
                    interval: 5,
                    order: ['x', 'y']
                  }}
                >
                  {Object.entries(collectionMembers).map(([collectionName, members]) => {
                    if (members.length === 0) return null;
                    
                    // Filter out box_set collections from display (they have their own section)
                    const collection = collections.find(c => c.name === collectionName);
                    if (collection && collection.type === 'box_set') {
                      return null;
                    }
                    
                    // If collection not found in current movie's collections, skip it (e.g., after removal)
                    if (!collection) {
                      return null;
                    }
                    
                    // Special styling for Watch Next collection
                    const isWatchNext = collection && collection.type === 'watch_next';
                    
                    return (
                      <div key={collectionName} className={`movie-detail-collection ${isWatchNext ? 'watch-next-collection' : ''}`}>
                        <h3>
                          {isWatchNext ? (
                            <>
                              <svg 
                                className="watch-next-star-icon" 
                                viewBox="0 0 24 24" 
                                fill="currentColor"
                                stroke="currentColor"
                              >
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                              In Watch Next
                            </>
                          ) : (
                            `"${collectionName}" collection`
                          )}
                        </h3>
                        <SortableContext 
                          items={members.map(member => `${collectionName}-${member.id}`)}
                          strategy={horizontalListSortingStrategy}
                        >
                          <div className="collection-posters-horizontal">
                            {members.map((member, index) => (
                              <SortableCollectionMember
                                key={member.id}
                                movie={member}
                                collectionName={collectionName}
                                onMovieClick={handleMovieTitleClick}
                                getPosterUrl={getPosterUrl}
                                currentMovieId={movieDetails.id}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </div>
                    );
                  })}
                </DndContext>

              </div>

              {/* Sidebar */}
              <div className="movie-detail-sidebar">

                {/* Movie Facts */}
                <div className="sidebar-section">
                  <h4>Original Title</h4>
                  <p>{original_title || title}</p>
                  
                  <h4>Original Language</h4>
                  <p>{getLanguageName(original_language)}</p>
                  
                  <h4>Budget</h4>
                  <p>{formatCurrency(budget)}</p>
                  
                  <h4>Revenue</h4>
                  <p>{formatCurrency(revenue)}</p>
                </div>

                {/* Movie Details */}
                <div className="sidebar-section">
                  <h4>Movie Details</h4>
                  <div className="collection-facts">
                    <div className="fact-row">
                      <span className="fact-label">Format:</span>
                      {editingField === 'format' ? (
                        <div className="input-group">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="form-select"
                            style={{ paddingRight: '60px' }}
                          >
                            <option value="">Select format</option>
                            <option value="Blu-ray">Blu-ray</option>
                            <option value="Blu-ray 4K">Blu-ray 4K</option>
                            <option value="DVD">DVD</option>
                            <option value="Digital">Digital</option>
                          </select>
                          <div className="input-group-append">
                            <button 
                              className="edit-action-btn" 
                              onClick={saveEdit}
                              disabled={saving}
                              title="Sauver"
                            >
                              <BsCheck size={12} />
                            </button>
                            <button 
                              className="edit-action-btn" 
                              onClick={cancelEditing}
                              title="Annuler"
                            >
                              <BsX size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span 
                          className="fact-value editable" 
                          onClick={() => startEditing('format', format)}
                        >
                          {format || '-'}
                        </span>
                      )}
                    </div>
                    <div className="fact-row">
                      <span className="fact-label">Status:</span>
                      {editingField === 'title_status' ? (
                        <div className="input-group">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="form-select"
                            style={{ paddingRight: '60px' }}
                          >
                            <option value="owned">Owned</option>
                            <option value="wish">Wish List</option>
                            <option value="to_sell">To Sell</option>
                          </select>
                          <div className="input-group-append">
                            <button 
                              className="edit-action-btn" 
                              onClick={saveEdit}
                              disabled={saving}
                              title="Save"
                            >
                              <BsCheck size={12} />
                            </button>
                            <button 
                              className="edit-action-btn" 
                              onClick={cancelEditing}
                              title="Cancel"
                            >
                              <BsX size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span 
                          className="fact-value editable"
                          onClick={() => startEditing('title_status', title_status || 'owned')}
                        >
                          {getStatusLabel(title_status || 'owned')}
                        </span>
                      )}
                    </div>
                    <div className="fact-row">
                      <span className="fact-label">
                        {title_status === 'wish' ? 'Added to Wish List:' : 'Acquired:'}
                      </span>
                      {editingField === 'acquired_date' ? (
                          <div className="input-group">
                            <input
                              type="date"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              autoFocus
                              className="form-control"
                              style={{ paddingRight: '60px' }}
                            />
                            <div className="input-group-append">
                              <button 
                                className="edit-action-btn" 
                                onClick={saveEdit}
                                disabled={saving}
                                title="Sauver"
                              >
                                <BsCheck size={12} />
                              </button>
                              <button 
                                className="edit-action-btn" 
                                onClick={cancelEditing}
                                title="Annuler"
                              >
                                <BsX size={12} />
                              </button>
                            </div>
                          </div>
                      ) : (
                        <span 
                          className="fact-value editable" 
                          onClick={() => startEditing('acquired_date', acquired_date)}
                        >
                          {formatDate(acquired_date)}
                        </span>
                      )}
                    </div>
                    {title_status === 'owned' && (
                      <div className="fact-row">
                        <span className="fact-label">Price:</span>
                        {editingField === 'price' ? (
                          <div className="input-group">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              autoFocus
                              placeholder="0.00"
                              className="form-control"
                              style={{ paddingRight: '60px' }}
                            />
                            <div className="input-group-append">
                              <button 
                                className="edit-action-btn" 
                                onClick={saveEdit}
                                disabled={saving}
                                title="Sauver"
                              >
                                <BsCheck size={12} />
                              </button>
                              <button 
                                className="edit-action-btn" 
                                onClick={cancelEditing}
                                title="Annuler"
                              >
                                <BsX size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span 
                            className="fact-value editable" 
                            onClick={() => startEditing('price', price)}
                          >
                            {formatPrice(price)}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Box Set Name - Only show for owned movies */}
                    {currentData.title_status !== 'wish' && (
                      <div className="fact-row">
                        <span className="fact-label">Box Set:</span>
                        {editingField === 'box_set_collection' ? (
                        <div className="input-group" style={{ position: 'relative' }}>
                          <FormControl
                            type="text"
                            value={editValue}
                            onChange={(e) => handleBoxSetInputChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={handleBoxSetInputFocus}
                            autoFocus
                            placeholder="Enter box set name"
                            style={{ paddingRight: '60px' }}
                          />
                          
                          {/* Box set suggestions dropdown */}
                          {showBoxSetDropdown && filteredBoxSets.length > 0 && (
                            <div 
                              className="box-set-dropdown"
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                backgroundColor: '#2d3748',
                                border: '1px solid #4a5568',
                                borderRadius: '4px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                zIndex: 1000,
                                maxHeight: '200px',
                                overflowY: 'auto'
                              }}
                            >
                              {filteredBoxSets.map((name, index) => (
                                <div
                                  key={index}
                                  className="box-set-suggestion"
                                  onClick={() => handleBoxSetSelect(name)}
                                  style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    color: '#e2e8f0',
                                    borderBottom: index < filteredBoxSets.length - 1 ? '1px solid #4a5568' : 'none'
                                  }}
                                  onMouseEnter={(e) => e.target.style.backgroundColor = '#4a5568'}
                                  onMouseLeave={(e) => e.target.style.backgroundColor = '#2d3748'}
                                >
                                  {name}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <div className="input-group-append">
                            <button 
                              className="edit-action-btn" 
                              onClick={saveEdit}
                              disabled={saving}
                              title="Save"
                            >
                              <BsCheck size={12} />
                            </button>
                            <button 
                              className="edit-action-btn" 
                              onClick={cancelEditing}
                              title="Cancel"
                            >
                              <BsX size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span 
                          className="fact-value editable" 
                          onClick={() => startEditing('box_set_collection', collections.find(c => c.type === 'box_set')?.name || '')}
                        >
                          {collections.find(c => c.type === 'box_set')?.name || '-'}
                        </span>
                      )}
                    </div>
                    )}
                    
                  </div>
                </div>

                {/* Collections Section - Only show for owned movies */}
                {currentData.title_status !== 'wish' && (
                  <div className="sidebar-section">
                    <h4>Collections</h4>
                    <CollectionTagsInput
                      value={collections.filter(c => c.type === 'user').map(c => c.name)}
                      onChange={handleCollectionsChange}
                      placeholder="Add collections..."
                      movieId={movieDetails.id}
                    />
                  </div>
                )}

                {/* Comments Section */}
                <div className="sidebar-section">
                  <h4>Comments</h4>
                  {editingField === 'comments' ? (
                      <div className="input-group">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          rows="3"
                          placeholder="Add your comments..."
                          className="form-control"
                          style={{ paddingRight: '60px', resize: 'vertical' }}
                        />
                        <div className="input-group-append">
                          <button 
                            className="edit-action-btn" 
                            onClick={saveEdit}
                            disabled={saving}
                            title="Sauver"
                          >
                            <BsCheck size={12} />
                          </button>
                          <button 
                            className="edit-action-btn" 
                            onClick={cancelEditing}
                            title="Annuler"
                          >
                            <BsX size={12} />
                          </button>
                        </div>
                      </div>
                  ) : (
                    <p 
                      className="comments-text editable" 
                      onClick={() => startEditing('comments', comments)}
                    >
                      {comments || 'Click to add comments...'}
                    </p>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trailer Modal - Now rendered at the same level as the main overlay */}
      {showTrailer && trailerEmbedUrl && (
        <div className="trailer-modal-overlay" onClick={() => setShowTrailer(false)}>
          <div className="trailer-modal" onClick={(e) => e.stopPropagation()}>
            <button className="trailer-modal-close" onClick={() => setShowTrailer(false)}>
              <BsX />
            </button>
            <div className="trailer-video-container">
              <iframe
                src={trailerEmbedUrl}
                title={`${title} Trailer`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="trailer-video"
                onError={(e) => {
                  console.error('YouTube iframe error:', e);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Movie</h3>
            <p>Are you sure you want to delete "{title}" from your collection?</p>
            <p className="delete-warning">This action cannot be undone.</p>
            <div className="delete-confirm-buttons">
              <button 
                className="cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                <BsXIcon className="action-icon" />
                Cancel
              </button>
              <button 
                className="delete-btn"
                onClick={handleDelete}
                disabled={deleting}
              >
                <BsTrash className="action-icon" />
                {deleting ? 'Deleting...' : 'Delete Movie'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Box Set Propagation Dialog */}
      {showPropagationDialog && pendingUpdate && (
        <div className="propagation-dialog-overlay">
          <div className="propagation-dialog">
            <div className="propagation-dialog-header">
              <h3>Update Box Set</h3>
              <button className="propagation-dialog-close" onClick={handlePropagationCancel}>
                <BsX />
              </button>
            </div>
            <div className="propagation-dialog-content">
              <p>
                You're updating the <strong>{pendingUpdate.field}</strong> field. 
                Would you like to apply this change to all movies in the "{collections.find(c => c.type === 'box_set')?.name}" box set?
              </p>
              <div className="propagation-dialog-buttons">
                <button 
                  className="propagation-btn this-movie"
                  onClick={() => handlePropagationChoice(false)}
                  disabled={saving}
                >
                  This movie only
                </button>
                <button 
                  className="propagation-btn all-movies"
                  onClick={() => handlePropagationChoice(true)}
                  disabled={saving}
                >
                  All movies in box set
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collection Rename Dialog */}
      <CollectionRenameDialog
        show={showCollectionRenameDialog}
        onHide={() => setShowCollectionRenameDialog(false)}
        oldName={collectionRenameData.oldName}
        newName={collectionRenameData.newName}
        onConfirm={handleCollectionRenameConfirm}
      />
    </>
  );
};

export default MovieDetailCard;
