import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import FilmDexPage from './components/FilmDexPage';
import AddMovieDialog from './components/AddMovieDialog';
import ImportPage from './pages/ImportPage';
import WishListPage from './pages/WishListPage';
import MusicDexPage from './pages/MusicDexPage';
import BookDexPage from './pages/BookDexPage';
import AnalyticsPage from './pages/AnalyticsPage';
import BackupPage from './pages/BackupPage';
import CogDropdown from './components/CogDropdown';
import CsvExportDialog from './components/CsvExportDialog';
import AlbumCsvExportDialog from './components/AlbumCsvExportDialog';
import ScrollToTop from './components/ScrollToTop';
import apiService from './services/api';
import musicService from './services/musicService';
import bookService from './services/bookService';
import { BsX, BsCollectionFill, BsHeart, BsChevronDown, BsMusicNote, BsArrowLeft, BsBarChart, BsFilm, BsBook } from 'react-icons/bs';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function AppContent() {
  const [refreshTrigger] = useState(0);
  const movieSearchRef = useRef(null);
  const wishListRef = useRef(null);
  const musicDexRef = useRef(null);
  const bookDexRef = useRef(null);
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Helper to get product name from path
  const getProductFromPath = (path) => {
    if (path === '/filmdex') return 'filmdex';
    if (path === '/musicdex') return 'musicdex';
    if (path === '/bookdex' || path === '/wishlist') return 'bookdex';
    return null;
  };

  // Initialize search from localStorage based on current product
  const [searchCriteria, setSearchCriteria] = useState(() => {
    const currentPath = window.location.pathname;
    const product = getProductFromPath(currentPath);
    if (product) {
      const savedText = localStorage.getItem(`dexvault-${product}-search`) || '';
      return { searchText: savedText };
    }
    return { searchText: '' };
  });
  const [loading, setLoading] = useState(false);
  const [hasCheckedBackfill, setHasCheckedBackfill] = useState(false);
  const [showAddMovieDialog, setShowAddMovieDialog] = useState(false);
  const [addMovieMode, setAddMovieMode] = useState('collection');
  const [showCsvExportDialog, setShowCsvExportDialog] = useState(false);
  const [showAlbumCsvExportDialog, setShowAlbumCsvExportDialog] = useState(false);
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
  const [owners, setOwners] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Check if we're on the thumbnail view (filmdex path)
  const isThumbnailView = location.pathname === '/filmdex';
  
  // Check if we should show the search bar (filmdex, musicdex, bookdex, wishlist)
  const showSearchBar = location.pathname === '/filmdex' || location.pathname === '/musicdex' || location.pathname === '/bookdex' || location.pathname === '/wishlist';
  
  // Check if we should show the navigation pills (all main sections)
  const showNavigationPills = location.pathname === '/filmdex' || location.pathname === '/musicdex' || location.pathname === '/bookdex' || location.pathname === '/wishlist' || location.pathname === '/analytics' || location.pathname === '/backup';
  
  // Get the page title based on current route
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/filmdex':
        return 'DexVault';
      case '/musicdex':
        return 'MusicDex';
      case '/bookdex':
        return 'BookDex';
      case '/filmdex/import':
        return 'DexVault - CSV Import';
      case '/wishlist':
        return 'DexVault';
      case '/analytics':
        return 'FilmDex Analytics';
      case '/backup':
        return 'Backup Management';
      default:
        return 'DexVault';
    }
  };


  const getAutocompleteOptions = async (text) => {
    // Different keywords for MusicDex, BookDex vs DexVault
    const keywords = location.pathname === '/musicdex' 
      ? ['title:', 'artist:', 'genre:', 'track:', 'label:', 'country:', 'year:']
      : location.pathname === '/bookdex'
        ? ['title:', 'author:', 'artist:', 'isbn:', 'series:', 'owner:', 'format:', 'language:', 'genre:', 'tag:', 'type:', 'title_status:', 'year:', 'year:>', 'year:<', 'year:>=', 'year:<=', 'rating:', 'rating:>', 'rating:<', 'rating:>=', 'rating:<=']
        : [
            'actor:', 'director:', 'title:', 'collection:', 'box_set:', 'genre:', 'format:', 
            'original_language:', 'media_type:', 'year:', 'year:>', 'year:<', 'year:>=', 'year:<=',
            'imdb_rating:', 'imdb_rating:>', 'imdb_rating:<', 'imdb_rating:>=', 'imdb_rating:<=',
            'tmdb_rating:', 'tmdb_rating:>', 'tmdb_rating:<', 'tmdb_rating:>=', 'tmdb_rating:<=',
            'rotten_tomato_rating:', 'rotten_tomato_rating:>', 'rotten_tomato_rating:<', 'rotten_tomato_rating:>=', 'rotten_tomato_rating:<=',
            'recommended_age:', 'recommended_age:>', 'recommended_age:<', 'recommended_age:>=', 'recommended_age:<=',
            'price:', 'price:>', 'price:<', 'price:>=', 'price:<=',
            'has_comments:true', 'has_comments:false',
            'watched:true', 'watched:false',
            'watched:', 'watched:>', 'watched:<', 'watched:>=', 'watched:<=',
            'last_watched:today', 'last_watched:yesterday', 'last_watched:week', 'last_watched:month', 'last_watched:year',
            'last_watched:>', 'last_watched:<'
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
    // Must respect quotes - don't split at spaces inside quotes
    const beforeCursor = text.substring(0, cursorPos);
    
    // Find last space that's not inside quotes
    let lastSpaceIndex = -1;
    let inQuotes = false;
    for (let i = 0; i < beforeCursor.length; i++) {
      const char = beforeCursor[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ' ' && !inQuotes) {
        lastSpaceIndex = i;
      }
    }
    const currentWord = beforeCursor.substring(lastSpaceIndex + 1);
    
    // Check if we're inside a filter value (after a keyword) - supports negation with - prefix
    const filterMatch = location.pathname === '/musicdex'
      ? currentWord.match(/^(-?)(title|artist|genre|mood|track|label|country|year):(.*)$/)
      : location.pathname === '/bookdex'
        ? currentWord.match(/^(-?)(title|author|artist|isbn|series|owner|format|language|genre|tag|type|title_status|year|rating):(.*)$/)
        : currentWord.match(/^(-?)(actor|director|title|collection|box_set|genre|format|original_language|media_type|imdb_rating|tmdb_rating|rotten_tomato_rating):(.*)$/);
    
    if (filterMatch) {
      const [fullMatch, negationPrefix, filterType, filterValue] = filterMatch;
      
      // Handle comma-separated values (for OR syntax)
      // Extract the part after the last comma as the search term
      const lastCommaIndex = filterValue.lastIndexOf(',');
      const existingValues = lastCommaIndex >= 0 ? filterValue.substring(0, lastCommaIndex + 1) : '';
      const currentSearchTerm = lastCommaIndex >= 0 ? filterValue.substring(lastCommaIndex + 1) : filterValue;
      
      // Don't show suggestions if currently inside quotes (unless after comma)
      // Check if we're inside an unclosed quote
      const quoteCount = currentSearchTerm.split('"').length - 1;
      if (quoteCount % 2 === 1) {
        // Odd number of quotes means we're inside a quoted string
        return [];
      }
      
      // Show suggestions immediately when predicate is typed (even with empty value)
      // or when user starts typing a value
      
      // Fetch value suggestions from backend using the current term (after last comma)
      try {
        const searchTerm = currentSearchTerm.replace(/"/g, ''); // Remove quotes for search
        const response = location.pathname === '/musicdex'
          ? await musicService.getAutocompleteSuggestions(filterType, searchTerm)
          : location.pathname === '/bookdex'
            ? await bookService.getAutocompleteSuggestions(filterType, searchTerm)
            : await apiService.getAutocompleteSuggestions(filterType, searchTerm);
        
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
        
        // For actors, artists, genres, moods, authors, tags, and labels - we get JSON arrays, so parse them to extract individual names
        if (filterType === 'actor' || filterType === 'artist' || filterType === 'genre' || filterType === 'mood' || filterType === 'author' || filterType === 'tag' || filterType === 'label') {
          // Note: 'artist' here could be MusicDex artist or BookDex artist - handled by backend
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
          
          // Filter to only show those that match the current search term (after last comma, not full filterValue)
          const termToMatch = currentSearchTerm.replace(/"/g, '').toLowerCase();
          if (termToMatch) {
            values = values.filter(item => 
              item && typeof item === 'string' && item.toLowerCase().includes(termToMatch)
            );
          }
        }
        
        // Handle numeric filters for books (year, rating), title_status, and type
        if (location.pathname === '/bookdex' && (filterType === 'year' || filterType === 'rating' || filterType === 'title_status' || filterType === 'type')) {
          // For title_status, show predefined values (excluding 'wish' as it has its own tab)
          if (filterType === 'title_status') {
            const statusOptions = ['owned', 'borrowed'];
            const matches = statusOptions.filter(status => 
              status.toLowerCase().includes(filterValue.toLowerCase())
            );
            return matches.map(status => ({
              isValue: true,
              keyword: status,
              filterType,
              replaceText: text.substring(0, lastSpaceIndex + 1) + `${negationPrefix}title_status:${status}`
            }));
          }
          // For type, show predefined book type values
          if (filterType === 'type') {
            const typeOptions = [
              { value: 'book', label: 'Book' },
              { value: 'graphic-novel', label: 'Graphic Novel' },
              { value: 'score', label: 'Score' }
            ];
            const matches = typeOptions.filter(opt => 
              opt.value.toLowerCase().includes(filterValue.toLowerCase()) ||
              opt.label.toLowerCase().includes(filterValue.toLowerCase())
            );
            return matches.map(opt => ({
              isValue: true,
              keyword: opt.label,
              filterType,
              replaceText: text.substring(0, lastSpaceIndex + 1) + `${negationPrefix}type:${opt.value}`
            }));
          }
          // For numeric filters, don't show autocomplete suggestions
          return [];
        }
        
        // Remove duplicates and limit to 20
        values = [...new Set(values)].slice(0, 20);
        
        // Filter out values that are already in existingValues
        const existingValuesList = existingValues.split(',').map(v => v.replace(/"/g, '').trim().toLowerCase()).filter(v => v);
        values = values.filter(v => !existingValuesList.includes(v.toLowerCase()));
        
        return values.map(value => {
          // Strip leading/trailing quotes from value to avoid double-quoting
          const cleanValue = value.replace(/^["']|["']$/g, '');
          // Check if value needs quotes (contains spaces or special chars)
          const needsQuotes = cleanValue.includes(' ') || cleanValue.includes(',') || cleanValue.includes(':');
          const formattedValue = needsQuotes ? `"${cleanValue}"` : cleanValue;
          // Include existing values (comma-separated) before the new value
          const valueToInsert = existingValues ? `${existingValues}${formattedValue}` : formattedValue;
          return {
            isValue: true,
            keyword: value, // Show original value in dropdown
            filterType,
            collectionType: collectionTypes[value], // Include collection type for proper hinting
            replaceText: text.substring(0, lastSpaceIndex + 1) + `${negationPrefix}${filterType}:${valueToInsert}`
          };
        });
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
    
    // Check if typing a negated predicate (starts with -)
    const isNegated = currentWordLower.startsWith('-');
    const searchTerm = isNegated ? currentWordLower.substring(1) : currentWordLower;
    
    // Filter keywords that start with the search term (without the -)
    const matches = keywords.filter(kw => kw.startsWith(searchTerm));
    
    return matches.map(kw => ({
      isValue: false,
      keyword: isNegated ? `-${kw}` : kw,
      replaceText: text.substring(0, lastSpaceIndex + 1) + (isNegated ? `-${kw}` : kw)
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
    
    // Debounce autocomplete suggestions by 300ms (skip for wish list)
    if (location.pathname !== '/wishlist') {
      autocompleteTimeoutRef.current = setTimeout(async () => {
        const options = await getAutocompleteOptions(value);
        setAutocompleteOptions(options);
        setShowAutocomplete(options.length > 0);
        setAutocompleteIndex(-1);
      }, 300);
    }
  };

  const handleSearchKeyDown = (e) => {
    // Skip autocomplete handling on wish list page
    if (location.pathname === '/wishlist') return;
    
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
      if (location.pathname === '/bookdex') {
        // Fetch owners for BookDex
        try {
          const ownersData = await bookService.getAutocompleteSuggestions('owner', '');
          const ownerNames = ownersData
            .map(item => item.owner || item)
            .filter(owner => owner && typeof owner === 'string' && owner.trim())
            .filter((owner, index, self) => self.indexOf(owner) === index) // Remove duplicates
            .sort();
          setOwners(ownerNames);
        } catch (error) {
          console.error('Failed to fetch owners:', error);
          setOwners([]);
        }
      } else {
        // Fetch all collections (both user collections and box sets) for FilmDex
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
      }
    } catch (error) {
      console.error('Failed to fetch filter data:', error);
    }
  };

  // Handle search term injection from movie detail
  const handleSearchFromMovieDetail = (predicate) => {
    // Clear existing search first, then inject new search term
    const newText = predicate;
    
    // Update the state first
    setSearchCriteria({ searchText: newText });
    
    // Then update the input field directly to ensure immediate visual update
    if (searchInputRef.current) {
      searchInputRef.current.value = newText;
      // Trigger the change event to ensure React knows about the change
      const event = new Event('input', { bubbles: true });
      searchInputRef.current.dispatchEvent(event);
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
      case 'type':
        predicate = `type:${filterValue}`;
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
      case 'owner':
        predicate = `owner:"${filterValue}"`;
        break;
      case 'title_status':
        predicate = `title_status:${filterValue}`;
        break;
      case 'has_ebook':
        predicate = 'has_ebook:true';
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
        'media_type': '(Media Type)',
        'author': '(Author)',
        'artist': '(Artist/Illustrator)',
        'isbn': '(ISBN)',
        'series': '(Series)',
        'owner': '(Owner)',
        'language': '(Language)',
        'tag': '(Tag)'
      };
      return hintMap[option.filterType] || '';
    } else {
      const hintMap = location.pathname === '/musicdex' 
        ? {
            'title:': 'Search by CD title',
            'artist:': 'Search by artist name',
            'genre:': 'Search by genre'
          }
        : location.pathname === '/bookdex'
          ? {
              'title:': 'Search by book title',
              'author:': 'Search by author name',
              'artist:': 'Search by artist/illustrator name',
              'isbn:': 'Search by ISBN',
              'series:': 'Search by series name',
              'owner:': 'Search by who it belongs to',
              'format:': 'Search by format',
              'language:': 'Search by language',
              'genre:': 'Search by genre',
              'tag:': 'Search by tag',
              'type:': 'Filter by type (book, graphic-novel, score)',
              'title_status:': 'Filter by status (owned, borrowed, wish)',
              'year:': 'Exact year match',
              'year:>': 'Year greater than',
              'year:<': 'Year less than',
              'year:>=': 'Year greater or equal',
              'year:<=': 'Year less or equal',
              'rating:': 'Exact rating match',
              'rating:>': 'Rating greater than',
              'rating:<': 'Rating less than',
              'rating:>=': 'Rating greater or equal',
              'rating:<=': 'Rating less or equal'
            }
          : {
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
            'has_comments:false': 'Movies without comments',
            'watched:true': 'Movies you have watched',
            'watched:false': 'Movies you haven\'t watched',
            'watched:': 'Exact watch count (e.g. watched:2)',
            'watched:>': 'Watched more than N times (e.g. watched:>1)',
            'watched:<': 'Watched less than N times',
            'watched:>=': 'Watched at least N times (e.g. watched:>=2)',
            'watched:<=': 'Watched at most N times',
            'last_watched:today': 'Watched today',
            'last_watched:yesterday': 'Watched yesterday',
            'last_watched:week': 'Watched in the last 7 days',
            'last_watched:month': 'Watched in the last 30 days',
            'last_watched:year': 'Watched in the last year',
            'last_watched:>': 'Watched after date (e.g. >2024-01-01)',
            'last_watched:<': 'Watched before date (e.g. <2024-06-01)'
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

  const handleDexVaultClick = () => {
    navigate('/filmdex');
  };

  const handleImportMovies = () => {
    navigate('/filmdex/import');
  };

  const handleAddMovie = () => {
    setAddMovieMode('collection');
    setShowAddMovieDialog(true);
  };

  const handleExportCSV = () => {
    setShowCsvExportDialog(true);
  };

  const handleCsvExport = async (columns) => {
    try {
      const blob = await apiService.exportCSV(columns);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'movies.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      handleShowAlert('CSV exported successfully', 'success');
    } catch (error) {
      console.error('CSV export error:', error);
      handleShowAlert('Failed to export CSV: ' + error.message, 'danger');
    }
  };

  const handleAnalytics = () => {
    navigate('/analytics');
  };

  const handleBackup = () => {
    navigate('/backup');
  };


  const handleCollection = () => {
    navigate('/filmdex');
  };

  const handleMusicDex = () => {
    navigate('/musicdex');
  };

  const handleBookDex = () => {
    navigate('/bookdex');
  };

  const handleAddBook = () => {
    // Trigger the Add Book dialog in BookDexPage
    if (bookDexRef.current && bookDexRef.current.openAddDialog) {
      bookDexRef.current.openAddDialog();
    }
  };

  const handleExportBooksCSV = async () => {
    try {
      const blob = await bookService.exportBooksCSV();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'books.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      handleShowAlert('CSV exported successfully', 'success');
    } catch (error) {
      console.error('CSV export error:', error);
      handleShowAlert('Failed to export CSV: ' + error.message, 'danger');
    }
  };

  const handleAddCD = () => {
    // Trigger the Add CD dialog in MusicDexPage
    // We'll pass this via a ref to MusicDexPage
    if (musicDexRef.current && musicDexRef.current.openAddDialog) {
      musicDexRef.current.openAddDialog();
    }
  };

  const handleResizeCovers = () => {
    // Trigger the Resize Covers Migration modal in MusicDexPage
    if (musicDexRef.current && musicDexRef.current.openResizeMigrationModal) {
      musicDexRef.current.openResizeMigrationModal();
    }
  };

  const handleFillCovers = () => {
    // Trigger the Fill Covers modal in MusicDexPage
    if (musicDexRef.current && musicDexRef.current.openFillCoversModal) {
      musicDexRef.current.openFillCoversModal();
    }
  };

  const handleExportAlbumsCSV = () => {
    setShowAlbumCsvExportDialog(true);
  };

  const handleAlbumCsvExport = async (columns) => {
    try {
      const blob = await musicService.exportAlbumsCSV(columns);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'albums.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      handleShowAlert('CSV exported successfully', 'success');
    } catch (error) {
      console.error('CSV export error:', error);
      handleShowAlert('Failed to export CSV: ' + error.message, 'danger');
    }
  };

  const handleWishList = () => {
    navigate('/wishlist');
  };

  const handleAddMovieDialogClose = () => {
    setShowAddMovieDialog(false);
  };

  const handleWishListAddMovie = (mode) => {
    setAddMovieMode(mode);
    setShowAddMovieDialog(true);
  };

  const handleMovieAddedToWishList = (movie) => {
    // Refresh the wish list when a movie is added
    if (wishListRef.current && wishListRef.current.refreshItems) {
      wishListRef.current.refreshItems();
    }
  };

  const handleWishListAddAlbum = (mode) => {
    // Navigate to musicdex and open add dialog
    navigate('/musicdex');
    setTimeout(() => {
      if (musicDexRef.current && musicDexRef.current.openAddDialog) {
        musicDexRef.current.openAddDialog();
      }
    }, 100);
  };

  const handleWishListAddBook = (mode) => {
    // Navigate to bookdex and open add dialog
    navigate('/bookdex');
    setTimeout(() => {
      if (bookDexRef.current && bookDexRef.current.openAddDialog) {
        bookDexRef.current.openAddDialog();
      }
    }, 100);
  };

  const handleBookMovedToCollection = (book) => {
    // Refresh book dex if it's open
    // Note: BookDexPage doesn't have a refreshBooks method yet, but this is ready for future use
  };

  const handleBookAdded = (message) => {
    // Don't show success messages for wish list additions
    // Only show errors if needed
  };

  const handleAlbumMovedToCollection = (album) => {
    // Refresh music dex if it's open
    if (musicDexRef.current && musicDexRef.current.refreshAlbums) {
      musicDexRef.current.refreshAlbums();
    }
  };

  const handleAlbumAdded = (message) => {
    // Don't show success messages for wish list additions
    // Only show errors if needed
  };

  const handleSearchFromAlbumDetail = (criteria) => {
    setSearchCriteria(criteria);
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
    if (wishListRef.current && wishListRef.current.refreshItems) {
      wishListRef.current.refreshItems();
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
    // Don't show success messages when on wish list page
    if (location.pathname !== '/wishlist' || type !== 'success') {
      handleShowAlert(message, type);
    }
    
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

  // Sync search input field with state on mount
  useEffect(() => {
    if (searchInputRef.current && searchCriteria.searchText) {
      searchInputRef.current.value = searchCriteria.searchText;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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

  // Track current product to avoid saving when navigating
  const currentProductRef = useRef(getProductFromPath(location.pathname));
  const isRestoringRef = useRef(false);

  // Save search to localStorage when it changes (per product)
  // Only save if not currently restoring from navigation
  useEffect(() => {
    if (isRestoringRef.current) {
      return; // Don't save during restoration
    }
    const product = currentProductRef.current;
    if (product) {
      localStorage.setItem(`dexvault-${product}-search`, searchCriteria.searchText || '');
    }
  }, [searchCriteria.searchText]);

  // Restore search from localStorage when navigating between pages
  useEffect(() => {
    const previousProduct = currentProductRef.current;
    const newProduct = getProductFromPath(location.pathname);
    
    // Update the current product ref
    currentProductRef.current = newProduct;
    
    // Only restore/update search when product actually changes
    if (previousProduct !== newProduct) {
      isRestoringRef.current = true;
      
      // If there's a URL search param, use that
      if (location.search) {
        const params = new URLSearchParams(location.search);
        const searchParam = params.get('search');
        if (searchParam) {
          setSearchCriteria({ searchText: searchParam });
          if (searchInputRef.current) {
            searchInputRef.current.value = searchParam;
          }
        }
      } else if (newProduct) {
        // Otherwise restore from localStorage for this product
        const savedText = localStorage.getItem(`dexvault-${newProduct}-search`) || '';
        setSearchCriteria({ searchText: savedText });
        // Update the input field
        if (searchInputRef.current) {
          searchInputRef.current.value = savedText;
        }
      } else {
        setSearchCriteria({ searchText: '' });
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
        }
      }
      
      // Reset the restoring flag after a tick
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 0);
    }
  }, [location.pathname, location.search]);

  // Check for backfill on app startup
  useEffect(() => {
    const checkBackfillStatus = async () => {
      if (hasCheckedBackfill) return;
      
      // Check if user has previously ignored the backfill
      const hasIgnoredBackfill = localStorage.getItem('dexvault_backfill_ignored') === 'true';
      if (hasIgnoredBackfill) {
        setHasCheckedBackfill(true);
        return;
      }
      
      try {
        // Backfill check removed - no longer needed
        console.log('Backfill check skipped');
      } catch (error) {
        console.error('Error in backfill check:', error);
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
          {/* First row: Navigation and toolbar */}
          <div className="App-header-top">
            {showNavigationPills ? (
              <div className="segmented-control">
                <button 
                  className={`segment ${location.pathname === '/filmdex' ? 'active' : ''}`}
                  onClick={handleCollection}
                  data-tooltip="FilmDex - My precious movies"
                >
                  <BsFilm className="segment-icon" />
                </button>
                <button 
                  className={`segment ${location.pathname === '/musicdex' ? 'active' : ''}`}
                  onClick={handleMusicDex}
                  data-tooltip="MusicDex - My precious albums"
                >
                  <BsMusicNote className="segment-icon" />
                </button>
                <button 
                  className={`segment ${location.pathname === '/bookdex' ? 'active' : ''}`}
                  onClick={handleBookDex}
                  data-tooltip="BookDex - My precious books"
                >
                  <BsBook className="segment-icon" />
                </button>
                <button 
                  className={`segment ${location.pathname === '/wishlist' ? 'active' : ''}`}
                  onClick={handleWishList}
                  data-tooltip="Wish List - My precious to come"
                >
                  <BsHeart className="segment-icon" />
                </button>
                <button 
                  className={`segment ${location.pathname === '/analytics' ? 'active' : ''}`}
                  onClick={handleAnalytics}
                  data-tooltip="Analytics - The palantír of data"
                >
                  <BsBarChart className="segment-icon" />
                </button>
              </div>
            ) : (
              <div className="App-title">
                <div onClick={handleDexVaultClick}>
                  <h1>{getPageTitle()}</h1>
                </div>
              
              </div>
            )}
            <div className="App-toolbar">
              <CogDropdown 
                onImportMovies={handleImportMovies}
                onAddMovie={handleAddMovie}
                onExportCSV={handleExportCSV}
                onAddCD={handleAddCD}
                onResizeCovers={handleResizeCovers}
                onFillCovers={handleFillCovers}
                onExportAlbumsCSV={handleExportAlbumsCSV}
                onAddBook={handleAddBook}
                onExportBooksCSV={handleExportBooksCSV}
                onBackup={handleBackup}
                currentPage={location.pathname === '/musicdex' ? 'musicdex' : location.pathname === '/bookdex' ? 'bookdex' : 'filmdex'}
              />
            </div>
          </div>
          
          {/* Second row: Search (mobile only) */}
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
                  placeholder={
                    location.pathname === '/musicdex' 
                      ? 'Search MusicDex by title, artist...' 
                      : location.pathname === '/bookdex'
                        ? 'Search BookDex by title, author...'
                        : location.pathname === '/wishlist' 
                          ? 'Search wish list by title, director...' 
                          : 'Search FilmDex by title, director...'
                  }
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
                {location.pathname !== '/musicdex' && location.pathname !== '/wishlist' && (
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
                )}
                {showAutocomplete && autocompleteOptions.length > 0 && location.pathname !== '/wishlist' && (
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
                {showFilterDropdown && location.pathname !== '/wishlist' && (
                  <div className="search-filter-dropdown" ref={filterDropdownRef}>
                    {location.pathname === '/bookdex' ? (
                      <>
                        <div className="filter-section">
                          <div className="filter-section-title">Book Type</div>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('type', 'book');
                            }}
                          >
                            Book
                          </button>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('type', 'graphic-novel');
                            }}
                          >
                            Graphic Novel
                          </button>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('type', 'score');
                            }}
                          >
                            Score
                          </button>
                        </div>
                        
                        <div className="filter-section">
                          <div className="filter-section-title">Formats</div>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('format', 'physical');
                            }}
                          >
                            Physical
                          </button>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('format', 'ebook');
                            }}
                          >
                            E-book
                          </button>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('format', 'audiobook');
                            }}
                          >
                            Audiobook
                          </button>
                        </div>
                        
                        <div className="filter-section">
                          <div className="filter-section-title">Title Status</div>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('title_status', 'owned');
                            }}
                          >
                            Owned
                          </button>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('title_status', 'borrowed');
                            }}
                          >
                            Borrowed
                          </button>
                        </div>
                        
                        <div className="filter-section">
                          <div className="filter-section-title">Special</div>
                          <button 
                            className="filter-option"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFilterSelection('has_ebook', '');
                            }}
                          >
                            Has E-book File
                          </button>
                        </div>
                        
                        {owners.length > 0 && (
                          <div className="filter-section">
                            <div className="filter-section-title">Owners</div>
                            {owners.map(owner => (
                              <button 
                                key={owner}
                                className="filter-option"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleFilterSelection('owner', owner);
                                }}
                              >
                                {owner}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="App-main">
        <Routes>
          <Route 
            path="/" 
            element={<Navigate to="/filmdex" replace />} 
          />
          <Route 
            path="/filmdex" 
            element={
              <FilmDexPage 
                ref={movieSearchRef}
                refreshTrigger={refreshTrigger}
                searchCriteria={searchCriteria}
                loading={loading}
                setLoading={setLoading}
                onShowAlert={handleMovieAdded}
                onAddMovie={handleAddMovie}
                onSearch={handleSearchFromMovieDetail}
              />
            } 
          />
          <Route path="/filmdex/import" element={<ImportPage />} />
          <Route path="/musicdex" element={<MusicDexPage ref={musicDexRef} searchCriteria={searchCriteria} />} />
          <Route path="/bookdex" element={<BookDexPage ref={bookDexRef} searchCriteria={searchCriteria} />} />
          <Route path="/wishlist" element={<WishListPage ref={wishListRef} searchCriteria={searchCriteria} onAddMovie={handleWishListAddMovie} onAddAlbum={handleWishListAddAlbum} onAddBook={handleWishListAddBook} onMovieMovedToCollection={handleMovieMovedToCollection} onAlbumMovedToCollection={handleAlbumMovedToCollection} onBookMovedToCollection={handleBookMovedToCollection} onShowAlert={handleShowAlert} onMovieAdded={handleMovieAdded} onAlbumAdded={handleAlbumAdded} onBookAdded={handleBookAdded} onSearch={handleSearchFromMovieDetail} />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/backup" element={<BackupPage />} />
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

      <CsvExportDialog 
        isOpen={showCsvExportDialog}
        onClose={() => setShowCsvExportDialog(false)}
        onExport={handleCsvExport}
      />

      <AlbumCsvExportDialog 
        isOpen={showAlbumCsvExportDialog}
        onClose={() => setShowAlbumCsvExportDialog(false)}
        onExport={handleAlbumCsvExport}
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
