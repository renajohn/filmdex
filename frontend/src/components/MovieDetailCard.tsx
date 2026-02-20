import React, { useState, useEffect, useRef } from 'react';
import { FormControl } from 'react-bootstrap';
import CompactRatingsWidget from './CompactRatingsWidget';
import InlinePosterSelector from './InlinePosterSelector';
import CollectionTagsInput from './CollectionTagsInput';
import CollectionRenameDialog from './CollectionRenameDialog';
import apiService from '../services/api';
import { getLanguageName } from '../services/languageCountryUtils';
import { BsX, BsPlay, BsTrash, BsCheck, BsX as BsXIcon, BsCopy, BsFilm, BsGripVertical, BsEye } from 'react-icons/bs';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './MovieDetailCard.css';

interface MovieData {
  id: number;
  title: string;
  plot?: string;
  director?: string;
  imdb_rating?: number | null;
  rotten_tomato_rating?: number | null;
  rotten_tomatoes_link?: string;
  year?: string | number;
  release_date?: string;
  format?: string;
  acquired_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  genres?: string | string[] | Array<{ id: number; name: string }>;
  runtime?: number;
  budget?: number;
  revenue?: number;
  original_title?: string;
  original_language?: string;
  imdb_link?: string;
  tmdb_link?: string;
  tmdb_rating?: number | null;
  tmdb_id?: number;
  price?: number;
  comments?: string;
  trailer_key?: string;
  trailer_site?: string;
  recommended_age?: number | null;
  title_status?: string;
  last_watched?: string | null;
  watch_count?: number;
  never_seen?: boolean;
  media_type?: string;
  movie_id?: number;
  [key: string]: unknown;
}

interface CastMember {
  name: string;
  character?: string;
  local_profile_path?: string;
}

interface CollectionObj {
  id: number;
  name: string;
  type: string;
  [key: string]: unknown;
}

interface CollectionMoviesResult {
  movies: MovieData[];
}

interface PendingUpdate {
  field: string;
  value: string;
}

interface PosterSelection {
  file_path: string;
  width: number;
  height: number;
  iso_639_1?: string;
  isCustom?: boolean;
}

interface SelectorPosition {
  top: number;
  left: number;
  right?: number;
  arrowLeft?: number;
}

interface ApiErrorLike {
  status?: number;
  code?: string;
  data?: Record<string, unknown>;
  message?: string;
}

interface WatchedResult {
  last_watched: string;
  watch_count: number;
}

interface SortableCollectionMemberProps {
  movie: MovieData;
  collectionName: string;
  onMovieClick: (id: number) => void;
  getPosterUrl: (path: string | undefined) => string | null;
  currentMovieId: number;
}

interface MovieDetailCardProps {
  movieDetails: MovieData | null;
  onClose: () => void;
  onEdit?: (...args: unknown[]) => void;
  onDelete?: (id: number) => Promise<void>;
  onShowAlert?: (message: string, variant: string) => void;
  onRefresh?: () => void;
  onMovieClick?: (id: number) => void;
  onSearch?: (query: string) => void;
  loading?: boolean;
}

// Sortable Collection Member Component
const SortableCollectionMember = ({ movie, collectionName, onMovieClick, getPosterUrl, currentMovieId }: SortableCollectionMemberProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({ id: `${collectionName}-${movie.id}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) || undefined,
    transition: isDragging ? 'none' : 'transform 0.1s ease',
    ...(isDragging && {
      transform: `${CSS.Transform.toString(transform)} rotate(-1deg) scale(1.1)`,

      zIndex: 1001,
      position: 'relative' as const
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
            src={getPosterUrl(movie.poster_path) || undefined}
            alt={movie.title}
            className="collection-poster-image"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
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

const MovieDetailCard = ({ movieDetails, onClose, onEdit, onDelete, onShowAlert, onRefresh, onMovieClick, onSearch, loading = false }: MovieDetailCardProps) => {
  const [showTrailer, setShowTrailer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const [cast, setCast] = useState<CastMember[]>([]);

  // In-place editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshingRatings, setRefreshingRatings] = useState(false);
  const [localMovieData, setLocalMovieData] = useState<MovieData | null>(movieDetails);
  const [showCopyIcon, setShowCopyIcon] = useState(false);
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const [selectorPosition, setSelectorPosition] = useState<SelectorPosition>({ top: 0, left: 0 });
  const [posterLoading, setPosterLoading] = useState(false);
  const [boxSetNames, setBoxSetNames] = useState<string[]>([]);
  const [showBoxSetDropdown, setShowBoxSetDropdown] = useState(false);
  const [filteredBoxSets, setFilteredBoxSets] = useState<string[]>([]);
  const [boxSetMembers, setBoxSetMembers] = useState<MovieData[]>([]);
  const [showPropagationDialog, setShowPropagationDialog] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [collections, setCollections] = useState<CollectionObj[]>([]);
  const [showCollectionRenameDialog, setShowCollectionRenameDialog] = useState(false);
  const [collectionRenameData] = useState({ oldName: '', newName: '', action: 'create' });
  const [collectionMembers, setCollectionMembers] = useState<Record<string, MovieData[]>>({}); // { collectionName: [movies] }
  const [markingWatched, setMarkingWatched] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [watchDate, setWatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [showWatchedPrompt, setShowWatchedPrompt] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  
  // Search handlers
  const handleDirectorClick = (directorName: string) => {
    if (onSearch) {
      onSearch(`director:"${directorName}"`);
      onClose(); // Close the detail dialog
    }
  };

  const handleActorClick = (actorName: string) => {
    if (onSearch) {
      onSearch(`actor:"${actorName}"`);
      onClose(); // Close the detail dialog
    }
  };

  const handleGenreClick = (genreName: string) => {
    if (onSearch) {
      onSearch(`genre:"${genreName}"`);
      onClose(); // Close the detail dialog
    }
  };

  const handleAgeClick = (age: number | null | undefined) => {
    if (onSearch && age !== null && age !== undefined) {
      onSearch(`recommended_age:${age}`);
      onClose(); // Close the detail dialog
    }
  };

  // Helper function to render clickable genres
  const renderGenres = (genresString: string | string[] | Array<{ id: number; name: string }> | undefined) => {
    if (!genresString) return null;

    // Handle array of objects ({id, name}), array of strings, or comma-separated string
    let genreList: string[];
    if (Array.isArray(genresString)) {
      genreList = genresString
        .map(g => (typeof g === 'object' && g !== null ? g.name : String(g)))
        .filter(Boolean);
    } else {
      genreList = (genresString as string).split(',').map((genre: string) => genre.trim()).filter((genre: string) => genre);
    }

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
  const renderClickableAge = (age: number | null | undefined) => {
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
    return undefined;
  }, [movieDetails]);
  
  // Handle ESC key press for main detail view
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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

    const handleKeyDown = (event: KeyboardEvent) => {
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

  // Load cast data
  useEffect(() => {
    const loadCast = async () => {
      if (!movieDetails?.id) return;
      
      try {
        const castData = await apiService.getMovieCast(movieDetails.id) as CastMember[];
        setCast(castData);
      } catch (error) {
        // Failed to load cast
      }
    };

    loadCast();
  }, [movieDetails?.id]);

  // Load collection names for autocomplete
  // Load collection names
  const loadBoxSetNames = async () => {
    try {
      const allCollections = await apiService.getAllCollections() as CollectionObj[];
      const boxSetCollections = allCollections.filter((c: CollectionObj) => c.type === 'box_set');
      const names = boxSetCollections.map((c: CollectionObj) => c.name);
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
        const members = await apiService.getMoviesByCollection(boxSetCollection.name) as MovieData[];
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
        const movieCollections = await apiService.getMovieCollections(movieDetails.id) as Array<{ collection_name: string }>;
        const collectionNames = movieCollections.map((c: { collection_name: string }) => c.collection_name);

        // Get full collection objects with type information
        const allCollections = await apiService.getAllCollections() as CollectionObj[];
        const movieCollectionObjects = collectionNames.map((name: string) =>
          allCollections.find((c: CollectionObj) => c.name === name)
        ).filter(Boolean) as CollectionObj[];

        setCollections(movieCollectionObjects);

        // Load members for each collection
        if (collectionNames.length > 0) {
          const membersPromises = collectionNames.map(async (collectionName: string) => {
            try {
              const collection = allCollections.find((c: CollectionObj) => c.name === collectionName);
              if (collection) {
                const result = await apiService.getCollectionMovies(collection.id) as CollectionMoviesResult;
                return { collectionName, movies: result.movies };
              }
              return { collectionName, movies: [] as MovieData[] };
            } catch (error) {
              console.error(`Error loading members for collection ${collectionName}:`, error);
              return { collectionName, movies: [] as MovieData[] };
            }
          });

          const membersResults = await Promise.all(membersPromises);
          const membersMap: Record<string, MovieData[]> = {};
          membersResults.forEach(({ collectionName, movies }: { collectionName: string; movies: MovieData[] }) => {
            // Check if this is the Watch Next collection and reverse the order
            const collection = allCollections.find((c: CollectionObj) => c.name === collectionName);
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
    const handleClickOutside = (event: MouseEvent) => {
      if (showBoxSetDropdown && !(event.target as HTMLElement).closest('.box-set-dropdown') && !(event.target as HTMLElement).closest('.input-group')) {
        setShowBoxSetDropdown(false);
      }
    };

    if (showBoxSetDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [showBoxSetDropdown]);

  // Reset confirm state when clicking outside delete button (place before early returns)
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (confirmDelete && deleteBtnRef.current && !deleteBtnRef.current.contains(e.target as Node)) {
        setConfirmDelete(false);
      }
    };
    document.addEventListener('click', handleDocClick, true);
    return () => document.removeEventListener('click', handleDocClick, true);
  }, [confirmDelete]);

  // Close date picker when clicking outside
  useEffect(() => {
    if (!showDatePicker) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  if (!movieDetails && !loading) {
    console.log('MovieDetailCard: Returning null - no movieDetails and not loading');
    return null;
  }

  // Use local data for display, fallback to original movieDetails
  const currentData = localMovieData || movieDetails;
  
  if (!currentData && !loading) {
    console.log('MovieDetailCard: No currentData available');
    return null;
  }
  
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
    title_status
  } = (currentData || {}) as MovieData;

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatRuntime = (minutes: number | undefined) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPrice = (price: number | undefined) => {
    if (!price) return '-';
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'owned': return 'Owned';
      case 'wish': return 'Wish List';
      case 'to_sell': return 'To Sell';
      default: return 'Unknown';
    }
  };



  const getPosterUrl = (posterPath: string | undefined) => {
    if (!posterPath) return null;
    // If it's already a local path, return as is with ingress support
    if (posterPath.startsWith('/images/') || posterPath.startsWith('/api/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${posterPath}`; // Use dynamic base URL for ingress
    }
   
    // If it's already a full URL, return as is
    return posterPath;
  };

  const getBackdropUrl = (backdropPath: string | undefined) => {
    if (!backdropPath) return null;
    
    // Already a full URL
    if (backdropPath.startsWith('http')) {
      return backdropPath;
    }
    
    // If it's already a local path, return as is with ingress support
    if (backdropPath.startsWith('/images/') || backdropPath.startsWith('/api/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${backdropPath}`;
    }
    
    // Default: prepend /api/images/
    const baseUrl = apiService.getImageBaseUrl();
    return `${baseUrl}/api/images/${backdropPath}`;
  };

  const getProfileUrl = (profilePath: string | undefined) => {
    if (!profilePath) return null;
    
    // Already a full URL
    if (profilePath.startsWith('http')) {
      return profilePath;
    }
    
    // If it's already a local path, return as is with ingress support
    if (profilePath.startsWith('/images/') || profilePath.startsWith('/api/images/')) {
      const baseUrl = apiService.getImageBaseUrl();
      return `${baseUrl}${profilePath}`;
    }
    
    // Default: prepend /api/images/
    const baseUrl = apiService.getImageBaseUrl();
    return `${baseUrl}/api/images/${profilePath}`;
  };


  const getTrailerEmbedUrl = (trailerKey: string | undefined, trailerSite: string | undefined) => {
    if (!trailerKey || trailerSite !== 'YouTube') {
      return null;
    }
    return `https://www.youtube.com/embed/${trailerKey}?rel=0&modestbranding=1&showinfo=0`;
  };

  const trailerEmbedUrl = getTrailerEmbedUrl(trailer_key, trailer_site);

  // In-place editing functions
  const startEditing = (field: string, currentValue: unknown) => {
    setEditingField(field);
    // Special handling for acquired_date to ensure proper format
    if (field === 'acquired_date' && currentValue) {
      try {
        const date = new Date(currentValue as string | number);
        if (!isNaN(date.getTime())) {
          setEditValue(date.toISOString().split('T')[0]);
        } else {
          setEditValue('');
        }
      } catch {
        setEditValue('');
      }
    } else {
      setEditValue(String(currentValue || ''));
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
    setShowBoxSetDropdown(false);
    setFilteredBoxSets([]);
  };

  // Collection name typeahead functions
  const handleBoxSetInputChange = (value: string) => {
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

  const handleBoxSetSelect = async (boxSetName: string) => {
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
        value: editValue
      });
      setShowPropagationDialog(true);
      return;
    }
    
    // Proceed with normal save if no dialog needed
    await performUpdate(editingField, editValue, false);
  };

  const performUpdate = async (field: string, value: string, propagateToAll = false) => {
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
          const allCollections = await apiService.getAllCollections() as CollectionObj[];
          const targetBoxSetCollection = allCollections.find((c: CollectionObj) => c.name === newBoxSetName && c.type === 'box_set');
          
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
        const movieCollections = await apiService.getMovieCollections(id) as Array<{ collection_name: string }>;
        const collectionNames = movieCollections.map((c: { collection_name: string }) => c.collection_name);

        const allCollsRefresh = await apiService.getAllCollections() as CollectionObj[];
        const movieCollectionObjects = collectionNames.map((name: string) =>
          allCollsRefresh.find((c: CollectionObj) => c.name === name)
        ).filter(Boolean) as CollectionObj[];

        setCollections(movieCollectionObjects);

        // Refresh box set members if we have a box set
        const newBoxSetCollection = movieCollectionObjects.find((c: CollectionObj) => c.type === 'box_set');
        if (newBoxSetCollection) {
          const members = await apiService.getMoviesByCollection(newBoxSetCollection.name) as MovieData[];
          setBoxSetMembers(members);
        } else {
          setBoxSetMembers([]);
        }

        // Clean up any empty collections AFTER refreshing UI
        setTimeout(async () => {
          try {
            const cleanupResult = await apiService.cleanupEmptyCollections() as { cleanedCount: number };

            // If collections were cleaned up, refresh the collections list
            if (cleanupResult.cleanedCount > 0) {
              const refreshedCollections = await apiService.getAllCollections() as CollectionObj[];
              const refreshedMovieCollections = await apiService.getMovieCollections(id) as Array<{ collection_name: string }>;
              const refreshedCollectionNames = refreshedMovieCollections.map((c: { collection_name: string }) => c.collection_name);
              const refreshedMovieCollectionObjects = refreshedCollectionNames.map((name: string) =>
                refreshedCollections.find((c: CollectionObj) => c.name === name)
              ).filter(Boolean) as CollectionObj[];

              setCollections(refreshedMovieCollectionObjects);

              // Also refresh box set members after cleanup
              const newBoxSetColl = refreshedMovieCollectionObjects.find((c: CollectionObj) => c.type === 'box_set');
              if (newBoxSetColl) {
                const members = await apiService.getMoviesByCollection(newBoxSetColl.name) as MovieData[];
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
        const fieldMapping: Record<string, string> = {
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
        ...prev!,
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
        const movieColls2 = await apiService.getMovieCollections(movieDetails!.id) as Array<{ collection_name: string }>;
        const collNames2 = movieColls2.map((c: { collection_name: string }) => c.collection_name);

        const allColls2 = await apiService.getAllCollections() as CollectionObj[];
        const movieCollObjs2 = collNames2.map((name: string) =>
          allColls2.find((c: CollectionObj) => c.name === name)
        ).filter(Boolean) as CollectionObj[];

        setCollections(movieCollObjs2);
      }
    } catch (error) {
      console.error('Error updating movie:', error);
      const err = error as ApiErrorLike;
      // Check if it's a duplicate edition error (409 status)
      if (err.status === 409 && err.code === 'DUPLICATE_EDITION') {
        if (onShowAlert) {
          onShowAlert('⚠️ A movie with this title, format, and TMDB ID already exists in your collection. To add a different edition, please use a unique title (e.g., add "Director\'s Cut", "Extended Edition") or choose a different format.', 'danger');
        }
      } else if (err.status === 409) {
        // Other 409 conflicts
        if (onShowAlert) {
          onShowAlert('Failed: ' + (String(err.data?.error) || err.message || 'This movie already exists'), 'danger');
        }
      } else if (err.data?.error) {
        // Show specific error message from server
        if (onShowAlert) {
          onShowAlert('Failed to update: ' + String(err.data.error), 'danger');
        }
      } else {
        // Generic error
        if (onShowAlert) {
          onShowAlert('Failed to update movie: ' + (err.message || 'Unknown error'), 'danger');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      const updatedMovie = await apiService.refreshMovieRatings(id) as MovieData;

      setLocalMovieData(prev => ({
        ...prev!,
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
      await navigator.clipboard.writeText(title || '');
      // Title copied successfully
    } catch (error) {
      console.error('Failed to copy title:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = title || '';
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
      await onDelete(movieDetails!.id);
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

  const handleWatchNextToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if movie is currently in Watch Next collection
    const isCurrentlyInWatchNext = collections.some(c => c.type === 'watch_next');
    
    try {
      await apiService.toggleWatchNext(movieDetails!.id);
      
      // If removing from Watch Next, show the "Did you watch?" prompt
      if (isCurrentlyInWatchNext) {
        setShowWatchedPrompt(true);
        // Auto-hide after 8 seconds
        setTimeout(() => setShowWatchedPrompt(false), 8000);
      }
      
      // Refresh collections to show/hide Watch Next collection immediately
      const movieCollections = await apiService.getMovieCollections(movieDetails!.id) as Array<{ collection_name: string }>;
      const collectionNames = movieCollections.map((c: { collection_name: string }) => c.collection_name);

      // Get full collection objects with type information
      const allCollections = await apiService.getAllCollections() as CollectionObj[];
      const movieCollectionObjects = collectionNames.map((name: string) =>
        allCollections.find((c: CollectionObj) => c.name === name)
      ).filter(Boolean) as CollectionObj[];

      setCollections(movieCollectionObjects);

      // Load members for each collection
      if (collectionNames.length > 0) {
        const membersPromises = collectionNames.map(async (collectionName: string) => {
          try {
            const collection = allCollections.find((c: CollectionObj) => c.name === collectionName);
            if (collection) {
              const result = await apiService.getCollectionMovies(collection.id) as CollectionMoviesResult;
              return { collectionName, movies: result.movies };
            }
            return { collectionName, movies: [] as MovieData[] };
          } catch (error) {
            console.error(`Error loading members for collection ${collectionName}:`, error);
            return { collectionName, movies: [] as MovieData[] };
          }
        });

        const membersResults = await Promise.all(membersPromises);
        const membersMap: Record<string, MovieData[]> = {};
        membersResults.forEach(({ collectionName, movies }: { collectionName: string; movies: MovieData[] }) => {
          // Check if this is the Watch Next collection and reverse the order
          const collection = allCollections.find((c: CollectionObj) => c.name === collectionName);
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

  // Handle marking movie as watched
  // incrementCount: true = always increment, false = only increment if count was 0
  const handleMarkAsWatched = async (customDate: string | null = null, incrementCount = true) => {
    setMarkingWatched(true);
    setShowDatePicker(false);
    try {
      const dateToUse = customDate || new Date().toISOString().split('T')[0];
      const result = await apiService.markMovieAsWatched(movieDetails!.id, dateToUse, incrementCount) as WatchedResult;
      const movieTitle = title;
      const count = result.watch_count;

      // Update local state to show the new last_watched date and watch_count
      setLocalMovieData(prev => ({
        ...prev!,
        last_watched: result.last_watched,
        watch_count: result.watch_count,
        never_seen: false
      }));
      
      if (onShowAlert) {
        // Fun messages based on watch count
        const messages = count === 1
          ? [
              `🎬 "${movieTitle}" — First time! Hope you enjoyed it!`,
              `🍿 "${movieTitle}" checked off! What did you think?`,
              `✨ "${movieTitle}" — Another one for the memory bank!`,
            ]
          : [
              `🎬 "${movieTitle}" — ${count}× now! A new favorite?`,
              `🍿 "${movieTitle}" again! (${count}×) — Must be good!`,
              `🔄 "${movieTitle}" for the ${count}${count === 2 ? 'nd' : count === 3 ? 'rd' : 'th'} time!`,
            ];
        
        const message = messages[Math.floor(Math.random() * messages.length)];
        onShowAlert(message, 'success');
      }
      
      // Refresh the main view
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 100);
      }
    } catch (error) {
      console.error('Error marking movie as watched:', error);
      if (onShowAlert) {
        onShowAlert('Failed to mark as watched. Please try again.', 'danger');
      }
    } finally {
      setMarkingWatched(false);
    }
  };

  // Handle updating watch count directly
  const handleUpdateWatchCount = async (newCount: number) => {
    try {
      const result = await apiService.updateMovieWatchCount(movieDetails!.id, newCount) as WatchedResult;

      setLocalMovieData(prev => ({
        ...prev!,
        watch_count: result.watch_count
      }));
    } catch (error) {
      console.error('Error updating watch count:', error);
      if (onShowAlert) {
        onShowAlert('Failed to update watch count.', 'danger');
      }
    }
  };

  // Toggle date picker for custom watch date
  const toggleDatePicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDatePicker(!showDatePicker);
    setWatchDate(currentData!.last_watched || new Date().toISOString().split('T')[0]);
  };

  // Handle date change - just update local state
  const handleDateChange = (newDate: string) => {
    setWatchDate(newDate);
  };

  // Save on blur (when leaving the input or selecting from picker)
  const handleDateBlur = () => {
    // Only save if date is valid and different from current
    // Don't increment count when changing date via picker - only increment if count was 0
    if (watchDate && watchDate !== (currentData!.last_watched || '')) {
      handleMarkAsWatched(watchDate, false);
    }
  };

  // Handle keyboard events on date input
  const handleDateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // Don't let ESC bubble up to close movie dialog
      setShowDatePicker(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Don't increment count when changing date via picker - only increment if count was 0
      if (watchDate) {
        handleMarkAsWatched(watchDate, false);
      }
    }
  };

  // Handle clearing the watch history (date and count)
  const handleClearWatched = async () => {
    setMarkingWatched(true);
    setShowDatePicker(false);
    try {
      await apiService.clearMovieWatched(movieDetails!.id);

      // Update local state to clear watch history
      setLocalMovieData(prev => ({
        ...prev!,
        last_watched: null,
        watch_count: 0
      }));
      
      if (onShowAlert) {
        onShowAlert('Watch history cleared', 'success');
      }
      
      // Refresh the main view
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 100);
      }
    } catch (error) {
      console.error('Error clearing watch history:', error);
      if (onShowAlert) {
        onShowAlert('Failed to clear watch history. Please try again.', 'danger');
      }
    } finally {
      setMarkingWatched(false);
    }
  };

  const handlePosterClick = () => {
    if (currentData!.tmdb_id) {
      // Calculate position based on actual poster element dimensions
      if (posterRef.current) {
        const posterElement = posterRef.current.querySelector('.movie-detail-poster') as HTMLElement | null;
        const headerElement = posterRef.current.closest('.movie-detail-header') as HTMLElement | null;
        const card = posterRef.current.closest('.movie-detail-card') as HTMLElement | null;
        
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

  const handlePosterSelect = async (poster: PosterSelection) => {
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
        ...prev!,
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
          const latestMovie = await apiService.getMovieById(movieDetails!.id) as MovieData;

          // Update movie with new poster path - preserve ALL existing fields
          const updateData = {
            ...latestMovie,
            poster_path: posterUrl
          };
          
          await apiService.updateMovie(movieDetails!.id, updateData);
          
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
          ...prev!,
          poster_path: movieDetails!.poster_path
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

  // Skeleton loading state
  if (loading) {
    console.log('MovieDetailCard: Rendering loading skeleton');
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

  const handleMovieTitleClick = (movieId: number) => {
    if (onMovieClick) {
      onMovieClick(movieId);
    }
  };

  const handlePropagationChoice = async (propagateToAll: boolean) => {
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
  const handleCollectionsChange = async (newUserCollectionNames: string[]) => {
    try {
      setSaving(true);

      // Get current non-user collections (watch_next, box_set)
      const currentNonUserCollections = collections.filter((c: CollectionObj) => c.type !== 'user');
      const currentNonUserNames = currentNonUserCollections.map((c: CollectionObj) => c.name);

      // Combine user collections with existing non-user collections
      const allCollectionNames = [...newUserCollectionNames, ...currentNonUserNames];

      await apiService.updateMovieCollections(movieDetails!.id, allCollectionNames);

      // Get full collection objects with type information
      const allCollections = await apiService.getAllCollections() as CollectionObj[];
      const movieCollectionObjects = allCollectionNames.map((name: string) =>
        allCollections.find((c: CollectionObj) => c.name === name)
      ).filter(Boolean) as CollectionObj[];

      setCollections(movieCollectionObjects);

      // Reload collection members for the updated collections
      if (allCollectionNames.length > 0) {
        const membersPromises = allCollectionNames.map(async (collectionName: string) => {
          try {
            const collection = allCollections.find((c: CollectionObj) => c.name === collectionName);
            if (collection) {
              const result = await apiService.getCollectionMovies(collection.id) as CollectionMoviesResult;
              return { collectionName, movies: result.movies };
            }
            return { collectionName, movies: [] as MovieData[] };
          } catch (error) {
            console.error(`Error loading members for collection ${collectionName}:`, error);
            return { collectionName, movies: [] as MovieData[] };
          }
        });

        const membersResults = await Promise.all(membersPromises);
        const membersMap: Record<string, MovieData[]> = {};
        membersResults.forEach(({ collectionName, movies }: { collectionName: string; movies: MovieData[] }) => {
          // Check if this is the Watch Next collection and reverse the order
          const collection = allCollections.find((c: CollectionObj) => c.name === collectionName);
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

      if (onRefresh) onRefresh(); // Refresh the movie data
    } catch (error) {
      console.error('Error updating collections:', error);
      if (onShowAlert) onShowAlert('Failed to update collections', 'error');
    } finally {
      setSaving(false);
    }
  };


  const handleCollectionRenameConfirm = async (action: string) => {
    try {
      await apiService.handleCollectionNameChange(
        collectionRenameData.oldName,
        collectionRenameData.newName,
        action
      );
      // Reload collections after rename
      const movieCollections = await apiService.getMovieCollections(movieDetails!.id) as Array<{ collection_name: string }>;
      const collectionNames = movieCollections.map((c: { collection_name: string }) => c.collection_name);

      // Get full collection objects with type information
      const allCollections = await apiService.getAllCollections() as CollectionObj[];
      const movieCollectionObjects = collectionNames.map((name: string) =>
        allCollections.find((c: CollectionObj) => c.name === name)
      ).filter(Boolean) as CollectionObj[];

      setCollections(movieCollectionObjects);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error handling collection rename:', error);
      if (onShowAlert) onShowAlert('Failed to handle collection rename', 'error');
    }
  };

  // Drag and drop handler for collection reordering
  const handleDragEnd = async (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    // Extract collection name and movie IDs from the drag event
    const activeId = active.id;
    const overId = over.id;

    // Find which collection this belongs to
    let targetCollection: string | null = null;
    let activeMovie: MovieData | null = null;
    let overMovie: MovieData | null = null;

    for (const [collectionName, movies] of Object.entries(collectionMembers)) {
      const activeFound = movies.find((m: MovieData) => `${collectionName}-${m.id}` === activeId);
      const overFound = movies.find((m: MovieData) => `${collectionName}-${m.id}` === overId);
      
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
      const allCollections = await apiService.getAllCollections() as CollectionObj[];
      const collection = allCollections.find((c: CollectionObj) => c.name === targetCollection);
      
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
      const updatePromises = newMovies.map((movie: MovieData, index: number) => {
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
        if (onRefresh) onRefresh();
      }).catch(error => {
        console.error('Error updating collection order:', error);
        if (onShowAlert) onShowAlert('Failed to update collection order', 'error');
        // Revert local state on error
        if (onRefresh) onRefresh();
      });
    } catch (error) {
      console.error('Error updating collection order:', error);
      if (onShowAlert) onShowAlert('Failed to update collection order', 'error');
      // Revert local state on error
      if (onRefresh) onRefresh();
    }
  };

  console.log('MovieDetailCard: Rendering with movieDetails:', movieDetails ? 'present' : 'null', 'loading:', loading);
  
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
            movie={currentData as { id?: number; movie_id?: number; tmdb_id?: number; media_type?: string }}
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
              } as React.CSSProperties}
            >
              <div className="movie-detail-poster-container" ref={posterRef}>
                <div 
                  className="movie-detail-poster"
                  onClick={handlePosterClick}
                  style={{ cursor: currentData!.tmdb_id ? 'pointer' : 'default' }}
                  title={currentData!.tmdb_id ? 'Click to change poster' : ''}
                >
                  {poster_path ? (
                    <img
                      src={getPosterUrl(poster_path) || undefined}
                      alt={`${title} poster`}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        (e.target as HTMLImageElement).style.display = 'none';
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
                        rows={4}
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
                    
                    <div className="watched-button-container" ref={datePickerRef}>
                      <button 
                        className={`action-btn watched-today ${(currentData!.watch_count || 0) > 0 ? 'has-watches' : ''}`}
                        onClick={() => handleMarkAsWatched()}
                        disabled={markingWatched}
                        title={currentData!.last_watched
                          ? `Last watched: ${new Date(currentData!.last_watched).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                          : 'Mark as watched today (adds +1 to count)'}
                      >
                        <BsEye className="action-icon" />
                        {markingWatched ? 'Saving...' : (() => {
                          const count = currentData!.watch_count || 0;
                          if (count === 0) return 'Mark as Watched';
                          const dateStr = currentData!.last_watched
                            ? new Date(currentData!.last_watched).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                            : '';
                          if (count === 1) return `Watched ${dateStr}`;
                          return `Watched ${count}× · ${dateStr}`;
                        })()}
                      </button>
                      <button 
                        className="action-btn watched-date-toggle"
                        onClick={toggleDatePicker}
                        disabled={markingWatched}
                        title="More options"
                      >
                        ▼
                      </button>
                      
                      {showDatePicker && (
                        <div 
                          className="watched-date-picker"
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setShowDatePicker(false);
                            }
                          }}
                        >
                          <div className="quick-date-buttons">
                            <button 
                              type="button" 
                              className="quick-date-btn"
                              onClick={() => handleMarkAsWatched()}
                            >
                              Today
                            </button>
                            <button 
                              type="button" 
                              className="quick-date-btn"
                              onClick={() => {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                handleMarkAsWatched(yesterday.toISOString().split('T')[0]);
                              }}
                            >
                              Yesterday
                            </button>
                          </div>
                          <div className="date-picker-divider"></div>
                          <label>Or pick a date:</label>
                          <input
                            type="date"
                            value={watchDate}
                            onChange={(e) => handleDateChange(e.target.value)}
                            onBlur={handleDateBlur}
                            onKeyDown={handleDateKeyDown}
                            max={new Date().toISOString().split('T')[0]}
                          />
                          <div className="date-picker-divider"></div>
                          <label>Watch count:</label>
                          <div className="watch-count-editor">
                            <button 
                              type="button"
                              className="count-btn"
                              onClick={() => handleUpdateWatchCount(Math.max(0, (currentData!.watch_count || 0) - 1))}
                              disabled={(currentData!.watch_count || 0) <= 0}
                            >
                              −
                            </button>
                            <span className="count-value">{currentData!.watch_count || 0}</span>
                            <button 
                              type="button"
                              className="count-btn"
                              onClick={() => handleUpdateWatchCount((currentData!.watch_count || 0) + 1)}
                            >
                              +
                            </button>
                          </div>
                          <button 
                            type="button" 
                            className="clear-watched-btn"
                            onClick={() => handleClearWatched()}
                          >
                            Reset Watch History
                          </button>
                        </div>
                      )}
                    </div>
                    
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
                              src={getProfileUrl(actor.local_profile_path) || undefined}
                              alt={actor.name}
                              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                (e.target as HTMLImageElement).style.display = 'none';
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

                {/* Collection Members Sections (including Box Sets) */}
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
                    order: 0
                  }}
                >
                  {Object.entries(collectionMembers).map(([collectionName, members]: [string, MovieData[]]) => {
                    if (members.length === 0) return null;
                    
                    // If collection not found in current movie's collections, skip it (e.g., after removal)
                    const collection = collections.find(c => c.name === collectionName);
                    if (!collection) {
                      return null;
                    }
                    
                    // Skip box sets with only 1 member (no point showing a collection of one)
                    if (collection.type === 'box_set' && members.length <= 1) {
                      return null;
                    }
                    
                    // Determine collection type for styling and display
                    const isWatchNext = collection.type === 'watch_next';
                    const isBoxSet = collection.type === 'box_set';
                    
                    return (
                      <div key={collectionName} className={`movie-detail-collection ${isWatchNext ? 'watch-next-collection' : ''} ${isBoxSet ? 'box-set-collection' : ''}`}>
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
                          ) : isBoxSet ? (
                            `"${collectionName}" box set`
                          ) : (
                            `"${collectionName}" collection`
                          )}
                        </h3>
                        <SortableContext 
                          items={members.map(member => `${collectionName}-${member.id}`)}
                          strategy={horizontalListSortingStrategy}
                        >
                          <div className="collection-posters-horizontal">
                            {members.map((member: MovieData) => (
                              <SortableCollectionMember
                                key={member.id}
                                movie={member}
                                collectionName={collectionName}
                                onMovieClick={handleMovieTitleClick}
                                getPosterUrl={getPosterUrl}
                                currentMovieId={movieDetails!.id}
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
                    {currentData!.title_status !== 'wish' && (
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
                                  onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.target as HTMLDivElement).style.backgroundColor = '#4a5568'; }}
                                  onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.target as HTMLDivElement).style.backgroundColor = '#2d3748'; }}
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
                {currentData!.title_status !== 'wish' && (
                  <div className="sidebar-section">
                    <h4>Collections</h4>
                    <CollectionTagsInput
                      value={collections.filter(c => c.type === 'user').map(c => c.name)}
                      onChange={handleCollectionsChange}
                      placeholder="Add collections..."
                      movieId={movieDetails!.id}
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
                          rows={3}
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

      {/* "Did you watch?" prompt after removing from Watch Next */}
      {showWatchedPrompt && (
        <div className="watched-prompt-toast">
          <span className="watched-prompt-text">Did you watch this movie?</span>
          <div className="watched-prompt-buttons">
            <button 
              className="watched-prompt-btn"
              onClick={() => {
                handleMarkAsWatched();
                setShowWatchedPrompt(false);
              }}
            >
              Today
            </button>
            <button 
              className="watched-prompt-btn"
              onClick={() => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                handleMarkAsWatched(yesterday.toISOString().split('T')[0]);
                setShowWatchedPrompt(false);
              }}
            >
              Yesterday
            </button>
            <button 
              className="watched-prompt-dismiss"
              onClick={() => setShowWatchedPrompt(false)}
              title="Dismiss"
            >
              ✕
            </button>
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
