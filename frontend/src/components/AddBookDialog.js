import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Form, Alert, Table, Badge } from 'react-bootstrap';
import { BsX, BsSearch, BsPlus, BsChevronDown, BsChevronRight, BsBook } from 'react-icons/bs';
import bookService from '../services/bookService';
import BookForm from './BookForm';
import VolumeSelector from './VolumeSelector';
import './AddBookDialog.css';

const AddBookDialog = ({ show, onHide, onAddBook, onAddStart, onBookAdded, onAddError, templateBook, onAddBooksBatch, defaultTitleStatus, onShowAlert }) => {
  const [searchTab, setSearchTab] = useState('isbn'); // 'isbn' or 'title'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIsbn, setSearchIsbn] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchAuthor, setSearchAuthor] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [groupedResults, setGroupedResults] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedBookGroup, setSelectedBookGroup] = useState(null);
  // Load language preference from localStorage, default to 'any'
  const [searchLanguage, setSearchLanguage] = useState(() => {
    return localStorage.getItem('bookdex-search-language') || 'any';
  });
  const [enriching, setEnriching] = useState(false);
  const [enrichingBookIndex, setEnrichingBookIndex] = useState(null); // Track which book is being enriched
  const [showVolumeSelector, setShowVolumeSelector] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false); // Track quick add in progress
  
  // Quick add options
  const [quickAddOwner, setQuickAddOwner] = useState('');
  const [quickAddTitleStatus, setQuickAddTitleStatus] = useState('owned');
  const [quickAddBookType, setQuickAddBookType] = useState('book');
  const [availableOwners, setAvailableOwners] = useState([]);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [filteredOwners, setFilteredOwners] = useState([]);
  
  // Detect book type from ISBN and genres
  const detectBookType = (isbn, genres = []) => {
    const genreList = Array.isArray(genres) ? genres : [];
    
    // Check for music score by ISBN (ISMN starts with 9790)
    const cleanIsbn = (isbn || '').replace(/[-\s]/g, '');
    if (cleanIsbn.startsWith('9790')) {
      return 'score';
    }
    
    // Check genres for music or comics patterns
    for (const genre of genreList) {
      if (!genre || typeof genre !== 'string') continue;
      const genreLower = genre.toLowerCase();
      
      // Check for music score
      if (genreLower.includes('music /') || genreLower.startsWith('music/')) {
        return 'score';
      }
      
      // Check for graphic novel / comics
      if (
        genreLower.includes('comics & graphic novels') ||
        genreLower.includes('bandes dessinées') ||
        genreLower.includes('comic strips') ||
        genreLower.includes('manga') ||
        genreLower.includes('/manga/') ||
        genreLower.includes('graphic novel')
      ) {
        return 'graphic-novel';
      }
    }
    
    return 'book';
  };
  
  const isbnInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const ownerInputRef = useRef(null);

  // Save language preference when it changes
  const handleLanguageChange = (lang) => {
    setSearchLanguage(lang);
    localStorage.setItem('bookdex-search-language', lang);
  };

  useEffect(() => {
    if (show) {
      setTimeout(() => {
        if (searchTab === 'isbn' && isbnInputRef.current) {
          isbnInputRef.current.focus();
        } else if (searchTab === 'title' && titleInputRef.current) {
          titleInputRef.current.focus();
        }
      }, 100);
      
      // Fetch available owners when dialog opens
      const fetchOwners = async () => {
        try {
          const suggestions = await bookService.getAutocompleteSuggestions('owner', '');
          const owners = suggestions
            .map(s => typeof s === 'string' ? s : (s.owner || s.value || s))
            .filter(Boolean)
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
          setAvailableOwners(owners);
        } catch (err) {
          console.warn('Failed to fetch owners:', err);
          setAvailableOwners([]);
        }
      };
      fetchOwners();
    }
  }, [show, searchTab]);

  // Reset search fields when dialog closes
  useEffect(() => {
    if (!show) {
      setSearchTab('isbn');
      setSearchQuery('');
      setSearchIsbn('');
      setSearchTitle('');
      setSearchAuthor('');
      setShowMetadataForm(false);
      setSelectedBook(null);
      setSelectedBookGroup(null);
      // Reset quick add options
      setQuickAddOwner('');
      setQuickAddTitleStatus('owned');
      setQuickAddBookType('book');
      setShowOwnerDropdown(false);
      setFilteredOwners([]);
    }
  }, [show]);

  // Filter owners based on input
  const handleOwnerInputChange = (value) => {
    setQuickAddOwner(value);
    if (value.trim()) {
      const filtered = availableOwners.filter(owner =>
        owner.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredOwners(filtered);
      setShowOwnerDropdown(filtered.length > 0);
    } else {
      setFilteredOwners(availableOwners);
      setShowOwnerDropdown(availableOwners.length > 0);
    }
  };

  const handleOwnerSelect = (owner) => {
    setQuickAddOwner(owner);
    setShowOwnerDropdown(false);
  };

  // Handle template book - pre-fill form when templateBook is provided
  useEffect(() => {
    if (show && templateBook) {
      // If template book has a series, show volume selector instead of single form
      if (templateBook.series) {
        setShowVolumeSelector(true);
      } else {
        // Create a template book object with incremented series number
        const nextSeriesNumber = templateBook.seriesNumber ? templateBook.seriesNumber + 1 : 1;
        const template = {
          ...templateBook,
          id: undefined, // Remove ID so it's treated as a new book
          title: templateBook.title || '',
          series: templateBook.series || '',
          seriesNumber: nextSeriesNumber,
          isbn: '', // Clear ISBNs for new volume
          isbn13: '',
          cover: null, // Clear cover - user can search for new volume cover
          coverUrl: null,
          subtitle: '', // Clear subtitle
          description: '', // Clear description - might be different for new volume
          urls: {} // Clear URLs
        };
        
        // Set as selected book and show metadata form directly
        setSelectedBook(template);
        setSelectedBookGroup([template]);
        setShowMetadataForm(true);
      }
    }
  }, [show, templateBook]);

  const handleVolumesSelected = async (enrichedVolumes) => {
    if (!onAddBooksBatch) {
      // Fallback to adding one by one if batch not available
      if (onAddStart) onAddStart();
      try {
        for (const volume of enrichedVolumes) {
          await onAddBook(volume);
        }
        if (onBookAdded) {
          onBookAdded(enrichedVolumes[enrichedVolumes.length - 1]);
        }
      } catch (err) {
        if (onAddError) onAddError(err);
        throw err;
      }
    } else {
      // Use batch add
      if (onAddStart) onAddStart();
      try {
        await onAddBooksBatch(enrichedVolumes);
        if (onBookAdded) {
          onBookAdded(enrichedVolumes[enrichedVolumes.length - 1]);
        }
      } catch (err) {
        if (onAddError) onAddError(err);
        throw err;
      }
    }
  };

  // Group search results by title + authors (work)
  const groupSearchResults = (results) => {
    const groups = new Map();
    
    results.forEach(book => {
      // Create a key from title and authors for grouping
      const title = book.title || 'Unknown Title';
      const authors = Array.isArray(book.authors) 
        ? book.authors.join(', ') 
        : (book.authors || 'Unknown Author');
      const workKey = book._openLibraryData?.workKey || 'no-work-key';
      
      // Use work key if available, otherwise use title+authors
      const groupKey = workKey !== 'no-work-key' 
        ? workKey 
        : `${title}|||${authors}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          title: title,
          authors: authors,
          workKey: workKey,
          cover: null,
          books: []
        });
      }
      
      const group = groups.get(groupKey);
      group.books.push(book);
      
      // Set group cover from first book with cover
      if (!group.cover && book.coverUrl) {
        group.cover = book.coverUrl;
      }
    });
    
    // Convert to array and sort by title
    const grouped = Array.from(groups.values()).sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    
    return grouped;
  };

  // Extract ASIN from Amazon URL
  const extractAsinFromUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i,
      /\/ASIN\/([A-Z0-9]{10})/i
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1].toUpperCase();
    }
    return null;
  };

  const handleSearch = async () => {
    // Check if ISBN field contains an Amazon URL
    const amazonAsin = searchIsbn.includes('amazon') ? extractAsinFromUrl(searchIsbn) : null;
    
    // Remove all non-digit characters from ISBN for search (unless it's an Amazon URL)
    const cleanedIsbn = amazonAsin ? '' : searchIsbn.replace(/\D/g, '').trim();
    const trimmedTitle = searchTitle.trim();
    const trimmedAuthor = searchAuthor.trim();
    
    // Check if any search field is filled based on current tab
    if (searchTab === 'isbn') {
      if (!cleanedIsbn && !amazonAsin) {
        setError('Please enter an ISBN or Amazon URL');
        return;
      }
    } else {
      if (!trimmedTitle && !trimmedAuthor) {
        setError('Please enter at least a title or author');
        return;
      }
    }

    setSearching(true);
    setError('');
    
    try {
      // Build search filters
      const filters = {
        language: searchLanguage === 'any' ? undefined : searchLanguage // Don't pass 'any', let backend handle it
      };
      
      let query = '';
      
      if (searchTab === 'isbn') {
        if (amazonAsin) {
          // Amazon ASIN detected - pass it to backend
          filters.asin = amazonAsin;
          filters.amazonUrl = searchIsbn.trim();
        } else {
          // ISBN search mode - send only digits to backend
          filters.isbn = cleanedIsbn;
        }
        query = ''; // ISBN search doesn't need a general query
      } else {
        // Title/Author search mode
        // Pass title and author as separate filters for better API handling
        if (trimmedTitle) {
          filters.title = trimmedTitle;
        }
        if (trimmedAuthor) {
          filters.author = trimmedAuthor;
        }
        
        // Build query from title/author - prefer title if available
        // The backend will use filters.title and filters.author for structured searches
        if (trimmedTitle && trimmedAuthor) {
          // Both provided - combine for general query, but filters will be used for structured search
          query = `${trimmedTitle} ${trimmedAuthor}`;
        } else if (trimmedTitle) {
          query = trimmedTitle;
        } else if (trimmedAuthor) {
          query = trimmedAuthor;
        }
      }
      
      const results = await bookService.searchExternalBooks(query, filters);
      setSearchResults(results);
      
      // Group results
      const grouped = groupSearchResults(results);
      setGroupedResults(grouped);
      
      // Initialize quickAddBookType with detected type from first result (if available)
      // Only if user hasn't manually changed it (still at default 'book')
      if (results.length > 0 && quickAddBookType === 'book') {
        const firstBook = results[0];
        const detectedType = detectBookType(firstBook.isbn13 || firstBook.isbn, firstBook.genres || []);
        if (detectedType !== 'book') {
          setQuickAddBookType(detectedType);
          console.log('[AddBookDialog] Initialized quickAddBookType to:', detectedType);
        }
      }
      
      // Provide feedback when no results found
      if (results.length === 0) {
        const searchTerms = [];
        if (trimmedTitle) searchTerms.push(`title "${trimmedTitle}"`);
        if (trimmedAuthor) searchTerms.push(`author "${trimmedAuthor}"`);
        const searchDesc = searchTerms.length > 0 ? searchTerms.join(' and ') : 'your search';
        setError(`No books found for ${searchDesc}. Try different search terms or check your spelling.`);
      } else {
        setError(''); // Clear any previous errors
      }
      
      // Expand all groups initially if there are few results
      if (grouped.length <= 3) {
        setExpandedGroups(new Set(grouped.map((_, idx) => idx)));
      } else {
        setExpandedGroups(new Set());
      }
    } catch (err) {
      console.error('Search error:', err);
      const errorMessage = err.message || 'Unknown error occurred';
      setError(`Search failed: ${errorMessage}. Please try again or use ISBN search for more reliable results.`);
      setSearchResults([]);
      setGroupedResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectBook = async (book, allBooksInGroup = null, bookIndex = null, groupIndex = null, listIndex = null) => {
    // Prevent multiple clicks while enriching
    if (enriching) return;
    
    // Create a unique identifier for this button (combine groupIndex and bookIndex)
    let buttonId;
    if (groupIndex !== null && bookIndex !== null) {
      buttonId = `group-${groupIndex}-book-${bookIndex}`;
    } else if (listIndex !== null) {
      buttonId = `list-${listIndex}`;
    } else {
      buttonId = `book-${bookIndex || 'unknown'}`;
    }
    
    // Enrich the selected book with OpenLibrary data
    setEnriching(true);
    setEnrichingBookIndex(buttonId);
    try {
      const enrichedBook = await bookService.enrichBook(book);
      setSelectedBook(enrichedBook);
      // Also enrich all books in the group if available
      if (allBooksInGroup && allBooksInGroup.length > 1) {
        const enrichedGroup = await Promise.all(
          allBooksInGroup.map(b => bookService.enrichBook(b))
        );
        setSelectedBookGroup(enrichedGroup);
      } else {
        setSelectedBookGroup(allBooksInGroup || [enrichedBook]);
      }
    } catch (error) {
      console.warn('Failed to enrich book, using original:', error);
      // If enrichment fails, use original book
      setSelectedBook(book);
      setSelectedBookGroup(allBooksInGroup || [book]);
    } finally {
      setEnriching(false);
      setEnrichingBookIndex(null);
      setShowMetadataForm(true);
    }
  };

  // Quick Add - enrich and add book in one step without showing the form
  const handleQuickAdd = async (book) => {
    if (quickAdding || enriching) return;
    
    setQuickAdding(true);
    setError('');
    
    try {
      // Enrich the book first
      let enrichedBook;
      try {
        enrichedBook = await bookService.enrichBook(book);
      } catch (enrichError) {
        console.warn('Failed to enrich book, using original:', enrichError);
        enrichedBook = book;
      }
      
      // Prepare book data for saving
      const genres = enrichedBook.genres || book.genres || [];
      const isbn13 = enrichedBook.isbn13 || book.isbn13 || '';
      
      // Use explicitly selected bookType, or auto-detect from ISBN/genres
      const bookType = quickAddBookType !== 'book' ? quickAddBookType : detectBookType(isbn13, genres);
      
      const bookData = {
        title: enrichedBook.title || book.title,
        subtitle: enrichedBook.subtitle || book.subtitle || '',
        authors: enrichedBook.authors || book.authors || [],
        isbn: enrichedBook.isbn || book.isbn || '',
        isbn13: isbn13,
        publisher: enrichedBook.publisher || book.publisher || '',
        publishedYear: enrichedBook.publishedYear || book.publishedYear || '',
        language: enrichedBook.language || book.language || '',
        format: 'physical',
        series: enrichedBook.series || book.series || '',
        seriesNumber: enrichedBook.seriesNumber || book.seriesNumber || '',
        genres: genres,
        pageCount: enrichedBook.pageCount || book.pageCount || '',
        description: enrichedBook.description || book.description || '',
        coverUrl: enrichedBook.coverUrl || book.coverUrl || '',
        availableCovers: enrichedBook.availableCovers || book.availableCovers || [],
        urls: enrichedBook.urls || book.urls || {},
        titleStatus: quickAddTitleStatus || defaultTitleStatus || 'owned',
        bookType: bookType,
        owner: quickAddOwner || ''
      };
      
      // Add the book
      if (onAddStart) onAddStart();
      const createdBook = await onAddBook(bookData);
      
      // Close dialog and notify success
      handleClose();
      if (onBookAdded) {
        onBookAdded(createdBook);
      }
    } catch (err) {
      console.error('Quick add failed:', err);
      setError(`Failed to add book: ${err.message || 'Unknown error'}`);
      if (onAddError) {
        onAddError(err);
      }
    } finally {
      setQuickAdding(false);
    }
  };

  const handleManualEntry = () => {
    setSelectedBook({});
    setSelectedBookGroup([]);
    setShowMetadataForm(true);
  };

  const handleClose = () => {
    setSearchTab('isbn');
    setSearchQuery('');
    setSearchIsbn('');
    setSearchTitle('');
    setSearchAuthor('');
    setSearchResults([]);
    setGroupedResults([]);
    setExpandedGroups(new Set());
    setError('');
    setShowMetadataForm(false);
    setSelectedBook(null);
    setSelectedBookGroup(null);
    setSearchLanguage('any'); // Reset to default
    setShowVolumeSelector(false);
    onHide();
  };

  const handleMetadataFormClose = () => {
    setShowMetadataForm(false);
    setSelectedBook(null);
    setSelectedBookGroup(null);
  };

  const handleBookAdded = (book) => {
    setShowMetadataForm(false);
    setSelectedBook(null);
    setSelectedBookGroup(null);
    onHide();
    
    if (onBookAdded) {
      onBookAdded(book);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Format ISBN progressively as user types: 978-X-XXX-XXXXX-X or 979-X-XXX-XXXXX-X
  const formatIsbnProgressive = (digits) => {
    // Remove all non-digit characters
    const digitsOnly = digits.replace(/\D/g, '');
    
    // If empty, return empty
    if (digitsOnly.length === 0) {
      return '';
    }
    
    // Determine prefix: 979 or 978
    // If starts with 79 or 9 (but not 978), use 979; otherwise use 978
    let prefix = '978';
    let processedDigits = digitsOnly;
    
    // Check if we should use 979 prefix
    // Priority: if starts with 79, use 979; if starts with 9 (but not 79 or 978), use 979
    if (digitsOnly.startsWith('79')) {
      prefix = '979';
    } else if (digitsOnly.startsWith('9') && !digitsOnly.startsWith('978')) {
      prefix = '979';
    }
    
    // Only convert to ISBN-13 if we have 10+ digits (complete ISBN)
    // Don't add prefix automatically when typing character by character
    // Special case: if we have 12 digits starting with 78, it's likely a scanned ISBN without prefix
    // Take the last 10 digits and add the appropriate prefix
    if (digitsOnly.length >= 10 && digitsOnly.length < 13 && !digitsOnly.startsWith('978') && !digitsOnly.startsWith('979')) {
      const last10Digits = digitsOnly.substring(digitsOnly.length - 10);
      processedDigits = prefix + last10Digits;
    } else if (digitsOnly.length > 13) {
      processedDigits = digitsOnly.substring(digitsOnly.length - 13);
    }
    
    // Limit to 13 digits
    const limitedDigits = processedDigits.substring(0, 13);
    
    // Progressive formatting for ISBN-13 starting with 978 or 979
    if (limitedDigits.startsWith('978') || limitedDigits.startsWith('979')) {
      const isbnPrefix = limitedDigits.substring(0, 3); // 978 or 979
      let formatted = isbnPrefix;
      
      // After prefix (978 or 979), add dash
      if (limitedDigits.length >= 3) {
        formatted += '-';
        
        // Add first digit after prefix- (position 3)
        if (limitedDigits.length >= 4) {
          formatted += limitedDigits.substring(3, 4);
          
          // After prefix-X, add dash
          if (limitedDigits.length >= 4) {
            formatted += '-';
            
            // Add next 3 digits (positions 4-6) for section XXX
            if (limitedDigits.length >= 5) {
              const section2 = limitedDigits.substring(4, Math.min(7, limitedDigits.length));
              formatted += section2;
              
              // After prefix-X-XXX (when section XXX is complete or partially filled), add dash
              if (limitedDigits.length >= 7) {
                formatted += '-';
                
                // Add next 5 digits (positions 7-11) for section XXXXX
                if (limitedDigits.length >= 8) {
                  const section3 = limitedDigits.substring(7, Math.min(12, limitedDigits.length));
                  formatted += section3;
                  
                  // After prefix-X-XXX-XXXXX (when section XXXXX is complete), add dash
                  if (limitedDigits.length >= 12) {
                    formatted += '-';
                    
                    // Add last digit (position 12)
                    if (limitedDigits.length >= 13) {
                      formatted += limitedDigits.substring(12, 13);
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      return formatted;
    }
    
    // Progressive formatting for ISBN-10
    if (limitedDigits.length <= 10 && limitedDigits.length > 0) {
      let formatted = limitedDigits.substring(0, 1);
      
      if (limitedDigits.length > 1) {
        formatted += '-';
        formatted += limitedDigits.substring(1, Math.min(4, limitedDigits.length));
        
        if (limitedDigits.length > 4) {
          formatted += '-';
          formatted += limitedDigits.substring(4, Math.min(9, limitedDigits.length));
          
          if (limitedDigits.length > 9) {
            formatted += '-';
            formatted += limitedDigits.substring(9, 10);
          }
        }
      }
      
      return formatted;
    }
    
    // For other cases, return digits as-is
    return limitedDigits;
  };

  // Filter ISBN input and format progressively as user types
  const handleIsbnChange = (e) => {
    const inputValue = e.target.value;
    const previousValue = searchIsbn;
    
    // If input looks like a URL, don't format it - just store as-is
    if (inputValue.startsWith('http') || inputValue.includes('amazon.')) {
      setSearchIsbn(inputValue);
      return;
    }
    
    // Get cursor position before processing
    const cursorPosition = e.target.selectionStart;
    
    // Extract only digits from both current and previous values
    const digitsOnly = inputValue.replace(/\D/g, '');
    const previousDigitsOnly = previousValue.replace(/\D/g, '');
    
    // Detect if a large amount of text was inserted (likely from iOS scan)
    const largeInsertion = digitsOnly.length - previousDigitsOnly.length > 5;
    
    // Check if user is deleting (backspace/delete)
    const isDeleting = digitsOnly.length < previousDigitsOnly.length;
    const lengthDecreased = inputValue.length < previousValue.length;
    
    // If length decreased but number of digits stayed the same, a dash was deleted
    const dashWasDeleted = lengthDecreased && digitsOnly.length === previousDigitsOnly.length;
    
    // If a dash was deleted, also remove the last digit
    if (dashWasDeleted && previousDigitsOnly.length > 0) {
      // Remove the last digit (the one that was before the dash in the formatted string)
      const newDigits = previousDigitsOnly.substring(0, previousDigitsOnly.length - 1);
      const formatted = formatIsbnProgressive(newDigits);
      setSearchIsbn(formatted);
      
      // Set cursor position at the end (after the last character)
      setTimeout(() => {
        if (isbnInputRef.current) {
          const newCursorPos = formatted.length;
          isbnInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
      return;
    }
    
    // For large insertions (iOS scan), process the digits directly without progressive formatting
    if (largeInsertion && digitsOnly.length >= 10) {
      // Format the complete ISBN
      const formatted = formatIsbnProgressive(digitsOnly);
      setSearchIsbn(formatted);
      
      // Set cursor at the end
      setTimeout(() => {
        if (isbnInputRef.current) {
          const newCursorPos = formatted.length;
          isbnInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
      return;
    }
    
    // Format progressively
    const formatted = formatIsbnProgressive(digitsOnly);
    setSearchIsbn(formatted);
    
    // Try to maintain cursor position after formatting
    if (isDeleting && isbnInputRef.current) {
      setTimeout(() => {
        if (isbnInputRef.current) {
          // Calculate new cursor position
          // Count digits before cursor in original input
          const digitsBeforeCursor = inputValue.substring(0, cursorPosition).replace(/\D/g, '').length;
          // Find position in formatted string after same number of digits
          let newPos = 0;
          let digitCount = 0;
          for (let i = 0; i < formatted.length && digitCount < digitsBeforeCursor; i++) {
            if (/\d/.test(formatted[i])) {
              digitCount++;
            }
            newPos = i + 1;
          }
          // Ensure cursor is not placed before a dash
          if (newPos < formatted.length && formatted[newPos] === '-') {
            newPos++;
          }
          isbnInputRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
  };

  // Format ISBN when field loses focus (ensure complete formatting)
  const handleIsbnBlur = (e) => {
    const inputValue = e.target.value;
    
    // Don't reformat URLs
    if (inputValue.startsWith('http') || inputValue.includes('amazon.')) {
      return;
    }
    
    const digitsOnly = inputValue.replace(/\D/g, '');
    
    if (digitsOnly.length > 0) {
      const formatted = formatIsbnProgressive(digitsOnly);
      setSearchIsbn(formatted);
    }
  };

  // Handle paste/scan events from iOS
  const handleIsbnPaste = (e) => {
    e.preventDefault();
    
    // Get pasted text
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    
    // If pasting a URL, don't format - store as-is
    if (pastedText.startsWith('http') || pastedText.includes('amazon.')) {
      setSearchIsbn(pastedText.trim());
      return;
    }
    
    // Extract only digits
    const digitsOnly = pastedText.replace(/\D/g, '');
    
    if (digitsOnly.length > 0) {
      // Format the complete ISBN
      const formatted = formatIsbnProgressive(digitsOnly);
      setSearchIsbn(formatted);
      
      // Set cursor at the end
      setTimeout(() => {
        if (isbnInputRef.current) {
          const newCursorPos = formatted.length;
          isbnInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const toggleGroup = (groupIndex) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupIndex)) {
      newExpanded.delete(groupIndex);
    } else {
      newExpanded.add(groupIndex);
    }
    setExpandedGroups(newExpanded);
  };

  const getLanguageDisplay = (lang) => {
    if (!lang) return 'Unknown';
    const langMap = {
      'en': 'English',
      'eng': 'English',
      'fr': 'French',
      'fre': 'French',
      'fra': 'French',
      'es': 'Spanish',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese'
    };
    return langMap[lang.toLowerCase()] || lang.toUpperCase();
  };

  const getLanguageBadgeVariant = (lang) => {
    if (!lang) return 'secondary';
    const langLower = lang.toLowerCase();
    if (langLower === 'en' || langLower === 'eng') return 'warning';
    if (langLower === 'fr' || langLower === 'fre' || langLower === 'fra') return 'info';
    return 'secondary';
  };

  // Show volume selector if template book has a series
  if (showVolumeSelector && templateBook && templateBook.series) {
    return (
      <VolumeSelector
        show={show}
        onHide={handleClose}
        seriesName={templateBook.series}
        templateBook={templateBook}
        onVolumesSelected={handleVolumesSelected}
      />
    );
  }

  if (showMetadataForm) {
    if (enriching) {
      return (
        <Modal show={show} onHide={handleClose} size="lg" centered style={{ zIndex: 10100 }} className="add-book-dialog">
          <Modal.Body className="text-center py-5">
            <div className="spinner-border text-warning mb-3" role="status" style={{ color: '#fbbf24' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <p>Enriching book metadata...</p>
          </Modal.Body>
        </Modal>
      );
    }
    
    return (
      <BookForm
        book={selectedBook}
        availableBooks={selectedBookGroup}
        defaultTitleStatus={defaultTitleStatus}
        onShowAlert={onShowAlert}
        onSave={async (bookData) => {
          if (onAddStart) onAddStart();
          try {
            // Ensure titleStatus is set if defaultTitleStatus is provided
            const bookDataWithStatus = defaultTitleStatus 
              ? { ...bookData, titleStatus: defaultTitleStatus }
              : bookData;
            const createdBook = await onAddBook(bookDataWithStatus);
            handleBookAdded(createdBook);
            return createdBook;
          } catch (err) {
            // Handle error - show in Bootstrap alert via onAddError
            // IMPORTANT: Call onAddError BEFORE re-throwing so the alert is shown
            if (onAddError) {
              onAddError(err);
            }
            // Re-throw so BookForm knows the save failed
            // BookForm will catch this but won't re-throw for duplicate errors
            throw err;
          }
        }}
        onCancel={handleMetadataFormClose}
      />
    );
  }

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered style={{ zIndex: 10100 }} className="add-book-dialog">
      <Modal.Header closeButton className="add-book-dialog-header">
        <Modal.Title>Add New Book</Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="add-book-dialog-body">
        <div className="search-section mb-3">
          <h6 className="add-book-section-title mb-3">
            <BsSearch className="me-2" />
            Search for Books
          </h6>
          
          {/* Search Mode Tabs */}
          <div className="search-tabs mb-3">
            <button
              type="button"
              className={`search-tab ${searchTab === 'isbn' ? 'active' : ''}`}
              onClick={() => setSearchTab('isbn')}
            >
              ISBN
            </button>
            <button
              type="button"
              className={`search-tab ${searchTab === 'title' ? 'active' : ''}`}
              onClick={() => setSearchTab('title')}
            >
              Title / Author
            </button>
          </div>
          
          {/* ISBN Search Tab */}
          {searchTab === 'isbn' && (
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-10">
                <Form.Control
                  ref={isbnInputRef}
                  type="text"
                  placeholder="ISBN or Amazon URL"
                  value={searchIsbn}
                  onChange={handleIsbnChange}
                  onBlur={handleIsbnBlur}
                  onPaste={handleIsbnPaste}
                  onKeyPress={handleKeyPress}
                  className="search-input"
                  inputMode="numeric"
                />
              </div>
              <div className="col-12 col-md-2">
                <Button 
                  onClick={handleSearch}
                  disabled={searching}
                  className="search-btn w-100"
                >
                  {searching ? (
                    <span className="spinner-border spinner-border-sm" />
                  ) : (
                    <>
                      <BsSearch className="me-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          
          {/* Title/Author Search Tab */}
          {searchTab === 'title' && (
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-3">
                <Form.Control
                  ref={titleInputRef}
                  type="text"
                  placeholder="Title"
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="search-input"
                />
              </div>
              <div className="col-12 col-md-4">
                <Form.Control
                  type="text"
                  placeholder="Author (optional)"
                  value={searchAuthor}
                  onChange={(e) => setSearchAuthor(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="search-input"
                />
              </div>
              <div className="col-12 col-md-3">
                <Form.Select
                  value={searchLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="language-select"
                >
                  <option value="any">Any Language</option>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </Form.Select>
              </div>
              <div className="col-12 col-md-2">
                <Button 
                  onClick={handleSearch}
                  disabled={searching}
                  className="search-btn w-100"
                >
                  {searching ? (
                    <span className="spinner-border spinner-border-sm" />
                  ) : (
                    <>
                      <BsSearch className="me-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Show message when searching */}
          {searching && (
            <div className="text-center mb-3" style={{ color: '#fbbf24' }}>
              <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>
              Searching for books...
            </div>
          )}

          {error && !searching && (
            <Alert variant={groupedResults.length === 0 && searchResults.length === 0 ? "warning" : "danger"} className="mb-3">
              {error}
            </Alert>
          )}

          {/* Grouped Search Results */}
          {!searching && groupedResults.length > 0 && (
            <div className="grouped-search-results">
              <div className="results-header mb-3">
                <h6 className="results-title">
                  Search Results ({searchResults.length} {searchResults.length === 1 ? 'edition' : 'editions'} in {groupedResults.length} {groupedResults.length === 1 ? 'work' : 'works'})
                </h6>
              </div>
              
              {groupedResults.map((group, groupIndex) => {
                const isExpanded = expandedGroups.has(groupIndex);
                const hasMultipleEditions = group.books.length > 1;
                
                return (
                  <div key={groupIndex} className="result-group mb-3">
                    {/* Group Card */}
                    <div 
                      className={`group-header-card ${hasMultipleEditions ? '' : 'single-version'} ${isExpanded ? 'expanded' : ''}`}
                    >
                      {/* Group Header */}
                      <div 
                        className="group-header-content"
                        onClick={hasMultipleEditions ? () => toggleGroup(groupIndex) : undefined}
                        style={{ cursor: hasMultipleEditions ? 'pointer' : 'default' }}
                      >
                        <div className="group-cover">
                          {group.cover ? (
                            <img src={group.cover} alt={group.title} />
                          ) : (
                            <div className="group-cover-placeholder">
                              <BsBook size={32} />
                            </div>
                          )}
                        </div>
                        
                        <div className="group-info">
                          <div className="group-title">{group.title}</div>
                          <div className="group-authors">{group.authors}</div>
                          {hasMultipleEditions && (
                            <div className="group-count">
                              {group.books.length} editions
                            </div>
                          )}
                        </div>
                        
                        {hasMultipleEditions ? (
                          <div className="group-toggle">
                            {isExpanded ? <BsChevronDown size={20} /> : <BsChevronRight size={20} />}
                          </div>
                        ) : (
                          <div className="header-buttons">
                            <Button
                              size="sm"
                              variant="success"
                              className="quick-add-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickAdd(group.books[0]);
                              }}
                              disabled={quickAdding || enriching}
                            >
                              {quickAdding ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                  Adding...
                                </>
                              ) : (
                                <>
                                  <BsPlus className="me-1" />
                                  Quick Add
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              className="select-book-btn-header"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectBook(group.books[0], group.books, 0, groupIndex);
                              }}
                              disabled={enriching || quickAdding}
                            >
                              {enriching && enrichingBookIndex === `group-${groupIndex}-book-0` ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                  Loading...
                                </>
                              ) : (
                                'Edit First'
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Quick add options on separate line for single editions */}
                      {!hasMultipleEditions && (
                        <div className="book-action-buttons">
                          <div className="quick-add-options">
                            <div className="quick-add-field owner-field">
                              <label>Belongs to</label>
                              <div className="owner-autocomplete">
                                <Form.Control
                                  ref={ownerInputRef}
                                  size="sm"
                                  type="text"
                                  value={quickAddOwner}
                                  onChange={(e) => handleOwnerInputChange(e.target.value)}
                                  onFocus={() => {
                                    setFilteredOwners(availableOwners);
                                    setShowOwnerDropdown(availableOwners.length > 0);
                                  }}
                                  onBlur={() => setTimeout(() => setShowOwnerDropdown(false), 150)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Enter owner..."
                                  autoComplete="off"
                                />
                                {showOwnerDropdown && filteredOwners.length > 0 && (
                                  <div className="owner-dropdown">
                                    {filteredOwners.map(owner => (
                                      <div
                                        key={owner}
                                        className="owner-option"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOwnerSelect(owner);
                                        }}
                                      >
                                        {owner}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="quick-add-field">
                              <label>Status</label>
                              <Form.Select
                                size="sm"
                                value={quickAddTitleStatus}
                                onChange={(e) => setQuickAddTitleStatus(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="owned">Owned</option>
                                <option value="borrowed">Borrowed</option>
                              </Form.Select>
                            </div>
                            <div className="quick-add-field">
                              <label>Type</label>
                              <Form.Select
                                size="sm"
                                value={quickAddBookType}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  console.log('[AddBookDialog] User changed bookType to:', newValue);
                                  setQuickAddBookType(newValue);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="book">Book</option>
                                <option value="graphic-novel">Graphic Novel</option>
                                <option value="score">Score</option>
                              </Form.Select>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Editions Table - Show if multiple editions */}
                      {hasMultipleEditions && isExpanded && (
                        <div className="editions-table-container">
                          <Table className="editions-table" hover>
                            <thead>
                              <tr>
                                <th>Cover</th>
                                <th>Source</th>
                                <th>Language</th>
                                <th>Year</th>
                                <th>Publisher</th>
                                <th>ISBN</th>
                                <th>Pages</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.books.map((book, bookIndex) => {
                                // Determine source
                                const source = book.urls?.googleBooks || book.urls?.googleBooksInfo 
                                  ? 'Google Books' 
                                  : book.urls?.openlibrary || book._openLibraryData 
                                    ? 'OpenLibrary' 
                                    : 'Unknown';
                                
                                // Check if this edition has unique characteristics
                                const hasUniqueData = book.publishedYear || book.publisher || book.isbn13 || book.isbn || book.pageCount;
                                
                                return (
                                  <tr key={bookIndex} style={{ opacity: hasUniqueData ? 1 : 0.7 }}>
                                    <td>
                                      {book.coverUrl ? (
                                        <img 
                                          src={book.coverUrl} 
                                          alt={book.title}
                                          className="edition-cover-thumbnail"
                                          title={`Edition ${bookIndex + 1}`}
                                        />
                                      ) : (
                                        <div className="edition-cover-placeholder">
                                          <BsBook size={20} />
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      <small style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{source}</small>
                                    </td>
                                    <td>
                                      <Badge bg={getLanguageBadgeVariant(book.language)}>
                                        {getLanguageDisplay(book.language)}
                                      </Badge>
                                    </td>
                                    <td>{book.publishedYear || '-'}</td>
                                    <td className="text-truncate" style={{ maxWidth: '150px' }} title={book.publisher || ''}>
                                      {book.publisher || '-'}
                                    </td>
                                    <td className="text-truncate" style={{ maxWidth: '120px' }} title={book.isbn13 || book.isbn || ''}>
                                      {book.isbn13 || book.isbn || '-'}
                                    </td>
                                    <td>{book.pageCount || '-'}</td>
                                    <td>
                                      <Button
                                        size="sm"
                                        variant="outline-warning"
                                        className="select-book-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectBook(book, group.books, bookIndex, groupIndex);
                                        }}
                                        disabled={enriching}
                                      >
                                        {enriching && enrichingBookIndex === `group-${groupIndex}-book-${bookIndex}` ? (
                                          <>
                                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                            Loading...
                                          </>
                                        ) : (
                                          'Select'
                                        )}
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

            {/* Manual Entry Option */}
            {!searching && searchResults.length === 0 && (searchIsbn || searchTitle || searchAuthor) && (
              <div className="manual-entry-section">
                <p className="text-muted">Can't find what you're looking for?</p>
                <Button 
                  variant="outline-warning" 
                  onClick={handleManualEntry}
                  className="manual-entry-btn"
                >
                  <BsPlus className="me-1" />
                  Enter Book Manually
                </Button>
              </div>
            )}
          </div>
        </Modal.Body>
        
        <Modal.Footer className="add-book-dialog-footer">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
          <Button 
            variant="outline-warning" 
            onClick={handleManualEntry}
            className="manual-entry-btn"
          >
            <BsPlus className="me-1" />
            Enter Manually
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

export default AddBookDialog;
