import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import bookService from '../services/bookService';
import BookForm from './BookForm';
import BookThumbnail from './BookThumbnail';
import BookDetailCard from './BookDetailCard';
import AddBookDialog from './AddBookDialog';
import SeriesStack from './SeriesStack';
import AlphabeticalIndex from './AlphabeticalIndex';
import { CollectionHeader, EmptyState } from './shared';
import { Modal, Button, Form } from 'react-bootstrap';
import { BsChevronDown, BsBook } from 'react-icons/bs';
import './BookSearch.css';

const BookSearch = forwardRef(({ 
  books, 
  loading, 
  onAddBook, 
  onUpdateBook, 
  onDeleteBook, 
  onShowAlert,
  onOpenAddDialog,
  refreshTrigger,
  searchCriteria,
  defaultTitleStatus
}, ref) => {
  const [allBooks, setAllBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [sortBy, setSortBy] = useState('series');
  const [sortLoading, setSortLoading] = useState(false);
  const [groupBy, setGroupBy] = useState('none');
  const [groupLoading, setGroupLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [expandAllGroups, setExpandAllGroups] = useState(false);
  const [bookCount, setBookCount] = useState({ filtered: 0, total: 0 });
  const [expandedSeries, setExpandedSeries] = useState(() => {
    // Restore expanded series from sessionStorage on mount
    const saved = sessionStorage.getItem('bookSearchExpandedSeries');
    return saved || null;
  });
  const expandedSeriesRef = useRef(null);
  const [stackEnabled, setStackEnabled] = useState(true);
  
  // Initialize and keep ref in sync with state
  useEffect(() => {
    if (expandedSeriesRef.current === null) {
      // Initialize ref on first render
      expandedSeriesRef.current = expandedSeries;
    } else {
      // Keep ref in sync with state
      expandedSeriesRef.current = expandedSeries;
    }
  }, [expandedSeries]);
  
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingBook, setAddingBook] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [selectedBookDetails, setSelectedBookDetails] = useState(null);
  const [bookDetailsBeforeEdit, setBookDetailsBeforeEdit] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState({ show: false, bookId: null });
  const [templateBook, setTemplateBook] = useState(null);
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [createSeriesData, setCreateSeriesData] = useState({ draggedBook: null, targetBook: null, suggestedName: '' });
  const [seriesNameInput, setSeriesNameInput] = useState('');
  const [showMergeSeriesModal, setShowMergeSeriesModal] = useState(false);
  const [mergeSeriesData, setMergeSeriesData] = useState({ 
    sourceSeries: '', sourceBooks: [], 
    targetSeries: '', targetBooks: [],
    selectedName: ''
  });
  const previousSearchTextRef = useRef('');
  const navigate = useNavigate();
  const location = useLocation();
  
  // Ref and state for scroll container (for alphabetical index)
  const scrollContainerRef = useRef(null);
  const [scrollContainer, setScrollContainer] = useState(null);
  
  // Set scroll container once component mounts
  useEffect(() => {
    const mainContent = scrollContainerRef.current?.closest('.app-main-content');
    if (mainContent) {
      setScrollContainer(mainContent);
    } else {
      setScrollContainer(document.documentElement);
    }
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    refresh: loadBooks,
    search: performSearch,
    openAddDialog: () => setShowAddDialog(true),
    openBookDetails: (book) => setSelectedBookDetails(book),
    setSearchQuery: (query) => {
      navigate(`${location.pathname}?search=${encodeURIComponent(query)}`);
    }
  }));

  const updateSearchViaUrl = (query) => {
    navigate(`${location.pathname}?search=${encodeURIComponent(query)}`);
  };

  useEffect(() => {
    loadBooks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  useEffect(() => {
    const currentSearchText = searchCriteria?.searchText || '';
    
    if (currentSearchText !== previousSearchTextRef.current) {
      previousSearchTextRef.current = currentSearchText;
      
      if (currentSearchText.trim()) {
        performSearch(currentSearchText);
      } else {
        const sortedAll = sortBooks(allBooks, sortBy);
        setFilteredBooks(sortedAll);
        setBookCount({ filtered: sortedAll.length, total: allBooks.length });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCriteria?.searchText, allBooks]);

  const loadBooks = async () => {
    try {
      // getAllBooks() now returns both 'owned' and 'borrowed' books (excludes 'wish')
      const data = await bookService.getAllBooks();
      const sortedInitial = sortBooks(data, sortBy);
      setAllBooks(data); // Keep all books for total count
      
      const currentSearchText = searchCriteria?.searchText || '';
      if (currentSearchText.trim()) {
        const localResults = await bookService.searchBooks(currentSearchText);
        const sortedResults = sortBooks(localResults, sortBy);
        setFilteredBooks(sortedResults);
        setBookCount({ filtered: sortedResults.length, total: data.length });
      } else {
        setFilteredBooks(sortedInitial);
        setBookCount({ filtered: sortedInitial.length, total: data.length });
      }
    } catch (error) {
      console.error('Error loading books:', error);
      if (onShowAlert) {
        onShowAlert('Failed to load books: ' + error.message, 'danger');
      }
    }
  };

  const performSearch = async (query) => {
    if (!query.trim()) {
      const sortedAll = sortBooks(allBooks, sortBy);
      setFilteredBooks(sortedAll);
      setBookCount({ filtered: sortedAll.length, total: allBooks.length });
      return;
    }

    try {
      const localResults = await bookService.searchBooks(query);
      const sortedResults = sortBooks(localResults, sortBy);
      setFilteredBooks(sortedResults);
      setBookCount({ filtered: sortedResults.length, total: allBooks.length });
    } catch (error) {
      console.error('Error searching:', error);
      if (onShowAlert) {
        onShowAlert('Search failed: ' + error.message, 'danger');
      }
    }
  };

  // Helper function to remove articles (determinants) for sorting
  const removeArticlesForSorting = useCallback((text) => {
    if (!text) return '';
    const trimmed = text.trim();
    // French articles: Le, La, Les, Un, Une, Des, Du, De
    // English articles: The, A, An
    const articlePattern = /^(le|la|les|un|une|des|du|de|the|a|an)\s+/i;
    return trimmed.replace(articlePattern, '').trim() || trimmed;
  }, []);

  const sortBooks = useCallback((booksToSort, sortOption) => {
    const sorted = [...booksToSort];
    
    switch (sortOption) {
      case 'authorSeries':
        // Sort by author A-Z, then by series name, then by series number
        // Books without series are sorted by author
        return sorted.sort((a, b) => {
          // First, compare authors
          const authorA = Array.isArray(a.authors) ? a.authors.join(', ') : (a.authors || '');
          const authorB = Array.isArray(b.authors) ? b.authors.join(', ') : (b.authors || '');
          const authorCompare = authorA.localeCompare(authorB);
          if (authorCompare !== 0) return authorCompare;
          
          // Same author: compare series
          const seriesA = a.series || '';
          const seriesB = b.series || '';
          
          // If both have series and same series name, sort by series number
          if (seriesA && seriesB && seriesA === seriesB) {
            // Convert to number for proper numeric sorting
            const numA = a.seriesNumber != null ? Number(a.seriesNumber) : 999999;
            const numB = b.seriesNumber != null ? Number(b.seriesNumber) : 999999;
            // Handle NaN cases
            if (isNaN(numA) && isNaN(numB)) return a.title.localeCompare(b.title);
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            return numA - numB;
          }
          
          // If one has series and other doesn't, series comes first
          if (seriesA && !seriesB) return -1;
          if (!seriesA && seriesB) return 1;
          
          // Both have series but different: sort by series name (without articles)
          if (seriesA && seriesB) {
            const seriesAForSort = removeArticlesForSorting(seriesA);
            const seriesBForSort = removeArticlesForSorting(seriesB);
            return seriesAForSort.localeCompare(seriesBForSort);
          }
          
          // Neither has series: sort by title
          return a.title.localeCompare(b.title);
        });
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'titleReverse':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case 'author':
        return sorted.sort((a, b) => {
          const authorA = Array.isArray(a.authors) ? a.authors.join(', ') : (a.authors || '');
          const authorB = Array.isArray(b.authors) ? b.authors.join(', ') : (b.authors || '');
          return authorA.localeCompare(authorB);
        });
      case 'authorReverse':
        return sorted.sort((a, b) => {
          const authorA = Array.isArray(a.authors) ? a.authors.join(', ') : (a.authors || '');
          const authorB = Array.isArray(b.authors) ? b.authors.join(', ') : (b.authors || '');
          return authorB.localeCompare(authorA);
        });
      case 'year':
        return sorted.sort((a, b) => (b.publishedYear || 0) - (a.publishedYear || 0));
      case 'yearReverse':
        return sorted.sort((a, b) => (a.publishedYear || 0) - (b.publishedYear || 0));
      case 'lastAdded':
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'lastAddedReverse':
        return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      case 'series':
        // Sort by series name, treating books without series as their own series
        // Within each series, sort by series number, then by title
        return sorted.sort((a, b) => {
          // Use series name if available, otherwise use title as the "series" identifier
          const seriesA = a.series || a.title;
          const seriesB = b.series || b.title;
          
          // Remove articles for sorting comparison
          const seriesAForSort = removeArticlesForSorting(seriesA);
          const seriesBForSort = removeArticlesForSorting(seriesB);
          
          // Compare series names (or titles for non-series books) without articles
          const seriesCompare = seriesAForSort.localeCompare(seriesBForSort);
          if (seriesCompare !== 0) return seriesCompare;
          
          // Same series: if both have series numbers, sort by that
          if (a.series && b.series) {
            // Convert to number for proper numeric sorting
            const numA = a.seriesNumber != null ? Number(a.seriesNumber) : 999999;
            const numB = b.seriesNumber != null ? Number(b.seriesNumber) : 999999;
            // Handle NaN cases
            if (isNaN(numA) && isNaN(numB)) return a.title.localeCompare(b.title);
            if (isNaN(numA)) return 1;
            if (isNaN(numB)) return -1;
            if (numA !== numB) return numA - numB;
          }
          
          // Same series and same number (or no series), sort by title
          return a.title.localeCompare(b.title);
        });
      default:
        return sorted;
    }
  }, [removeArticlesForSorting]);

  const handleSortChange = async (sortOption) => {
    setSortBy(sortOption);
    setSortLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    try {
      const sortedBooks = sortBooks(filteredBooks, sortOption);
      setFilteredBooks(sortedBooks);
      setBookCount({ filtered: sortedBooks.length, total: allBooks.length });
    } finally {
      setSortLoading(false);
    }
  };

  const groupBooks = useCallback((booksToGroup, groupOption) => {
    if (groupOption === 'none') {
      return { 'All Books': booksToGroup };
    }

    const groups = {};
    
    booksToGroup.forEach(book => {
      let groupKeys = [];
      
      switch (groupOption) {
        case 'author':
          const authors = Array.isArray(book.authors) ? book.authors : (book.authors ? [book.authors] : []);
          groupKeys = authors.length > 0 ? authors : ['Unknown Author'];
          break;
        case 'genre':
          if (book.genres && book.genres.length > 0) {
            groupKeys = book.genres;
          } else {
            groupKeys = ['Unknown Genre'];
          }
          break;
        case 'series':
          groupKeys = [book.series || 'No Series'];
          break;
        case 'format':
          groupKeys = [book.format || 'Unknown Format'];
          break;
        case 'decade':
          if (book.publishedYear && !isNaN(book.publishedYear)) {
            const decade = Math.floor(book.publishedYear / 10) * 10;
            groupKeys = [`${decade}s`];
          } else {
            groupKeys = ['Unknown Decade'];
          }
          break;
        case 'language':
          groupKeys = [book.language || 'Unknown Language'];
          break;
        default:
          groupKeys = ['All Books'];
      }
      
      groupKeys.forEach(groupKey => {
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(book);
      });
    });

    const sortedGroups = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  }, []);

  const handleGroupChange = async (groupOption) => {
    setGroupBy(groupOption);
    setGroupLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (groupOption !== 'none') {
      const grouped = groupBooks(filteredBooks, groupOption);
      const allGroupKeys = Object.keys(grouped);
      setExpandedGroups(new Set(allGroupKeys));
      setExpandAllGroups(true);
    } else {
      setExpandedGroups(new Set());
      setExpandAllGroups(false);
    }
    
    setGroupLoading(false);
  };

  const toggleGroup = (groupKey) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupKey)) {
      newExpandedGroups.delete(groupKey);
    } else {
      newExpandedGroups.add(groupKey);
    }
    setExpandedGroups(newExpandedGroups);
  };

  const toggleAllGroups = () => {
    if (groupBy === 'none') return;
    
    const grouped = groupBooks(filteredBooks, groupBy);
    const allGroupKeys = Object.keys(grouped);
    
    if (expandAllGroups) {
      setExpandedGroups(new Set());
      setExpandAllGroups(false);
    } else {
      setExpandedGroups(new Set(allGroupKeys));
      setExpandAllGroups(true);
    }
  };

  const handleEditBook = async (book) => {
    try {
      const details = await bookService.getBookById(book.id);
      setBookDetailsBeforeEdit(selectedBookDetails);
      setEditingBook(details);
      setSelectedBookDetails(null);
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load book details for editing: ' + err.message, 'danger');
      }
      setBookDetailsBeforeEdit(selectedBookDetails);
      setEditingBook(book);
      setSelectedBookDetails(null);
    }
  };

  const handleFormCancel = () => {
    setEditingBook(null);
    if (bookDetailsBeforeEdit) {
      setSelectedBookDetails(bookDetailsBeforeEdit);
      setBookDetailsBeforeEdit(null);
    }
  };

  const handleFormSave = async (createdBook = null) => {
    setEditingBook(null);
    
    if (createdBook) {
      await loadBooks();
      try {
        const completeBookDetails = await bookService.getBookById(createdBook.id);
        setSelectedBookDetails(completeBookDetails);
      } catch (err) {
        console.error('Failed to load complete book details after creation:', err);
        setSelectedBookDetails(createdBook);
      }
    } else {
      await loadBooks();
      if (bookDetailsBeforeEdit) {
        try {
          const updatedDetails = await bookService.getBookById(bookDetailsBeforeEdit.id);
          setSelectedBookDetails(updatedDetails);
          setBookDetailsBeforeEdit(null);
        } catch (err) {
          console.error('Failed to reload book details after save:', err);
          setSelectedBookDetails(bookDetailsBeforeEdit);
          setBookDetailsBeforeEdit(null);
        }
      }
    }
  };

  // Extract series number from book title using common patterns
  const extractSeriesNumberFromTitle = (title) => {
    if (!title) return null;
    
    // Common volume/series number patterns
    const volumePatterns = [
      /\bT0*(\d+)\b/i,           // T01, T1, T02, etc.
      /\bVol\.?\s*0*(\d+)\b/i,   // Vol. 1, Vol 1, etc.
      /\bVolume\s*0*(\d+)\b/i,   // Volume 1, etc.
      /\b#0*(\d+)\b/i,           // #1, #01, etc.
      /\bBook\s*0*(\d+)\b/i,     // Book 1, Book 01, etc.
      /\bPart\s*0*(\d+)\b/i,     // Part 1, Part 01, etc.
      /\bTome\s*0*(\d+)\b/i,     // Tome 1, Tome 01, etc.
      /\b(\d+)\s*$/i             // Trailing number like "Series Name 1"
    ];
    
    for (const pattern of volumePatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const number = parseInt(match[1], 10);
        if (!isNaN(number) && number > 0) {
          return number;
        }
      }
    }
    
    return null;
  };

  // Handle book dropped onto a series stack
  const handleBookDroppedOnSeries = async (bookId, bookData, seriesName, seriesBooks) => {
    try {
      // Try to infer series number from the book's title
      let seriesNumber = extractSeriesNumberFromTitle(bookData.title);
      
      // If no series number could be inferred from title, use next number in series
      if (seriesNumber === null) {
        // Find the highest series number in the current series
        const maxSeriesNumber = seriesBooks.reduce((max, book) => {
          const num = book.seriesNumber != null ? Number(book.seriesNumber) : 0;
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        seriesNumber = maxSeriesNumber + 1;
      }
      
      // Update the book with the new series and series number
      const updatedBook = await onUpdateBook(bookId, {
        ...bookData,
        series: seriesName,
        seriesNumber: seriesNumber
      });
      
      // Save expanded series state
      const currentExpanded = expandedSeries;
      
      // Reload books
      await loadBooks();
      
      // Restore expanded series state
      if (currentExpanded) {
        setExpandedSeries(currentExpanded);
        sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
      }
      
      if (onShowAlert) {
        onShowAlert(`Added "${bookData.title}" to ${seriesName} as #${seriesNumber}`, 'success');
      }
      
      return updatedBook;
    } catch (error) {
      console.error('Error adding book to series:', error);
      if (onShowAlert) {
        onShowAlert(`Failed to add book to series: ${error.message}`, 'danger');
      }
    }
  };

  // Infer a series name from two books
  const inferSeriesName = (book1, book2) => {
    const title1 = book1.title || '';
    const title2 = book2.title || '';
    
    // Remove common volume/number patterns from titles for comparison
    const cleanTitle = (title) => {
      return title
        .replace(/\s*[-–—:]\s*(T|Vol\.?|Volume|Book|Part|Tome|#)\s*\d+\s*$/i, '')
        .replace(/\s*(T|Vol\.?|Volume|Book|Part|Tome|#)\s*\d+\s*$/i, '')
        .replace(/\s*\d+\s*$/, '')
        .trim();
    };
    
    const clean1 = cleanTitle(title1);
    const clean2 = cleanTitle(title2);
    
    // If cleaned titles are the same, use that as series name
    if (clean1 && clean1.toLowerCase() === clean2.toLowerCase()) {
      return clean1;
    }
    
    // Try to find common prefix
    const words1 = clean1.split(/\s+/);
    const words2 = clean2.split(/\s+/);
    const commonWords = [];
    
    for (let i = 0; i < Math.min(words1.length, words2.length); i++) {
      if (words1[i].toLowerCase() === words2[i].toLowerCase()) {
        commonWords.push(words1[i]);
      } else {
        break;
      }
    }
    
    if (commonWords.length >= 2) {
      return commonWords.join(' ');
    }
    
    // If same author, suggest author name + "Series"
    const author1 = Array.isArray(book1.authors) ? book1.authors[0] : book1.authors;
    const author2 = Array.isArray(book2.authors) ? book2.authors[0] : book2.authors;
    
    if (author1 && author2 && author1.toLowerCase() === author2.toLowerCase()) {
      return `${author1} Series`;
    }
    
    // Fallback to the first cleaned title
    return clean1 || clean2 || 'New Series';
  };

  // Handle book dropped on another book to create a new series
  const handleBookDroppedForNewSeries = (draggedBookId, draggedBookData, targetBook) => {
    // Infer a suggested series name
    const suggestedName = inferSeriesName(draggedBookData, targetBook);
    
    // Set up the modal data
    setCreateSeriesData({
      draggedBook: draggedBookData,
      targetBook: targetBook,
      suggestedName: suggestedName
    });
    setSeriesNameInput(suggestedName);
    setShowCreateSeriesModal(true);
  };

  // Confirm series creation
  const handleConfirmCreateSeries = async () => {
    const { draggedBook, targetBook } = createSeriesData;
    const seriesName = seriesNameInput.trim();
    
    if (!seriesName) {
      if (onShowAlert) {
        onShowAlert('Please enter a series name', 'warning');
      }
      return;
    }
    
    try {
      // Extract series numbers from titles
      const draggedNumber = extractSeriesNumberFromTitle(draggedBook.title);
      const targetNumber = extractSeriesNumberFromTitle(targetBook.title);
      
      // Determine series numbers
      let draggedSeriesNumber, targetSeriesNumber;
      
      if (draggedNumber !== null && targetNumber !== null) {
        // Both have numbers, use them
        draggedSeriesNumber = draggedNumber;
        targetSeriesNumber = targetNumber;
      } else if (draggedNumber !== null) {
        // Only dragged book has number
        draggedSeriesNumber = draggedNumber;
        targetSeriesNumber = draggedNumber === 1 ? 2 : 1;
      } else if (targetNumber !== null) {
        // Only target book has number
        targetSeriesNumber = targetNumber;
        draggedSeriesNumber = targetNumber === 1 ? 2 : 1;
      } else {
        // Neither has a number, assign 1 and 2
        targetSeriesNumber = 1;
        draggedSeriesNumber = 2;
      }
      
      // Update both books
      await onUpdateBook(targetBook.id, {
        ...targetBook,
        series: seriesName,
        seriesNumber: targetSeriesNumber
      });
      
      await onUpdateBook(draggedBook.id, {
        ...draggedBook,
        series: seriesName,
        seriesNumber: draggedSeriesNumber
      });
      
      // Close modal and reload
      setShowCreateSeriesModal(false);
      setCreateSeriesData({ draggedBook: null, targetBook: null, suggestedName: '' });
      setSeriesNameInput('');
      
      await loadBooks();
      
      if (onShowAlert) {
        onShowAlert(`Created series "${seriesName}" with 2 books`, 'success');
      }
    } catch (error) {
      console.error('Error creating series:', error);
      if (onShowAlert) {
        onShowAlert(`Failed to create series: ${error.message}`, 'danger');
      }
    }
  };

  // Cancel series creation
  const handleCancelCreateSeries = () => {
    setShowCreateSeriesModal(false);
    setCreateSeriesData({ draggedBook: null, targetBook: null, suggestedName: '' });
    setSeriesNameInput('');
  };

  // Handle series dropped on another series - prompt for merge
  const handleSeriesMerge = (sourceSeriesName, sourceBooks, targetSeriesName, targetBooks) => {
    setMergeSeriesData({
      sourceSeries: sourceSeriesName,
      sourceBooks: sourceBooks,
      targetSeries: targetSeriesName,
      targetBooks: targetBooks,
      selectedName: targetSeriesName // Default to the target series name
    });
    setShowMergeSeriesModal(true);
  };

  // Confirm series merge
  const handleConfirmMergeSeries = async () => {
    const { sourceSeries, sourceBooks, targetSeries, targetBooks, selectedName } = mergeSeriesData;
    
    try {
      // Determine which books need to be updated
      const booksToUpdate = selectedName === sourceSeries ? targetBooks : sourceBooks;
      
      // Get the highest series number from the series we're keeping
      const keptBooks = selectedName === sourceSeries ? sourceBooks : targetBooks;
      const maxSeriesNumber = keptBooks.reduce((max, book) => {
        const num = book.seriesNumber != null ? Number(book.seriesNumber) : 0;
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      
      // Update each book to use the selected series name
      // Assign new series numbers to avoid conflicts
      for (let i = 0; i < booksToUpdate.length; i++) {
        const book = booksToUpdate[i];
        // Try to keep original series number if it doesn't conflict
        let newSeriesNumber = book.seriesNumber;
        
        // Check if this number conflicts with kept books
        const conflicts = keptBooks.some(b => b.seriesNumber === newSeriesNumber);
        if (conflicts || newSeriesNumber == null) {
          // Assign next available number
          newSeriesNumber = maxSeriesNumber + i + 1;
        }
        
        await onUpdateBook(book.id, {
          ...book,
          series: selectedName,
          seriesNumber: newSeriesNumber
        });
      }
      
      // Close modal and reload
      setShowMergeSeriesModal(false);
      setMergeSeriesData({ 
        sourceSeries: '', sourceBooks: [], 
        targetSeries: '', targetBooks: [],
        selectedName: ''
      });
      
      await loadBooks();
      
      if (onShowAlert) {
        const totalBooks = sourceBooks.length + targetBooks.length;
        onShowAlert(`Merged series into "${selectedName}" (${totalBooks} books)`, 'success');
      }
    } catch (error) {
      console.error('Error merging series:', error);
      if (onShowAlert) {
        onShowAlert(`Failed to merge series: ${error.message}`, 'danger');
      }
    }
  };

  // Cancel series merge
  const handleCancelMergeSeries = () => {
    setShowMergeSeriesModal(false);
    setMergeSeriesData({ 
      sourceSeries: '', sourceBooks: [], 
      targetSeries: '', targetBooks: [],
      selectedName: ''
    });
  };

  // Rename a series
  const handleSeriesRename = async (oldName, newName, seriesBooks) => {
    try {
      // Update all books in the series with the new name
      for (const book of seriesBooks) {
        await onUpdateBook(book.id, {
          ...book,
          series: newName
        });
      }
      
      // Save expanded state
      const currentExpanded = expandedSeries;
      
      await loadBooks();
      
      // Update expanded series to new name
      if (currentExpanded === oldName) {
        setExpandedSeries(newName);
        sessionStorage.setItem('bookSearchExpandedSeries', newName);
      }
      
      if (onShowAlert) {
        onShowAlert(`Renamed series to "${newName}"`, 'success');
      }
    } catch (error) {
      console.error('Error renaming series:', error);
      if (onShowAlert) {
        onShowAlert(`Failed to rename series: ${error.message}`, 'danger');
      }
    }
  };

  // Remove a book from its series
  const handleRemoveFromSeries = async (book) => {
    try {
      await onUpdateBook(book.id, {
        ...book,
        series: null,
        seriesNumber: null
      });
      
      // Save expanded state
      const currentExpanded = expandedSeries;
      
      await loadBooks();
      
      // Restore expanded state if there are still books in the series
      if (currentExpanded) {
        setExpandedSeries(currentExpanded);
        sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
      }
      
      if (onShowAlert) {
        onShowAlert(`Removed "${book.title}" from series`, 'success');
      }
    } catch (error) {
      console.error('Error removing book from series:', error);
      if (onShowAlert) {
        onShowAlert(`Failed to remove book from series: ${error.message}`, 'danger');
      }
    }
  };

  // Add books to series - opens the add dialog with template
  const handleAddBooksToSeries = (seriesName, existingBooks) => {
    // Find the book with the highest series number to use as template
    const templateBook = existingBooks.reduce((best, book) => {
      const num = book.seriesNumber != null ? Number(book.seriesNumber) : 0;
      const bestNum = best?.seriesNumber != null ? Number(best.seriesNumber) : 0;
      return num > bestNum ? book : best;
    }, existingBooks[0]);
    
    setTemplateBook(templateBook);
    setShowAddDialog(true);
  };

  const handleBookClick = async (bookId) => {
    try {
      // Save scroll position before opening modal to ensure it's preserved
      const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      const details = await bookService.getBookById(bookId);
      setSelectedBookDetails(details);
      // Store scroll position in sessionStorage as backup
      sessionStorage.setItem('bookDetailScrollPosition', scrollPosition.toString());
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load book details: ' + err.message, 'danger');
      }
    }
  };

  const groupBooksBySeries = useCallback((booksToGroup) => {
    const seriesMap = new Map();
    const standaloneBooks = [];

    booksToGroup.forEach(book => {
      if (book.series && book.series.trim()) {
        const seriesName = book.series.trim();
        if (!seriesMap.has(seriesName)) {
          seriesMap.set(seriesName, []);
        }
        seriesMap.get(seriesName).push(book);
      } else {
        standaloneBooks.push(book);
      }
    });

    return { seriesMap, standaloneBooks };
  }, []);

  const renderBookGrid = () => {
    if (loading) {
      return (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '200px' }}>
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      );
    }

    if (filteredBooks.length === 0) {
      return searchCriteria?.searchText && searchCriteria.searchText.trim() ? (
        <EmptyState
          icon="📚"
          title="No Results Found"
          description={`No books match "${searchCriteria.searchText}"`}
          hint="Try different keywords or clear your search"
          collectionInfo={`You have <strong>${allBooks.length}</strong> ${allBooks.length === 1 ? 'book' : 'books'} in your collection`}
        />
      ) : (
        <EmptyState
          icon="📖"
          title="Welcome to BookDex!"
          description="Your book collection is empty. Add your first book to get started and begin tracking your library."
          action={
            <button 
              className="btn btn-primary btn-lg mt-4"
              onClick={onOpenAddDialog}
            >
              <BsBook className="me-2" />
              Add Your First Book
            </button>
          }
        />
      );
    }

    if (groupBy === 'none') {
      const { seriesMap, standaloneBooks } = groupBooksBySeries(filteredBooks);
      
      // Check if there's an active filter
      const hasActiveFilter = searchCriteria?.searchText?.trim() || (defaultTitleStatus && defaultTitleStatus !== 'all');
      const shouldUseStack = stackEnabled && !hasActiveFilter;

      // Create a combined list of items for unified sorting
      const combinedItems = [];
      
      // Add series stacks (represented by their first book for sorting)
      seriesMap.forEach((books, seriesName) => {
        // Sort books within series by series number
        const sortedSeriesBooks = [...books].sort((a, b) => {
          const numA = a.seriesNumber != null ? Number(a.seriesNumber) : 999999;
          const numB = b.seriesNumber != null ? Number(b.seriesNumber) : 999999;
          if (isNaN(numA) && isNaN(numB)) return a.title.localeCompare(b.title);
          if (isNaN(numA)) return 1;
          if (isNaN(numB)) return -1;
          return numA - numB;
        });
        
        combinedItems.push({
          type: 'series',
          seriesName,
          books,
          sortedBooks: sortedSeriesBooks,
          representativeBook: sortedSeriesBooks[0], // Use first book for sorting
        });
      });
      
      // Add standalone books
      standaloneBooks.forEach(book => {
        combinedItems.push({
          type: 'book',
          book,
        });
      });
      
      // Sort the combined list according to current sortBy option
      combinedItems.sort((a, b) => {
        const bookA = a.type === 'series' ? a.representativeBook : a.book;
        const bookB = b.type === 'series' ? b.representativeBook : b.book;
        
        switch (sortBy) {
          case 'title':
            // For series, use series name; for books, use title
            const titleA = a.type === 'series' ? a.seriesName : bookA.title;
            const titleB = b.type === 'series' ? b.seriesName : bookB.title;
            return titleA.localeCompare(titleB);
          case 'titleReverse':
            const titleRevA = a.type === 'series' ? a.seriesName : bookA.title;
            const titleRevB = b.type === 'series' ? b.seriesName : bookB.title;
            return titleRevB.localeCompare(titleRevA);
          case 'author':
            const authorA = Array.isArray(bookA.authors) ? bookA.authors.join(', ') : (bookA.authors || '');
            const authorB = Array.isArray(bookB.authors) ? bookB.authors.join(', ') : (bookB.authors || '');
            return authorA.localeCompare(authorB);
          case 'authorReverse':
            const authorRevA = Array.isArray(bookA.authors) ? bookA.authors.join(', ') : (bookA.authors || '');
            const authorRevB = Array.isArray(bookB.authors) ? bookB.authors.join(', ') : (bookB.authors || '');
            return authorRevB.localeCompare(authorRevA);
          case 'year':
            return (bookB.publishedYear || 0) - (bookA.publishedYear || 0);
          case 'yearReverse':
            return (bookA.publishedYear || 0) - (bookB.publishedYear || 0);
          case 'lastAdded':
            return new Date(bookB.createdAt) - new Date(bookA.createdAt);
          case 'lastAddedReverse':
            return new Date(bookA.createdAt) - new Date(bookB.createdAt);
          case 'series':
          case 'authorSeries':
          default:
            // Default: sort by series name (removing articles)
            const seriesA = a.type === 'series' ? a.seriesName : bookA.title;
            const seriesB = b.type === 'series' ? b.seriesName : bookB.title;
            const seriesAForSort = removeArticlesForSorting(seriesA);
            const seriesBForSort = removeArticlesForSorting(seriesB);
            return seriesAForSort.localeCompare(seriesBForSort);
        }
      });

      // Render the sorted combined items with letter on all items for index visibility detection
      const items = [];
      
      combinedItems.forEach(item => {
        // Determine the field for letter tracking based on sort type
        let sortField;
        if (sortBy === 'author' || sortBy === 'authorReverse') {
          sortField = item.type === 'series' ? item.books[0]?.author : item.book?.author;
        } else {
          sortField = item.type === 'series' ? item.seriesName : (item.book?.series || item.book?.title);
        }
        const firstChar = sortField?.charAt(0)?.toUpperCase() || '';
        const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
        
        if (item.type === 'series') {
          if (item.books.length > 1 && shouldUseStack) {
            const isExpanded = expandedSeries === item.seriesName;
            
            items.push(
              <SeriesStack
                key={`series-${item.seriesName}`}
                seriesName={item.seriesName}
                books={item.books}
                isExpanded={isExpanded}
                sortedBooks={item.sortedBooks}
                onToggleExpanded={() => {
                  const newExpanded = isExpanded ? null : item.seriesName;
                  setExpandedSeries(newExpanded);
                  if (newExpanded) {
                    sessionStorage.setItem('bookSearchExpandedSeries', newExpanded);
                  } else {
                    sessionStorage.removeItem('bookSearchExpandedSeries');
                  }
                }}
                onBookClick={(book) => handleBookClick(book.id)}
                onEdit={(book) => handleEditBook(book)}
                onDelete={(book) => setShowDeleteModal({ show: true, bookId: book.id })}
                onBookDropped={handleBookDroppedOnSeries}
                onSeriesMerge={handleSeriesMerge}
                onSeriesRename={handleSeriesRename}
                onRemoveFromSeries={handleRemoveFromSeries}
                onAddBooksToSeries={handleAddBooksToSeries}
                onClose={() => {
                  setExpandedSeries(null);
                  sessionStorage.removeItem('bookSearchExpandedSeries');
                }}
                dataFirstLetter={letter}
              />
            );
          } else {
            // Single book in series or stack disabled, show as regular thumbnails
            item.books.forEach((book) => {
              // Each book gets its own letter based on its title/series
              const bookSortField = (sortBy === 'author' || sortBy === 'authorReverse')
                ? book.author
                : (book.series || book.title);
              const bookFirstChar = bookSortField?.charAt(0)?.toUpperCase() || '';
              const bookLetter = /[A-Z]/.test(bookFirstChar) ? bookFirstChar : '#';
              
              items.push(
                <BookThumbnail
                  key={book.id}
                  book={book}
                  onClick={() => handleBookClick(book.id)}
                  onEdit={() => handleEditBook(book)}
                  onDelete={() => setShowDeleteModal({ show: true, bookId: book.id })}
                  onBookDroppedForSeries={!book.series ? handleBookDroppedForNewSeries : null}
                  onAddToExistingSeries={handleBookDroppedOnSeries}
                  onSeriesMerge={handleSeriesMerge}
                  dataItemId={book.id}
                  dataFirstLetter={bookLetter}
                />
              );
            });
          }
        } else {
          items.push(
            <BookThumbnail
              key={item.book.id}
              onBookDroppedForSeries={!item.book.series ? handleBookDroppedForNewSeries : null}
              onAddToExistingSeries={handleBookDroppedOnSeries}
              onSeriesMerge={handleSeriesMerge}
              book={item.book}
              onClick={() => handleBookClick(item.book.id)}
              onEdit={() => handleEditBook(item.book)}
              onDelete={() => setShowDeleteModal({ show: true, bookId: item.book.id })}
              dataItemId={item.book.id}
              dataFirstLetter={letter}
            />
          );
        }
      });

      return (
        <div className={`book-grid ${sortLoading ? 'sort-loading' : ''} ${expandedSeries ? 'has-expanded' : ''}`}>
          {items}
        </div>
      );
    }

    const grouped = groupBooks(filteredBooks, groupBy);
    const sortedGroupKeys = Object.keys(grouped).sort();

    return (
      <div className={`books-groups ${sortLoading || groupLoading ? 'sort-loading' : ''}`}>
        {sortedGroupKeys.map((groupKey) => {
          const groupBooks = grouped[groupKey];
          const isExpanded = expandedGroups.has(groupKey);
          const sortedGroupBooks = sortBooks(groupBooks, sortBy);
          
          return (
            <div key={groupKey} className="book-group">
              <div 
                className="group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                <div className="group-title">
                  <BsChevronDown className={`group-chevron ${isExpanded ? 'expanded' : ''}`} />
                  <span>{groupKey}</span>
                  <span className="group-count">({groupBooks.length})</span>
                </div>
              </div>
              
              {isExpanded && (
                <div className="book-grid">
                  {sortedGroupBooks.map((book) => {
                    const sortField = (sortBy === 'author' || sortBy === 'authorReverse')
                      ? book.author
                      : (book.series || book.title);
                    const firstChar = sortField?.charAt(0)?.toUpperCase() || '';
                    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
                    
                    return (
                      <BookThumbnail
                        key={book.id}
                        book={book}
                        onClick={() => handleBookClick(book.id)}
                        onBookDroppedForSeries={!book.series ? handleBookDroppedForNewSeries : null}
                        onAddToExistingSeries={handleBookDroppedOnSeries}
                        onSeriesMerge={handleSeriesMerge}
                        onEdit={() => handleEditBook(book)}
                        onDelete={() => setShowDeleteModal({ show: true, bookId: book.id })}
                        dataFirstLetter={letter}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const sortOptions = [
    { value: 'title', label: 'Title A-Z' },
    { value: 'titleReverse', label: 'Title Z-A' },
    { value: 'author', label: 'Author A-Z' },
    { value: 'authorReverse', label: 'Author Z-A' },
    { value: 'series', label: 'Series A-Z' },
    { value: 'year', label: 'Year (Newest)' },
    { value: 'yearReverse', label: 'Year (Oldest)' },
    { value: 'lastAdded', label: 'Last Added' },
    { value: 'lastAddedReverse', label: 'First Added' }
  ];

  const groupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'author', label: 'Group by Author' },
    { value: 'genre', label: 'Group by Genre' },
    { value: 'series', label: 'Group by Series' },
    { value: 'format', label: 'Group by Format' },
    { value: 'decade', label: 'Group by Decade' },
    { value: 'language', label: 'Group by Language' }
  ];

  return (
    <div className="book-search" ref={scrollContainerRef}>
      {/* Alphabetical Index - shows when sorted alphabetically */}
      <AlphabeticalIndex
        items={filteredBooks}
        getTitle={(book) => {
          if (sortBy === 'author' || sortBy === 'authorReverse') {
            return book.author;
          }
          return book.series || book.title;
        }}
        scrollContainer={scrollContainer}
        sortBy={
          sortBy === 'series' || sortBy === 'authorSeries' ? 'title' : 
          sortBy === 'seriesReverse' ? 'titleReverse' : 
          sortBy
        }
        disabled={searchCriteria?.searchText?.trim() || groupBy !== 'none'}
      />
      
      <div className="books-results">
        <CollectionHeader
          filteredCount={bookCount.filtered}
          totalCount={bookCount.total}
          itemLabel="books"
          sortBy={sortBy}
          sortOptions={sortOptions}
          onSortChange={handleSortChange}
          sortLoading={sortLoading}
          groupBy={groupBy}
          groupOptions={groupOptions}
          onGroupChange={handleGroupChange}
          groupLoading={groupLoading}
          expandAllGroups={expandAllGroups}
          onToggleAllGroups={toggleAllGroups}
          stackEnabled={stackEnabled}
          onStackChange={setStackEnabled}
          addButtonLabel="Add Book"
          onAdd={() => setShowAddDialog(true)}
          loading={loading}
        />

        {renderBookGrid()}
      </div>

      <AddBookDialog
        show={showAddDialog}
        onHide={() => {
          setShowAddDialog(false);
          setTemplateBook(null); // Clear template when dialog closes
        }}
        onAddBook={onAddBook}
        defaultTitleStatus={defaultTitleStatus}
        onShowAlert={onShowAlert}
        onAddBooksBatch={async (books) => {
          try {
            // Ensure titleStatus is set for batch additions if defaultTitleStatus is provided
            const booksWithStatus = defaultTitleStatus 
              ? books.map(book => ({ ...book, titleStatus: defaultTitleStatus }))
              : books;
            const result = await bookService.addBooksBatch(booksWithStatus);
            if (result.errors && result.errors.length > 0) {
              const errorMsg = result.errors.map(e => `${e.book}: ${e.error}`).join(', ');
              throw new Error(errorMsg);
            }
            return result.success || [];
          } catch (error) {
            console.error('Error adding books batch:', error);
            throw error;
          }
        }}
        onAddStart={() => {
          setShowAddDialog(false);
          setAddingBook(true);
        }}
        onBookAdded={async () => {
          try {
            await loadBooks();
          } finally {
            setAddingBook(false);
            setTemplateBook(null); // Clear template after book is added
          }
        }}
        onAddError={(err) => {
          setAddingBook(false);
          const errorMessage = err?.message || 'Failed to add book';
          if (onShowAlert) {
            onShowAlert(errorMessage, 'danger');
          }
        }}
        templateBook={templateBook}
      />

      {editingBook && (
        <BookForm
          book={editingBook}
          onSave={async (bookData) => {
            await onUpdateBook(editingBook.id, bookData);
            await handleFormSave();
          }}
          onCancel={handleFormCancel}
        />
      )}

      {selectedBookDetails && (
        <BookDetailCard
          book={selectedBookDetails}
          onClose={() => {
            // Save current expanded series before closing (use ref to get latest value)
            const currentExpanded = expandedSeriesRef.current;
            if (currentExpanded) {
              sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
            }
            // Close modal first
            setSelectedBookDetails(null);
            // Immediately restore expanded series state after modal closes
            // Use a small delay to ensure DOM has updated
            requestAnimationFrame(() => {
              if (currentExpanded) {
                setExpandedSeries(currentExpanded);
              }
            });
          }}
          onEdit={() => handleEditBook(selectedBookDetails)}
          onUpdateBook={onUpdateBook}
          onBookUpdated={async (bookId) => {
            try {
              console.log('BookSearch: Refreshing book data for ID:', bookId);
              // Save expanded series state before reloading
              const currentExpanded = expandedSeries;
              // Refresh the book list to show updated covers
              await loadBooks();
              // Restore expanded series state after reload
              if (currentExpanded) {
                setExpandedSeries(currentExpanded);
                sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
              }
              // Also update the detail card if it's open
              const updatedBook = await bookService.getBookById(bookId);
              console.log('BookSearch: Updated book data:', updatedBook);
              console.log('BookSearch: ebookFile value:', updatedBook?.ebookFile);
              setSelectedBookDetails(updatedBook);
            } catch (err) {
              console.error('Failed to reload book details after update:', err);
              if (onShowAlert) {
                onShowAlert('Book updated but failed to refresh details', 'warning');
              }
            }
          }}
          onDelete={async () => {
            try {
              // Save expanded series state before reloading
              const currentExpanded = expandedSeries;
              await onDeleteBook(selectedBookDetails.id);
              setSelectedBookDetails(null);
              await loadBooks();
              // Restore expanded series state after reload
              if (currentExpanded) {
                setExpandedSeries(currentExpanded);
                sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
              }
            } catch (e) {
              if (onShowAlert) onShowAlert('Failed to delete book: ' + (e?.message || ''), 'danger');
            }
          }}
          onSearch={updateSearchViaUrl}
          onBookClick={handleBookClick}
          onAddBooksBatch={async (books) => {
            try {
              // Save expanded series state before reloading
              const currentExpanded = expandedSeries;
              const result = await bookService.addBooksBatch(books);
              if (result.errors && result.errors.length > 0) {
                const errorMsg = result.errors.map(e => `${e.book}: ${e.error}`).join(', ');
                throw new Error(errorMsg);
              }
              await loadBooks();
              // Restore expanded series state after reload
              if (currentExpanded) {
                setExpandedSeries(currentExpanded);
                sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
              }
              return result.success || [];
            } catch (error) {
              console.error('Error adding books batch:', error);
              throw error;
            }
          }}
          onAddStart={() => {
            setAddingBook(true);
          }}
          onBookAdded={async () => {
            try {
              // Save expanded series state before reloading
              const currentExpanded = expandedSeries;
              await loadBooks();
              // Restore expanded series state after reload
              if (currentExpanded) {
                setExpandedSeries(currentExpanded);
                sessionStorage.setItem('bookSearchExpandedSeries', currentExpanded);
              }
            } finally {
              setAddingBook(false);
            }
          }}
          onAddError={(err) => {
            setAddingBook(false);
            const errorMessage = err?.message || 'Failed to add book';
            if (onShowAlert) {
              onShowAlert(errorMessage, 'danger');
            }
          }}
        />
      )}

      {addingBook && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-message">
            Adding book to your collection...
          </div>
        </div>
      )}


      {showDeleteModal.show && (
        <div className="modal show" style={{ display: 'block', zIndex: 10210 }} tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete Book</h5>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to remove this book from your collection?</p>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowDeleteModal({ show: false, bookId: null })}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={async () => {
                    const id = showDeleteModal.bookId;
                    try {
                      await onDeleteBook(id);
                      if (selectedBookDetails && selectedBookDetails.id === id) {
                        setSelectedBookDetails(null);
                      }
                      await loadBooks();
                    } finally {
                      setShowDeleteModal({ show: false, bookId: null });
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(showDeleteModal.show) && (
        <div className="modal-backdrop show" style={{ zIndex: 10200 }}></div>
      )}

      {/* Create Series Modal */}
      <Modal 
        show={showCreateSeriesModal} 
        onHide={handleCancelCreateSeries}
        centered
        className="create-series-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Create New Series</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-3">
            You're about to create a new series with these two books:
          </p>
          <div className="create-series-books mb-4">
            <div className="create-series-book">
              <strong>{createSeriesData.targetBook?.title}</strong>
              {createSeriesData.targetBook?.authors && (
                <div className="text-muted small">
                  {Array.isArray(createSeriesData.targetBook.authors) 
                    ? createSeriesData.targetBook.authors.join(', ') 
                    : createSeriesData.targetBook.authors}
                </div>
              )}
            </div>
            <div className="create-series-book">
              <strong>{createSeriesData.draggedBook?.title}</strong>
              {createSeriesData.draggedBook?.authors && (
                <div className="text-muted small">
                  {Array.isArray(createSeriesData.draggedBook.authors) 
                    ? createSeriesData.draggedBook.authors.join(', ') 
                    : createSeriesData.draggedBook.authors}
                </div>
              )}
            </div>
          </div>
          <Form.Group>
            <Form.Label>Series Name</Form.Label>
            <Form.Control
              type="text"
              value={seriesNameInput}
              onChange={(e) => setSeriesNameInput(e.target.value)}
              placeholder="Enter series name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmCreateSeries();
                }
              }}
            />
            <Form.Text className="text-muted">
              Series numbers will be inferred from the titles if possible
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCancelCreateSeries}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirmCreateSeries}
            disabled={!seriesNameInput.trim()}
          >
            Create Series
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Merge Series Modal */}
      <Modal 
        show={showMergeSeriesModal} 
        onHide={handleCancelMergeSeries}
        centered
        className="create-series-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Merge Series</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-3">
            You're about to merge two series. Choose which series name to keep:
          </p>
          <div className="merge-series-options mb-4">
            <div 
              className={`merge-series-option ${mergeSeriesData.selectedName === mergeSeriesData.targetSeries ? 'selected' : ''}`}
              onClick={() => setMergeSeriesData(prev => ({ ...prev, selectedName: prev.targetSeries }))}
            >
              <Form.Check 
                type="radio"
                name="seriesName"
                id="targetSeries"
                checked={mergeSeriesData.selectedName === mergeSeriesData.targetSeries}
                onChange={() => setMergeSeriesData(prev => ({ ...prev, selectedName: prev.targetSeries }))}
                label={
                  <div>
                    <strong>{mergeSeriesData.targetSeries}</strong>
                    <div className="text-muted small">{mergeSeriesData.targetBooks.length} books</div>
                  </div>
                }
              />
            </div>
            <div 
              className={`merge-series-option ${mergeSeriesData.selectedName === mergeSeriesData.sourceSeries ? 'selected' : ''}`}
              onClick={() => setMergeSeriesData(prev => ({ ...prev, selectedName: prev.sourceSeries }))}
            >
              <Form.Check 
                type="radio"
                name="seriesName"
                id="sourceSeries"
                checked={mergeSeriesData.selectedName === mergeSeriesData.sourceSeries}
                onChange={() => setMergeSeriesData(prev => ({ ...prev, selectedName: prev.sourceSeries }))}
                label={
                  <div>
                    <strong>{mergeSeriesData.sourceSeries}</strong>
                    <div className="text-muted small">{mergeSeriesData.sourceBooks.length} books</div>
                  </div>
                }
              />
            </div>
          </div>
          <p className="text-muted small mb-0">
            Total: {mergeSeriesData.sourceBooks.length + mergeSeriesData.targetBooks.length} books will be in the merged series
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCancelMergeSeries}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirmMergeSeries}
            disabled={!mergeSeriesData.selectedName}
          >
            Merge Series
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
});

BookSearch.displayName = 'BookSearch';

export default BookSearch;

