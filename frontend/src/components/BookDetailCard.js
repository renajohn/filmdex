import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Row, Col, Badge, Form, Alert } from 'react-bootstrap';
import { BsPencil, BsTrash, BsBook, BsCalendar, BsTag, BsTranslate, BsFileEarmark, BsStar, BsPerson, BsHouse, BsChatSquareText, BsPlus, BsX, BsCheck, BsArrowLeft, BsDownload, BsFiles, BsChevronDown, BsChevronUp, BsCamera } from 'react-icons/bs';
import bookService from '../services/bookService';
import bookCommentService from '../services/bookCommentService';
import CoverModal from './CoverModal';
import BookForm from './BookForm';
import StarRatingInput from './StarRatingInput';
import InlineCoverSelector from './InlineCoverSelector';
import './BookDetailCard.css';
import './VolumeSelector.css';

// Format ISBN for display with dashes
const formatIsbnDisplay = (isbn) => {
  if (!isbn) return '';
  
  // Remove all non-digit characters
  const digitsOnly = isbn.toString().replace(/\D/g, '');
  
  // If it's an ISBN-13 starting with 978 or 979, format as prefix-X-XXX-XXXXX-X
  if (digitsOnly.length === 13 && (digitsOnly.startsWith('978') || digitsOnly.startsWith('979'))) {
    return `${digitsOnly.substring(0, 3)}-${digitsOnly.substring(3, 4)}-${digitsOnly.substring(4, 7)}-${digitsOnly.substring(7, 12)}-${digitsOnly.substring(12, 13)}`;
  }
  
  // If it's an ISBN-13 not starting with 978 or 979, format as XXX-X-XXX-XXXXX-X
  if (digitsOnly.length === 13) {
    return `${digitsOnly.substring(0, 3)}-${digitsOnly.substring(3, 4)}-${digitsOnly.substring(4, 7)}-${digitsOnly.substring(7, 12)}-${digitsOnly.substring(12, 13)}`;
  }
  
  // If it's an ISBN-10, format as X-XXX-XXXXX-X
  if (digitsOnly.length === 10) {
    return `${digitsOnly.substring(0, 1)}-${digitsOnly.substring(1, 4)}-${digitsOnly.substring(4, 9)}-${digitsOnly.substring(9, 10)}`;
  }
  
  // For other cases, return as-is
  return isbn;
};

// Series Book Item Component (similar to SortableCollectionMember but without drag-and-drop)
const SeriesBookItem = ({ bookItem, onBookClick, getCoverUrl, currentBookId }) => {
  return (
    <div 
      className={`series-book-item ${bookItem.id === currentBookId ? 'current' : ''}`}
      onClick={() => onBookClick(bookItem.id)}
    >
      <div className="series-book-container">
        {bookItem.cover ? (
          <>
            <img 
              src={getCoverUrl(bookItem.cover)} 
              alt={bookItem.title}
              className="series-book-image"
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextSibling) {
                  e.target.nextSibling.style.display = 'flex';
                }
              }}
            />
            <div className="series-book-placeholder" style={{ display: 'none' }}>
              <BsBook size={32} />
            </div>
          </>
        ) : (
          <div className="series-book-placeholder">
            <BsBook size={32} />
          </div>
        )}
        <div className="series-book-overlay">
          <div className="series-book-title">{bookItem.title}</div>
          {bookItem.seriesNumber && (
            <div className="series-book-number">#{bookItem.seriesNumber}</div>
          )}
        </div>
      </div>
    </div>
  );
};

const BookDetailCard = ({ book, onClose, onEdit, onUpdateBook, onBookUpdated, onDelete, onSearch, onAddNextVolume, onAddBooksBatch, onAddStart, onBookAdded, onAddError, onBookClick }) => {
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverModalData, setCoverModalData] = useState({ coverUrl: '', title: '', author: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteEbook, setConfirmDeleteEbook] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [commentFormData, setCommentFormData] = useState({ name: '', comment: '' });
  const [commentErrors, setCommentErrors] = useState({});
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [highlightedNameIndex, setHighlightedNameIndex] = useState(-1);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const nameInputRef = React.useRef(null);
  const nameDropdownRef = React.useRef(null);
  const deleteBtnRef = React.useRef(null);
  const editFormRef = React.useRef(null);
  
  // View state: 'detail', 'volumes', or 'edit'
  const [view, setView] = useState('detail');
  const [volumes, setVolumes] = useState([]);
  const [loadingVolumes, setLoadingVolumes] = useState(false);
  const [volumeError, setVolumeError] = useState('');
  const [selectedVolumes, setSelectedVolumes] = useState(new Set());
  const [enrichingVolumes, setEnrichingVolumes] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });
  const [existingBooks, setExistingBooks] = useState(new Map());
  const [copyOwnerInfo, setCopyOwnerInfo] = useState(true);
  const [updatingBook, setUpdatingBook] = useState(false);
  const scrollPositionRef = useRef(0);
  const [seriesMembers, setSeriesMembers] = useState([]);
  const [loadingSeriesMembers, setLoadingSeriesMembers] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  
  // Inline editing state
  const [localBookData, setLocalBookData] = useState(book);
  const [showCoverSelector, setShowCoverSelector] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [ownerValue, setOwnerValue] = useState('');
  const [ownerSuggestions, setOwnerSuggestions] = useState([]);
  const [showOwnerSuggestions, setShowOwnerSuggestions] = useState(false);
  const [highlightedOwnerIndex, setHighlightedOwnerIndex] = useState(-1);
  const [editingSeries, setEditingSeries] = useState(false);
  const [seriesValue, setSeriesValue] = useState('');
  const [seriesNumberValue, setSeriesNumberValue] = useState('');
  const [seriesSuggestions, setSeriesSuggestions] = useState([]);
  const [showSeriesSuggestions, setShowSeriesSuggestions] = useState(false);
  const [highlightedSeriesIndex, setHighlightedSeriesIndex] = useState(-1);
  const [savingBookType, setSavingBookType] = useState(false);
  const coverRef = useRef(null);
  const ownerInputRef = useRef(null);
  const seriesInputRef = useRef(null);

  useEffect(() => {
    if (book && book.id) {
      loadComments();
    }
  }, [book?.id]);

  // Sync local book data when book prop changes
  useEffect(() => {
    setLocalBookData(book);
  }, [book]);

  // Force re-render when book cover changes (e.g., after upload)
  useEffect(() => {
    // This effect ensures the component re-renders when book.cover changes
    // The key on the img element will force it to reload the image
  }, [book?.cover]);

  useEffect(() => {
    if (view === 'volumes' && book?.series) {
      loadVolumes();
    }
  }, [view, book?.series]);

  useEffect(() => {
    console.log('BookDetailCard: book prop changed, ebookFile:', book?.ebookFile, 'view:', view, 'full book:', book);
  }, [book, view]);

  const [ebookInfo, setEbookInfo] = useState(null);
  const [loadingEbookInfo, setLoadingEbookInfo] = useState(false);

  useEffect(() => {
    const loadEbookInfo = async () => {
      console.log('loadEbookInfo - book?.ebookFile:', book?.ebookFile, 'view:', view, 'book?.id:', book?.id);
      if (book?.ebookFile && book.ebookFile.trim() && view === 'detail') {
        setLoadingEbookInfo(true);
        try {
          const info = await bookService.getEbookInfo(book.id);
          console.log('Ebook info loaded:', info);
          setEbookInfo(info);
        } catch (error) {
          console.error('Failed to load ebook info:', error);
          setEbookInfo(null);
        } finally {
          setLoadingEbookInfo(false);
        }
      } else {
        setEbookInfo(null);
      }
    };
    loadEbookInfo();
  }, [book?.ebookFile, book?.id, view]);

  // Load series members when book has a series
  useEffect(() => {
    const loadSeriesMembers = async () => {
      if (!book?.series || !book?.id || view !== 'detail') {
        setSeriesMembers([]);
        return;
      }

      setLoadingSeriesMembers(true);
      try {
        const books = await bookService.getBooksBySeries(book.series);
        // Filter out the current book and only show owned/borrowed books
        const members = books.filter(b => b.id !== book.id);
        setSeriesMembers(members);
      } catch (error) {
        console.error('Error loading series members:', error);
        setSeriesMembers([]);
      } finally {
        setLoadingSeriesMembers(false);
      }
    };

    loadSeriesMembers();
  }, [book?.series, book?.id, view]);

  const loadComments = async () => {
    if (!book?.id) return;
    setLoadingComments(true);
    try {
      const fetchedComments = await bookCommentService.getCommentsByBookId(book.id);
      setComments(fetchedComments || []);
    } catch (error) {
      console.error('Error loading comments:', error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (e) {
      return dateString;
    }
  };

  // Use local data for display (allows immediate UI updates)
  const currentBook = localBookData || book;

  // Description truncation - show ~5 lines worth of text
  const DESCRIPTION_CHAR_LIMIT = 350;
  const getDescription = () => currentBook?.description || '';
  const isDescriptionLong = getDescription().length > DESCRIPTION_CHAR_LIMIT;
  
  const getDisplayDescription = () => {
    const desc = getDescription();
    if (!desc) return '';
    if (!isDescriptionLong || descriptionExpanded) return desc;
    // Truncate at the last complete word before the limit
    const truncated = desc.substring(0, DESCRIPTION_CHAR_LIMIT);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace > 200 ? lastSpace : DESCRIPTION_CHAR_LIMIT) + '...';
  };

  // Handle rating change with immediate UI update
  const handleRatingChange = async (newRating) => {
    if (!currentBook?.id) return;
    
    // Optimistic update - update UI immediately
    setLocalBookData(prev => ({
      ...prev,
      rating: newRating
    }));
    
    try {
      // Send full book data to avoid NOT NULL constraint issues
      await bookService.updateBook(currentBook.id, { 
        ...currentBook,
        rating: newRating 
      });
      
      // Notify parent of update
      if (onBookUpdated) {
        onBookUpdated({ ...currentBook, rating: newRating });
      }
    } catch (error) {
      console.error('Error updating rating:', error);
      // Rollback on error
      setLocalBookData(prev => ({
        ...prev,
        rating: book.rating
      }));
    }
  };

  // Handle cover change button click to show selector
  const handleCoverChangeClick = (e) => {
    e.stopPropagation();
    setShowCoverSelector(prev => !prev);
  };

  // Handle cover selection
  const handleCoverSelected = (newCover) => {
    // Update local state immediately
    setLocalBookData(prev => ({
      ...prev,
      cover: newCover
    }));
    
    setShowCoverSelector(false);
    
    // Notify parent of update
    if (onBookUpdated) {
      onBookUpdated({ ...currentBook, cover: newCover });
    }
  };

  // Owner editing handlers
  const startEditingOwner = () => {
    setOwnerValue(currentBook.owner || '');
    setEditingOwner(true);
    setHighlightedOwnerIndex(-1);
    loadOwnerSuggestions('');
  };

  const loadOwnerSuggestions = async (query) => {
    try {
      const suggestions = await bookService.getAutocompleteSuggestions('owner', query);
      // API returns { owner: 'Name' } format - extract the owner value
      const stringValues = (suggestions || []).map(s => s?.owner || '').filter(Boolean);
      setOwnerSuggestions(stringValues);
      setShowOwnerSuggestions(stringValues.length > 0);
    } catch (error) {
      console.error('Error loading owner suggestions:', error);
      setOwnerSuggestions([]);
      setShowOwnerSuggestions(false);
    }
  };

  const handleOwnerChange = (value) => {
    setOwnerValue(value);
    setHighlightedOwnerIndex(-1);
    loadOwnerSuggestions(value);
  };

  const handleOwnerSuggestionClick = (value) => {
    setOwnerValue(value);
    setShowOwnerSuggestions(false);
    setHighlightedOwnerIndex(-1);
  };

  const handleOwnerKeyDown = (e) => {
    if (!showOwnerSuggestions || ownerSuggestions.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); saveOwner(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEditingOwner(); }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedOwnerIndex(prev => prev < ownerSuggestions.length - 1 ? prev + 1 : prev);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedOwnerIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedOwnerIndex >= 0 && highlightedOwnerIndex < ownerSuggestions.length) {
        handleOwnerSuggestionClick(ownerSuggestions[highlightedOwnerIndex]);
      } else {
        saveOwner();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (showOwnerSuggestions) {
        setShowOwnerSuggestions(false);
      } else {
        cancelEditingOwner();
      }
    }
  };

  const saveOwner = async () => {
    if (!currentBook?.id) return;
    
    const newOwner = ownerValue || null;
    setLocalBookData(prev => ({ ...prev, owner: newOwner }));
    setEditingOwner(false);
    
    try {
      // Send full book data to avoid NOT NULL constraint issues
      await bookService.updateBook(currentBook.id, { 
        ...currentBook,
        owner: newOwner 
      });
      if (onBookUpdated) {
        onBookUpdated({ ...currentBook, owner: newOwner });
      }
    } catch (error) {
      console.error('Error updating owner:', error);
      setLocalBookData(prev => ({ ...prev, owner: book.owner }));
    }
  };

  const cancelEditingOwner = () => {
    setEditingOwner(false);
    setOwnerValue('');
    setOwnerSuggestions([]);
    setShowOwnerSuggestions(false);
    setHighlightedOwnerIndex(-1);
  };

  // Book type change handler - saves immediately on dropdown change
  const handleBookTypeChange = async (newBookType) => {
    if (savingBookType || newBookType === currentBook.bookType) return;
    
    setSavingBookType(true);
    const previousBookType = currentBook.bookType;
    
    // Optimistic update
    setLocalBookData(prev => ({ ...prev, bookType: newBookType }));
    
    try {
      await bookService.updateBook(currentBook.id, { 
        ...currentBook,
        bookType: newBookType 
      });
      if (onBookUpdated) {
        onBookUpdated({ ...currentBook, bookType: newBookType });
      }
    } catch (error) {
      console.error('Error updating book type:', error);
      // Rollback on error
      setLocalBookData(prev => ({ ...prev, bookType: previousBookType }));
    } finally {
      setSavingBookType(false);
    }
  };

  // Series editing handlers
  const startEditingSeries = () => {
    setSeriesValue(currentBook.series || '');
    setSeriesNumberValue(currentBook.seriesNumber?.toString() || '');
    setEditingSeries(true);
    setHighlightedSeriesIndex(-1);
    loadSeriesSuggestions('');
  };

  const loadSeriesSuggestions = async (query) => {
    try {
      const suggestions = await bookService.getAutocompleteSuggestions('series', query);
      // API returns { series: 'Name' } format - extract the series value
      const stringValues = (suggestions || []).map(s => s?.series || '').filter(Boolean);
      setSeriesSuggestions(stringValues);
      setShowSeriesSuggestions(stringValues.length > 0);
    } catch (error) {
      console.error('Error loading series suggestions:', error);
      setSeriesSuggestions([]);
      setShowSeriesSuggestions(false);
    }
  };

  const handleSeriesChange = (value) => {
    setSeriesValue(value);
    setHighlightedSeriesIndex(-1);
    loadSeriesSuggestions(value);
  };

  const handleSeriesSuggestionClick = (value) => {
    setSeriesValue(value);
    setShowSeriesSuggestions(false);
    setHighlightedSeriesIndex(-1);
  };

  const handleSeriesKeyDown = (e) => {
    if (!showSeriesSuggestions || seriesSuggestions.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); saveSeries(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEditingSeries(); }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedSeriesIndex(prev => prev < seriesSuggestions.length - 1 ? prev + 1 : prev);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedSeriesIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedSeriesIndex >= 0 && highlightedSeriesIndex < seriesSuggestions.length) {
        handleSeriesSuggestionClick(seriesSuggestions[highlightedSeriesIndex]);
      } else {
        saveSeries();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (showSeriesSuggestions) {
        setShowSeriesSuggestions(false);
      } else {
        cancelEditingSeries();
      }
    }
  };

  const saveSeries = async () => {
    if (!currentBook?.id) return;
    
    const newSeries = seriesValue || null;
    const seriesNum = seriesNumberValue ? parseFloat(seriesNumberValue) : null;
    
    setLocalBookData(prev => ({ 
      ...prev, 
      series: newSeries,
      seriesNumber: seriesNum
    }));
    setEditingSeries(false);
    
    try {
      // Send full book data to avoid NOT NULL constraint issues
      await bookService.updateBook(currentBook.id, { 
        ...currentBook,
        series: newSeries,
        seriesNumber: seriesNum
      });
      if (onBookUpdated) {
        onBookUpdated({ ...currentBook, series: newSeries, seriesNumber: seriesNum });
      }
    } catch (error) {
      console.error('Error updating series:', error);
      setLocalBookData(prev => ({ ...prev, series: book.series, seriesNumber: book.seriesNumber }));
    }
  };

  const cancelEditingSeries = () => {
    setEditingSeries(false);
    setSeriesValue('');
    setSeriesNumberValue('');
    setSeriesSuggestions([]);
    setShowSeriesSuggestions(false);
    setHighlightedSeriesIndex(-1);
  };

  const handleCopyRef = async (e) => {
    e.stopPropagation();
    if (!book) return;
    try {
      // Format: <Title> <subtitle> - <Author>
      const title = book.title || '';
      const subtitle = book.subtitle ? ` ${book.subtitle}` : '';
      const author = getAuthorDisplay();
      const titleLine = `${title}${subtitle} - ${author}`;
      
      // Get link: prefer openlibrary, otherwise use first available link
      let link = '';
      if (book.urls) {
        if (book.urls.openlibrary) {
          link = book.urls.openlibrary;
        } else {
          // Get first available link
          const linkKeys = Object.keys(book.urls);
          if (linkKeys.length > 0) {
            link = book.urls[linkKeys[0]];
          }
        }
      }
      
      // Combine title and link
      const textToCopy = link ? `${titleLine}\n\n${link}` : titleLine;
      
      // Copy to clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error('Failed to copy reference:', error);
    }
  };

  const fetchNameSuggestions = async (query = '') => {
    try {
      const searchQuery = query ? query.trim() : '';
      const suggestions = await bookCommentService.getCommentNameSuggestions(searchQuery);
      
      // Extract name values from suggestions
      let names = suggestions
        .map(item => {
          const nameValue = item.name || item;
          return nameValue;
        })
        .filter(name => name && typeof name === 'string' && name.trim())
        .filter((name, index, self) => self.indexOf(name) === index); // Remove duplicates

      // If there's a query, prioritize starts-with matches, then contains matches
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        names.sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aStartsWith = aLower.startsWith(queryLower);
          const bStartsWith = bLower.startsWith(queryLower);
          
          // Prioritize starts-with matches
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          
          // If both start with query or neither does, sort alphabetically
          return aLower.localeCompare(bLower);
        });
      } else {
        // Sort alphabetically when showing all names
        names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      }

      setNameSuggestions(names);
      setShowNameSuggestions(names.length > 0);
    } catch (error) {
      console.error('Error fetching name suggestions:', error);
      setNameSuggestions([]);
      setShowNameSuggestions(false);
    }
  };

  const handleCommentInputChange = (field, value) => {
    setCommentFormData(prev => ({ ...prev, [field]: value }));
    if (commentErrors[field]) {
      setCommentErrors(prev => ({ ...prev, [field]: null }));
    }

    // Fetch name suggestions when typing in name field
    if (field === 'name') {
      fetchNameSuggestions(value);
    }
  };

  const handleNameSuggestionClick = (name) => {
    setCommentFormData(prev => ({ ...prev, name }));
    setShowNameSuggestions(false);
    setHighlightedNameIndex(-1);
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  };

  const handleNameKeyDown = (e) => {
    if (!showNameSuggestions || nameSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedNameIndex(prev =>
        prev < nameSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedNameIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedNameIndex >= 0 && highlightedNameIndex < nameSuggestions.length) {
        handleNameSuggestionClick(nameSuggestions[highlightedNameIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowNameSuggestions(false);
      setHighlightedNameIndex(-1);
    }
  };

  const handleNameBlur = (e) => {
    // Delay hiding suggestions to allow click events
    setTimeout(() => {
      if (!nameDropdownRef.current?.contains(document.activeElement)) {
        setShowNameSuggestions(false);
        setHighlightedNameIndex(-1);
      }
    }, 200);
  };

  const handleNameFocus = async () => {
    // Only show suggestions if there's already text in the field
    if (commentFormData.name && commentFormData.name.trim()) {
      await fetchNameSuggestions(commentFormData.name);
    }
  };

  const validateCommentForm = () => {
    const newErrors = {};
    if (!commentFormData.name || !commentFormData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!commentFormData.comment || !commentFormData.comment.trim()) {
      newErrors.comment = 'Review is required';
    }
    setCommentErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveComment = async () => {
    if (!validateCommentForm()) return;

    setLoadingComments(true);
    try {
      const commentData = {
        bookId: book.id,
        name: commentFormData.name.trim(),
        comment: commentFormData.comment.trim()
        // Date will be automatically set by the backend
      };

      if (editingComment) {
        // When editing, preserve the original date (don't send date field)
        await bookCommentService.updateComment(editingComment.id, commentData);
      } else {
        // When creating, backend will set date automatically
        await bookCommentService.createComment(commentData);
      }

      await loadComments();
      handleCloseCommentModal();
    } catch (error) {
      console.error('Error saving review:', error);
      setCommentErrors({ submit: error.message || 'Failed to save review' });
    } finally {
      setLoadingComments(false);
    }
  };

  const handleEditComment = async (comment) => {
    setEditingComment(comment);
    setCommentFormData({
      name: comment.name,
      comment: comment.comment
      // Date is not editable, so we don't include it in formData
    });
    setShowCommentModal(true);
    setCommentErrors({});
    // Don't show suggestions by default - only when user starts typing
    setNameSuggestions([]);
    setShowNameSuggestions(false);
    setDeletingCommentId(null); // Reset delete state when opening edit modal
  };

  const handleDeleteComment = async (id) => {
    // If this comment is already pending deletion, confirm and delete
    if (deletingCommentId === id) {
      setLoadingComments(true);
      try {
        await bookCommentService.deleteComment(id);
        await loadComments();
        setDeletingCommentId(null);
      } catch (error) {
        console.error('Error deleting review:', error);
        alert('Failed to delete review');
        setDeletingCommentId(null);
      } finally {
        setLoadingComments(false);
      }
    } else {
      // First click: set as pending deletion
      setDeletingCommentId(id);
    }
  };

  const handleCancelDelete = () => {
    setDeletingCommentId(null);
  };

  const handleAddComment = async () => {
    setEditingComment(null);
    setCommentFormData({ 
      name: '', 
      comment: ''
      // Date will be automatically set by backend
    });
    setShowCommentModal(true);
    setCommentErrors({});
    // Don't fetch suggestions automatically - only when user starts typing
    setNameSuggestions([]);
    setShowNameSuggestions(false);
    setDeletingCommentId(null); // Reset delete state when opening modal
  };

  const handleCloseCommentModal = () => {
    setShowCommentModal(false);
    setEditingComment(null);
    setCommentFormData({ name: '', comment: '' });
    setCommentErrors({});
    setShowNameSuggestions(false);
    setHighlightedNameIndex(-1);
    setNameSuggestions([]);
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
  };

  const getAuthorDisplay = () => {
    const bookData = currentBook || book;
    if (Array.isArray(bookData.authors)) {
      return bookData.authors.join(', ');
    }
    return bookData.authors || 'Unknown Author';
  };

  const getArtistDisplay = () => {
    const bookData = currentBook || book;
    if (Array.isArray(bookData.artists)) {
      return bookData.artists.join(', ');
    }
    return bookData.artists || null;
  };

  const getCoverImage = () => {
    const bookData = currentBook || book;
    return bookService.getImageUrl(bookData.cover);
  };

  const getCoverUrl = (coverPath) => {
    return bookService.getImageUrl(coverPath);
  };

  const handleBookClick = (bookId) => {
    if (onBookClick) {
      onBookClick(bookId);
    }
  };

  // Get book type display name
  const getBookTypeDisplayName = (bookType) => {
    const typeMap = {
      'book': 'book',
      'graphic-novel': 'graphic novel',
      'score': 'score'
    };
    return typeMap[bookType] || 'book';
  };

  // Get language display name
  const getLanguageDisplayName = (language) => {
    if (!language) return null;
    const langMap = {
      'fr': 'French',
      'en': 'English',
      'de': 'German',
      'es': 'Spanish',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'zh': 'Chinese',
      'ko': 'Korean'
    };
    return langMap[language.toLowerCase()] || language.toUpperCase();
  };

  // Render metadata with inline book type dropdown
  // Format: "96-page French graphic novel." or "96-page French graphic novel (e-book)."
  const renderBookMetadata = () => {
    const bookData = currentBook || book;
    const pages = bookData.pageCount || null;
    const langName = getLanguageDisplayName(bookData.language);
    const format = bookData.format || 'physical';
    const bookType = bookData.bookType || 'book';
    const isNonPhysical = format === 'ebook' || format === 'audiobook';
    
    // Build prefix: "96-page French " or "French " or "96-page " or ""
    let prefix = '';
    if (pages) {
      prefix = `${pages}-page `;
    }
    if (langName) {
      prefix += `${langName} `;
    }
    
    // Capitalize first letter of prefix if present
    if (prefix) {
      prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    // Format suffix for non-physical formats
    const formatSuffix = isNonPhysical 
      ? ` (${format === 'ebook' ? 'e-book' : 'audiobook'})`
      : '';

    // Determine if we need to capitalize the dropdown options (when there's no prefix)
    const capitalizeOptions = !prefix;
    
    // Get display text for current selection to size the select
    const getDisplayText = (type) => {
      const texts = {
        'book': capitalizeOptions ? 'Book' : 'book',
        'graphic-novel': capitalizeOptions ? 'Graphic novel' : 'graphic novel',
        'score': capitalizeOptions ? 'Score' : 'score'
      };
      return texts[type] || texts['book'];
    };
    
    // Calculate width to exactly fit the text
    const selectWidth = `calc(${getDisplayText(bookType).length}ch + 2px)`;
    
    return (
      <span className="metadata-with-type">
        {prefix}
        <select
          className="inline-book-type-select"
          value={bookType}
          onChange={(e) => handleBookTypeChange(e.target.value)}
          disabled={savingBookType}
          onClick={(e) => e.stopPropagation()}
          style={{ width: selectWidth }}
        >
          <option value="book">{capitalizeOptions ? 'Book' : 'book'}</option>
          <option value="graphic-novel">{capitalizeOptions ? 'Graphic novel' : 'graphic novel'}</option>
          <option value="score">{capitalizeOptions ? 'Score' : 'score'}</option>
        </select>
        {formatSuffix}.
      </span>
    );
  };

  // Legacy function for compatibility - returns string only
  const formatBookMetadata = () => {
    const bookData = currentBook || book;
    const pages = bookData.pageCount || null;
    const langName = getLanguageDisplayName(bookData.language);
    const bookType = getBookTypeDisplayName(bookData.bookType || 'book');
    const format = bookData.format || 'physical';
    const isNonPhysical = format === 'ebook' || format === 'audiobook';
    
    let sentence = '';
    if (pages) {
      sentence = `${pages}-page `;
    }
    if (langName) {
      sentence += `${langName} `;
    }
    sentence += bookType;
    
    if (isNonPhysical) {
      sentence += ` (${format === 'ebook' ? 'e-book' : 'audiobook'})`;
    }
    
    return sentence ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : '';
  };

  const handleSearch = (searchType, value) => {
    if (onSearch) {
      let predicate = '';
      if (searchType === 'author') {
        predicate = `author:"${value}"`;
      } else if (searchType === 'artist') {
        predicate = `artist:"${value}"`;
      } else if (searchType === 'genre') {
        predicate = `genre:"${value}"`;
      } else if (searchType === 'series') {
        predicate = `series:"${value}"`;
      } else if (searchType === 'owner') {
        predicate = `owner:"${value}"`;
      } else {
        predicate = value;
      }
      onSearch(predicate);
      onClose();
    }
  };

  const handleCoverClick = (coverUrl, coverType = 'Cover') => {
    if (coverUrl) {
      setCoverModalData({
        coverUrl: coverUrl,
        title: book.title,
        author: getAuthorDisplay(),
        coverType: coverType
      });
      setShowCoverModal(true);
    }
  };

  const handleCloseCoverModal = () => {
    setShowCoverModal(false);
  };

  // Volume selection functions
  const loadVolumes = async () => {
    if (!book?.series) return;
    
    setLoadingVolumes(true);
    setVolumeError('');
    setSelectedVolumes(new Set());
    
    try {
      const language = book?.language || 'any';
      const normalizedLanguage = language === 'fre' || language === 'fra' ? 'fr' :
                                 language === 'eng' ? 'en' :
                                 language === 'ger' ? 'de' :
                                 language === 'spa' ? 'es' :
                                 language === 'ita' ? 'it' :
                                 language;
      
      const [results, existing] = await Promise.all([
        bookService.searchSeriesVolumes(book.series, { maxVolumes: 50, language: normalizedLanguage }),
        bookService.getBooksBySeries(book.series).catch(() => [])
      ]);
      
      const existingMap = new Map();
      existing.forEach(b => {
        if (b.seriesNumber != null) {
          existingMap.set(b.seriesNumber, b);
        }
      });
      setExistingBooks(existingMap);
      
      setVolumes(results);
      
      if (book && book.seriesNumber) {
        const nextVolumeNumber = book.seriesNumber + 1;
        const toSelect = results
          .filter(v => {
            if (v.seriesNumber < nextVolumeNumber) return false;
            const existingBook = existingMap.get(v.seriesNumber);
            return !existingBook || existingBook.titleStatus === 'borrowed';
          })
          .map(v => v.seriesNumber);
        setSelectedVolumes(new Set(toSelect));
      }
    } catch (err) {
      setVolumeError('Failed to load volumes: ' + err.message);
    } finally {
      setLoadingVolumes(false);
    }
  };

  const toggleVolume = (seriesNumber) => {
    const existingBook = existingBooks.get(seriesNumber);
    if (existingBook && existingBook.titleStatus !== 'borrowed') {
      return;
    }
    
    const newSelected = new Set(selectedVolumes);
    if (newSelected.has(seriesNumber)) {
      newSelected.delete(seriesNumber);
    } else {
      newSelected.add(seriesNumber);
    }
    setSelectedVolumes(newSelected);
  };

  const selectAllVolumes = () => {
    const allNumbers = volumes
      .filter(v => {
        const existingBook = existingBooks.get(v.seriesNumber);
        return !existingBook || existingBook.borrowed;
      })
      .map(v => v.seriesNumber)
      .filter(n => n != null);
    setSelectedVolumes(new Set(allNumbers));
  };

  const deselectAllVolumes = () => {
    setSelectedVolumes(new Set());
  };

  const handleAddSelectedVolumes = async () => {
    if (selectedVolumes.size === 0) {
      setVolumeError('Please select at least one volume');
      return;
    }

    setEnrichingVolumes(true);
    setVolumeError('');
    
    try {
      const volumesToAdd = volumes.filter(v => {
        if (!selectedVolumes.has(v.seriesNumber)) return false;
        const existingBook = existingBooks.get(v.seriesNumber);
        return !existingBook || existingBook.borrowed;
      });
      setEnrichmentProgress({ current: 0, total: volumesToAdd.length });

      // Enrich volumes in parallel with concurrency limit
      const BATCH_SIZE = 5; // Process 5 volumes at a time
      const enrichedVolumes = [];
      
      for (let i = 0; i < volumesToAdd.length; i += BATCH_SIZE) {
        const batch = volumesToAdd.slice(i, i + BATCH_SIZE);
        setEnrichmentProgress({ current: i, total: volumesToAdd.length });
        
        const batchResults = await Promise.allSettled(
          batch.map(async (volume) => {
            try {
              const enriched = await bookService.enrichBook(volume);
              
              if (copyOwnerInfo && book) {
                if (book.owner !== undefined) {
                  enriched.owner = book.owner || null;
                }
                if (book.readDate) {
                  enriched.readDate = book.readDate;
                }
              }
              
              return { success: true, data: enriched };
            } catch (err) {
              console.warn(`Failed to enrich volume ${volume.seriesNumber}:`, err);
              const volumeWithOwner = { ...volume };
              if (copyOwnerInfo && book) {
                if (book.owner !== undefined) {
                  volumeWithOwner.owner = book.owner || null;
                }
                if (book.borrowed !== undefined) {
                  volumeWithOwner.borrowed = book.borrowed;
                }
                if (book.borrowedDate) {
                  volumeWithOwner.borrowedDate = book.borrowedDate;
                }
                if (book.returnedDate) {
                  volumeWithOwner.returnedDate = book.returnedDate;
                }
                if (book.borrowedNotes) {
                  volumeWithOwner.borrowedNotes = book.borrowedNotes;
                }
              }
              return { success: false, data: volumeWithOwner };
            }
          })
        );
        
        // Process batch results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            enrichedVolumes.push(result.value.data);
          } else {
            // If the promise itself was rejected, use the original volume
            const volumeIndex = enrichedVolumes.length;
            if (volumeIndex < volumesToAdd.length) {
              const volumeWithOwner = { ...volumesToAdd[volumeIndex] };
              if (copyOwnerInfo && book) {
                if (book.owner !== undefined) {
                  volumeWithOwner.owner = book.owner || null;
                }
              }
              enrichedVolumes.push(volumeWithOwner);
            }
          }
        });
        
        setEnrichmentProgress({ current: Math.min(i + BATCH_SIZE, volumesToAdd.length), total: volumesToAdd.length });
      }

      if (onAddBooksBatch) {
        if (onAddStart) onAddStart();
        try {
          await onAddBooksBatch(enrichedVolumes);
          if (onBookAdded) {
            onBookAdded(enrichedVolumes[enrichedVolumes.length - 1]);
          }
          // Return to detail view after successful import
          setView('detail');
        } catch (err) {
          if (onAddError) onAddError(err);
          throw err;
        }
      }
    } catch (err) {
      setVolumeError('Failed to process volumes: ' + err.message);
    } finally {
      setEnrichingVolumes(false);
      setEnrichmentProgress({ current: 0, total: 0 });
    }
  };

  const getVolumeCoverImage = (volume) => {
    if (volume.coverUrl) return volume.coverUrl;
    if (volume.cover) return bookService.getImageUrl(volume.cover);
    return null;
  };

  const handleShowVolumes = () => {
    setView('volumes');
  };

  const handleShowEdit = () => {
    setView('edit');
  };

  const handleBackToDetail = () => {
    setView('detail');
  };

  const handleEditSave = async (bookData) => {
    setUpdatingBook(true);
    try {
      if (onUpdateBook) {
        // Use onUpdateBook if provided (preferred for inline editing)
        await onUpdateBook(book.id, bookData);
        // Refresh the book data after successful update
        if (onBookUpdated) {
          await onBookUpdated(book.id);
        }
      } else if (onEdit && typeof onEdit === 'function') {
        // Fallback to onEdit if it accepts 2 parameters (id, data)
        if (onEdit.length === 2) {
          await onEdit(book.id, bookData);
          // Refresh the book data after successful update
          if (onBookUpdated) {
            await onBookUpdated(book.id);
          }
        }
      }
      setView('detail');
    } catch (error) {
      console.error('Error saving book:', error);
      // Don't close the edit view on error - let user fix and retry
      throw error; // Re-throw so BookForm can handle it
    } finally {
      setUpdatingBook(false);
    }
  };

  const handleEditCancel = () => {
    setView('detail');
  };

  const handleClose = () => {
    setConfirmDelete(false);
    onClose();
  };

  React.useEffect(() => {
    if (!confirmDelete) return;
    const handleDocClick = (e) => {
      if (deleteBtnRef.current && !deleteBtnRef.current.contains(e.target)) {
        setConfirmDelete(false);
      }
    };
    document.addEventListener('click', handleDocClick, true);
    return () => document.removeEventListener('click', handleDocClick, true);
  }, [confirmDelete]);

  // Prevent body scroll when modal is open, but preserve scroll position
  useEffect(() => {
    if (book) {
      // Save current scroll position before locking
      // First try to get from sessionStorage (saved before modal opens), otherwise use current position
      const savedScroll = sessionStorage.getItem('bookDetailScrollPosition');
      scrollPositionRef.current = savedScroll ? parseInt(savedScroll, 10) : (window.pageYOffset || document.documentElement.scrollTop);
      
      // Store original overflow values
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyPosition = document.body.style.position;
      const originalBodyTop = document.body.style.top;
      const originalBodyWidth = document.body.style.width;
      
      // Lock body scroll completely but preserve scroll position
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollPositionRef.current}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
      
      // Prevent touch scrolling on mobile and desktop - but allow scrolling within modal
      const preventScroll = (e) => {
        // Always allow scrolling within the modal
        const modal = document.querySelector('.book-detail-modal');
        if (modal && modal.contains(e.target)) {
          // Allow all scrolling within modal
          return;
        }
        // Prevent scrolling on background only
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      // Prevent scroll on touchmove for the background (mobile)
      document.addEventListener('touchmove', preventScroll, { passive: false });
      // Prevent scroll on wheel for the background (desktop) 
      document.addEventListener('wheel', preventScroll, { passive: false });
      
      return () => {
        // Restore scroll position immediately before restoring body styles to prevent visible scroll
        const scrollPosition = scrollPositionRef.current;
        
        // Remove event listeners first
        document.removeEventListener('touchmove', preventScroll);
        document.removeEventListener('wheel', preventScroll);
        
        // Temporarily disable scroll behavior to prevent animation
        const originalScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        document.body.style.scrollBehavior = 'auto';
        
        // Set scroll position BEFORE restoring body styles to prevent jump
        if (scrollPosition !== undefined && scrollPosition !== null) {
          // Temporarily restore position to allow scroll setting
          document.body.style.position = 'relative';
          document.body.style.top = '0';
          
          // Set scroll position immediately (synchronously) - use scrollTo with 0 delay
          window.scrollTo(0, scrollPosition);
          document.documentElement.scrollTop = scrollPosition;
          document.body.scrollTop = scrollPosition;
          
          // Force a synchronous reflow to ensure scroll position is set before next frame
          void document.body.offsetHeight;
        }
        
        // Now restore all body styles
        document.body.style.overflow = originalBodyOverflow;
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = originalBodyWidth;
        document.documentElement.style.overflow = originalHtmlOverflow;
        
        // Restore scroll behavior after a brief moment
        setTimeout(() => {
          document.documentElement.style.scrollBehavior = originalScrollBehavior;
          document.body.style.scrollBehavior = originalScrollBehavior || '';
        }, 0);
        
        // Clear the saved scroll position from sessionStorage
        sessionStorage.removeItem('bookDetailScrollPosition');
      };
    }
  }, [book]);

  return (
    <>
      <Modal 
        show={true} 
        onHide={() => {
          // Check if a dropdown is open before closing
          const openDropdown = document.querySelector('.dropdown-menu.show');
          if (openDropdown) {
            // Don't close the modal if a dropdown is open
            return;
          }
          handleClose();
        }} 
        size="md" 
        centered 
        style={{ zIndex: 10100 }}
        className="book-detail-modal"
        backdrop={true}
        keyboard={true}
        restoreFocus={false}
        autoFocus={false}
        enforceFocus={false}
      >
        <Modal.Header closeButton style={{ position: 'relative' }}>
          <Modal.Title>
            {view === 'volumes' ? (
              <>
                <BsArrowLeft className="me-2" style={{ cursor: 'pointer' }} onClick={handleBackToDetail} />
                <BsBook className="me-2" />
                Select Volumes: {book.series}
              </>
            ) : view === 'edit' ? (
              <>
                <BsArrowLeft className="me-2" style={{ cursor: 'pointer' }} onClick={handleBackToDetail} />
                <BsPencil className="me-2" />
                Edit Book: {book.title}
              </>
            ) : (
              <>
                <BsBook className="me-2" />
                {book.title}{book.subtitle ? ` – ${book.subtitle}` : ''}
                <BsFiles 
                  className="ms-2 book-copy-ref-icon" 
                  onClick={handleCopyRef}
                  title="Copy reference"
                />
              </>
            )}
          </Modal.Title>
        </Modal.Header>
        
        <Modal.Body className="book-detail-modal-body" style={{ maxHeight: 'calc(90vh - 120px)', overflow: 'hidden', position: 'relative' }}>
          {enrichingVolumes && (
            <div className="enrichment-overlay">
              <div className="enrichment-loading-indicator">
                <div className="spinner-border text-warning mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                  <span className="visually-hidden">Loading...</span>
                </div>
                <div className="text-center">
                  <strong>Enriching volumes...</strong>
                  <div className="mt-2">
                    {enrichmentProgress.current} / {enrichmentProgress.total}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className={`book-detail-slider ${
            view === 'edit' ? 'slided-right' : 
            view === 'volumes' ? 'slided-left' : 
            ''
          }`}>
            {/* Detail View */}
            <div className={`book-detail-view ${view === 'detail' ? 'active' : ''}`}>
          {getCoverImage() ? (
            <Row>
              <Col md={3}>
                <div className="book-cover-container" ref={coverRef}>
                  <div style={{ position: 'relative', overflow: 'visible', borderRadius: '4px' }}>
                    {currentBook.borrowed && (
                      <div className="book-thumbnail-borrowed-ribbon">
                        Read & Gone
                      </div>
                    )}
                    {currentBook.titleStatus === 'borrowed' && !currentBook.borrowed && (
                      <div className="book-thumbnail-borrowed-ribbon">
                        Borrowed
                      </div>
                    )}
                    {currentBook.titleStatus === 'wish' && (
                      <div className="book-thumbnail-wishlist-ribbon">
                        Wishlist
                      </div>
                    )}
                    {getCoverImage() ? (
                      <img 
                        key={`book-cover-${currentBook.id}-${currentBook.cover || 'no-cover'}`}
                        src={getCoverImage()} 
                        alt={`${currentBook.title} cover`}
                        className="book-cover-image book-cover-clickable"
                        onClick={() => handleCoverClick(getCoverImage(), 'Front Cover')}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    {/* Change Cover Button */}
                    <button 
                      className="cover-change-btn"
                      onClick={handleCoverChangeClick}
                      title="Change cover"
                    >
                      <BsCamera size={14} />
                    </button>
                  </div>
                  {!getCoverImage() && (
                    <div 
                      className="book-cover-placeholder"
                      style={{ display: 'flex', position: 'relative' }}
                    >
                      <BsBook size={64} />
                      <button 
                        className="cover-change-btn"
                        onClick={handleCoverChangeClick}
                        title="Add cover"
                      >
                        <BsCamera size={14} />
                      </button>
                    </div>
                  )}
                  
                  {/* Inline Cover Selector */}
                  {showCoverSelector && (
                    <InlineCoverSelector
                      book={currentBook}
                      isOpen={showCoverSelector}
                      onCoverSelected={handleCoverSelected}
                      currentCover={currentBook.cover}
                      onClose={() => setShowCoverSelector(false)}
                    />
                  )}
                  
                  {(currentBook.language || currentBook.format || currentBook.pageCount || currentBook.publishedYear || currentBook.bookType) && (
                    <div className="book-metadata-summary">
                      <div className="metadata-summary-line">
                        {renderBookMetadata()}
                      </div>
                      {currentBook.publishedYear && (
                        <div className="metadata-summary-line">
                          Published in {currentBook.publishedYear}.
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Star Rating - always show for easy editing */}
                  <div className="book-rating-section interactive">
                    <strong>Rating:</strong>
                    <StarRatingInput 
                      rating={currentBook.rating}
                      onRatingChange={handleRatingChange}
                      size="md"
                    />
                  </div>
                  
                  {/* Owner Section */}
                  <div className="book-owner-section">
                    <span className="owner-label">
                      <BsPerson className="me-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
                      <strong>Belongs to:</strong>
                    </span>
                    {editingOwner ? (
                      <div className="inline-edit-field">
                        <div className="input-with-dropdown">
                          <input
                            ref={ownerInputRef}
                            type="text"
                            value={ownerValue}
                            onChange={(e) => handleOwnerChange(e.target.value)}
                            onKeyDown={handleOwnerKeyDown}
                            onBlur={() => setTimeout(() => setShowOwnerSuggestions(false), 150)}
                            placeholder="Enter owner name"
                            autoFocus
                            autoComplete="off"
                          />
                          {showOwnerSuggestions && ownerSuggestions.length > 0 && (
                            <div className="inline-suggestions-dropdown">
                              {ownerSuggestions.map((name, index) => (
                                <div
                                  key={index}
                                  className={`suggestion-item ${highlightedOwnerIndex === index ? 'highlighted' : ''}`}
                                  onClick={() => handleOwnerSuggestionClick(name)}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseEnter={() => setHighlightedOwnerIndex(index)}
                                >
                                  {name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="inline-edit-actions">
                          <button className="save-btn" onClick={saveOwner}>✓</button>
                          <button className="cancel-btn" onClick={cancelEditingOwner}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {currentBook.owner ? (
                          <span 
                            className="clickable-author"
                            onClick={() => handleSearch('owner', currentBook.owner)}
                          >
                            {currentBook.owner}
                          </span>
                        ) : (
                          <span className="placeholder-value">None</span>
                        )}
                        <button 
                          className="inline-edit-btn" 
                          onClick={(e) => { e.stopPropagation(); startEditingOwner(); }}
                          title="Edit owner"
                        >
                          <BsPencil size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Col>
              
              <Col md={9}>
                <div className="book-details">
                  {/* Series Section */}
                  <div className="series-section">
                    <strong>Series:</strong>{' '}
                    {editingSeries ? (
                      <div className="inline-edit-field series-edit">
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            ref={seriesInputRef}
                            type="text"
                            value={seriesValue}
                            onChange={(e) => handleSeriesChange(e.target.value)}
                            onKeyDown={handleSeriesKeyDown}
                            onBlur={() => setTimeout(() => setShowSeriesSuggestions(false), 150)}
                            placeholder="Series name..."
                            autoFocus
                            autoComplete="off"
                            className="series-name-input"
                          />
                          {showSeriesSuggestions && seriesSuggestions.length > 0 && (
                            <div className="inline-suggestions-dropdown">
                              {seriesSuggestions.map((name, index) => (
                                <div
                                  key={index}
                                  className={`suggestion-item ${highlightedSeriesIndex === index ? 'highlighted' : ''}`}
                                  onClick={() => handleSeriesSuggestionClick(name)}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseEnter={() => setHighlightedSeriesIndex(index)}
                                >
                                  {name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="series-number-label">#</span>
                        <input
                          type="number"
                          value={seriesNumberValue}
                          onChange={(e) => setSeriesNumberValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveSeries(); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelEditingSeries(); }
                          }}
                          placeholder="1"
                          step="0.5"
                          min="0"
                          className="series-number-input"
                        />
                        <div className="inline-edit-actions">
                          <button className="save-btn" onClick={saveSeries}>✓</button>
                          <button className="cancel-btn" onClick={cancelEditingSeries}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {currentBook.series ? (
                          <span 
                            className="clickable-series"
                            onClick={() => handleSearch('series', currentBook.series)}
                          >
                            {currentBook.series}
                            {currentBook.seriesNumber && ` #${currentBook.seriesNumber}`}
                          </span>
                        ) : (
                          <span className="placeholder-value">None</span>
                        )}
                        <button 
                          className="inline-edit-btn" 
                          onClick={(e) => { e.stopPropagation(); startEditingSeries(); }}
                          title="Edit series"
                        >
                          <BsPencil size={12} />
                        </button>
                      </>
                    )}
                  </div>
                  
                  {Array.isArray(book.authors) && book.authors.length > 1 ? (
                    <div className="book-author-section">
                      <strong>Authors:</strong>{' '}
                      {book.authors.map((author, index) => (
                        <span key={index}>
                          <span 
                            className="clickable-author"
                            onClick={() => handleSearch('author', author)}
                          >
                            {author}
                          </span>
                          {index < book.authors.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="book-author clickable-author" onClick={() => handleSearch('author', getAuthorDisplay())}>
                      <strong>Author:</strong> {getAuthorDisplay()}
                    </p>
                  )}
                  
                  {getArtistDisplay() && (
                    Array.isArray(book.artists) && book.artists.length > 1 ? (
                      <div className="book-artist-section">
                        <strong>Artists:</strong>{' '}
                        {book.artists.map((artist, index) => (
                          <span key={index}>
                            <span 
                              className="clickable-author"
                              onClick={() => handleSearch('artist', artist)}
                            >
                              {artist}
                            </span>
                            {index < book.artists.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="book-author clickable-author" onClick={() => handleSearch('artist', getArtistDisplay())}>
                        <strong>Artist:</strong> {getArtistDisplay()}
                      </p>
                    )
                  )}
                  
                  {book.publisher && (
                    <div className="publisher">
                      <strong>Publisher:</strong> {book.publisher}
                          </div>
                  )}
                  
                  {book.description && (
                    <div className="description-section enhanced">
                      <strong>Description</strong>
                      <div className={`description-content ${!descriptionExpanded && isDescriptionLong ? 'collapsed' : ''}`}>
                        <p className="description-text">{getDisplayDescription()}</p>
                        {!descriptionExpanded && isDescriptionLong && (
                          <div className="description-fade-overlay" />
                        )}
                      </div>
                      {isDescriptionLong && (
                        <button 
                          className="description-toggle-btn"
                          onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                        >
                          {descriptionExpanded ? (
                            <>Show less <BsChevronUp className="ms-1" /></>
                          ) : (
                            <>Read more <BsChevronDown className="ms-1" /></>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                  
                  <div className="comments-section">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="d-flex align-items-center">
                        <BsChatSquareText className="me-2" />
                        <strong>Reviews {comments.length > 0 && `(${comments.length})`}</strong>
                          </div>
                      {!showCommentModal && (
                        <Button 
                          variant="outline-primary" 
                          size="sm" 
                          onClick={handleAddComment}
                        >
                          <BsPlus className="me-1" />Add Review
                        </Button>
                      )}
                          </div>
                    
                    {/* Inline Comment Form */}
                    {showCommentModal && (
                      <div className="comment-form-inline mb-3 p-3" style={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}>
                        {commentErrors.submit && (
                          <div className="alert alert-danger mb-3">{commentErrors.submit}</div>
                        )}
                        <Form>
                          <Form.Group className="mb-3" style={{ position: 'relative', zIndex: 1000 }}>
                            <Form.Label>Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control
                              ref={nameInputRef}
                              type="text"
                              value={commentFormData.name}
                              onChange={(e) => handleCommentInputChange('name', e.target.value)}
                              onKeyDown={handleNameKeyDown}
                              onBlur={handleNameBlur}
                              onFocus={handleNameFocus}
                              placeholder="Enter your name"
                              isInvalid={!!commentErrors.name}
                              autoComplete="off"
                            />
                            {commentErrors.name && (
                              <Form.Control.Feedback type="invalid">
                                {commentErrors.name}
                              </Form.Control.Feedback>
                            )}
                            {showNameSuggestions && nameSuggestions.length > 0 && (
                              <div
                                ref={nameDropdownRef}
                                className="autocomplete-dropdown"
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  zIndex: 1001,
                                  backgroundColor: '#212529',
                                  border: '1px solid #495057',
                                  borderRadius: '0.25rem',
                                  marginTop: '0.25rem',
                                  maxHeight: '200px',
                                  overflowY: 'auto',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                                }}
                              >
                                {nameSuggestions.map((name, index) => (
                                  <div
                                    key={index}
                                    onClick={() => handleNameSuggestionClick(name)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    style={{
                                      padding: '0.5rem 0.75rem',
                                      cursor: 'pointer',
                                      backgroundColor: highlightedNameIndex === index ? '#495057' : 'transparent',
                                      color: '#f8f9fa'
                                    }}
                                    onMouseEnter={() => setHighlightedNameIndex(index)}
                                  >
                                    {name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </Form.Group>
                          <Form.Group className="mb-3">
                            <Form.Label>Review <span className="text-danger">*</span></Form.Label>
                            <Form.Control
                              as="textarea"
                              rows={6}
                              value={commentFormData.comment}
                              onChange={(e) => handleCommentInputChange('comment', e.target.value)}
                              placeholder="Enter your review here..."
                              isInvalid={!!commentErrors.comment}
                              style={{ 
                                overflowY: 'auto',
                                resize: 'vertical',
                                minHeight: '120px',
                                maxHeight: '400px'
                              }}
                            />
                            {commentErrors.comment && (
                              <Form.Control.Feedback type="invalid">
                                {commentErrors.comment}
                              </Form.Control.Feedback>
                            )}
                          </Form.Group>
                          <div className="d-flex justify-content-end gap-2">
                            <Button variant="link" size="sm" onClick={handleCloseCommentModal} disabled={loadingComments} className="text-secondary">
                              Cancel
                            </Button>
                            <Button 
                              variant="primary" 
                              size="sm"
                              onClick={handleSaveComment}
                              disabled={loadingComments}
                            >
                              {loadingComments ? 'Saving...' : (editingComment ? 'Update' : 'Save')}
                            </Button>
                          </div>
                        </Form>
                      </div>
                    )}
                    
                    {!showCommentModal && (
                      <>
                        {loadingComments ? (
                          <p className="comments-empty-message">Loading reviews...</p>
                        ) : comments.length === 0 ? (
                          <p className="comments-empty-message">No reviews yet. Be the first to add one!</p>
                        ) : (
                          <div className="comments-list">
                            {comments.map((comment) => (
                              <div key={comment.id} className="comment-item mb-3">
                                <div className="d-flex justify-content-between align-items-start mb-1">
                                  <div>
                                    <strong className="comment-name">{comment.name}</strong>
                                    {comment.date && (
                                      <span className="comment-date ms-2 text-muted">
                                        {formatDate(comment.date)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="comment-actions">
                                    {deletingCommentId === comment.id ? (
                                      <>
                                        <Button 
                                          variant="link" 
                                          size="sm" 
                                          className="text-danger p-0 me-2"
                                          onClick={() => handleDeleteComment(comment.id)}
                                          title="Confirm deletion"
                                        >
                                          Confirm deletion
                                        </Button>
                                        <Button
                                          variant="link"
                                          size="sm"
                                          className="text-secondary p-0"
                                          onClick={() => setDeletingCommentId(null)}
                                          title="Cancel"
                                        >
                                          Cancel
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="link"
                                          size="sm"
                                          className="text-primary p-0 me-2"
                                          onClick={() => handleEditComment(comment)}
                                          title="Edit review"
                                        >
                                          Edit
                                        </Button>
                                        <Button
                                          variant="link"
                                          size="sm"
                                          className="text-danger p-0"
                                          onClick={() => handleDeleteComment(comment.id)}
                                          title="Delete review"
                                        >
                                          Delete
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <p className="comment-text mb-0">{comment.comment}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  
                  {book.genres && Array.isArray(book.genres) && book.genres.length > 0 && (
                    <div className="tags-section">
                      <div className="tags-label">Genres:</div>
                      <div className="tags-container">
                        {book.genres.map((genre, index) => (
                          <Badge 
                            key={index} 
                            bg="secondary" 
                            className="clickable-badge"
                            onClick={() => handleSearch('genre', genre)}
                          >
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {book.tags && Array.isArray(book.tags) && book.tags.length > 0 && (
                    <div className="tags-section">
                      <div className="tags-label">Tags:</div>
                      <div className="tags-container">
                        {book.tags.map((tag, index) => (
                          <Badge key={index} bg="info">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {(book.isbn || book.isbn13) && (
                    <div className="info-section">
                      <h4>ISBN</h4>
                      <Row>
                        {book.isbn && (
                          <Col md={6}>
                            <div className="info-item">
                              <strong>ISBN-10:</strong> {formatIsbnDisplay(book.isbn)}
                        </div>
                      </Col>
                    )}
                    {book.isbn13 && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>ISBN-13:</strong> {formatIsbnDisplay(book.isbn13)}
                            </div>
                          </Col>
                        )}
                      </Row>
                    </div>
                  )}
                  
                  {(book.filetype || book.drm || book.narrator || book.runtime) && (
                    <div className="info-section">
                      <h4>Digital Format</h4>
                      <Row>
                        {book.filetype && (
                          <Col md={6}>
                            <div className="info-item">
                              <strong>File Type:</strong> {book.filetype}
                            </div>
                          </Col>
                        )}
                        {book.drm && (
                          <Col md={6}>
                            <div className="info-item">
                              <strong>DRM:</strong> {book.drm}
                            </div>
                          </Col>
                        )}
                        {book.narrator && (
                          <Col md={6}>
                            <div className="info-item">
                              <strong>Narrator:</strong> {book.narrator}
                            </div>
                          </Col>
                        )}
                        {book.runtime && (
                          <Col md={6}>
                            <div className="info-item">
                              <strong>Runtime:</strong> {Math.floor(book.runtime / 60)}h {book.runtime % 60}m
                            </div>
                          </Col>
                        )}
                      </Row>
                    </div>
                  )}
                  
                  {book.readDate && (
                    <div className="info-section">
                      <h4>Reading Information</h4>
                      <Row>
                        <Col md={6}>
                          <div className="info-item">
                            <strong>Read Date:</strong> {book.readDate}
                          </div>
                        </Col>
                      </Row>
                    </div>
                  )}
                  
                  {book.urls && Object.keys(book.urls).length > 0 && (
                    <div className="info-section">
                      <h4>External Links</h4>
                      <div className="external-links">
                        {Object.entries(book.urls).map(([label, url], index) => (
                          <a 
                            key={index}
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-outline-light btn-sm me-2 mb-2"
                          >
                            {label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {book.annotation && (
                    <div className="annotation-section">
                      <strong>Annotation:</strong>
                      <p className="annotation-text">{book.annotation}</p>
                    </div>
                  )}
                  
                  {view === 'detail' && book?.ebookFile && book.ebookFile.trim() ? (
                    <div className="info-section">
                      <h4>Ebook File</h4>
                      {loadingEbookInfo ? (
                        <div className="d-flex align-items-center gap-2">
                          <div className="spinner-border spinner-border-sm" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                          <span>Loading ebook info...</span>
                        </div>
                      ) : ebookInfo ? (
                        <div>
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <BsFileEarmark className="me-2" />
                            <div className="flex-grow-1">
                              <div><strong>{ebookInfo.originalName}</strong></div>
                              <small className="ebook-info-meta">
                                Format: {ebookInfo.format} • Size: {ebookInfo.sizeFormatted}
                              </small>
                            </div>
                            <Button
                              variant="outline-light"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await bookService.downloadEbook(book.id);
                                } catch (error) {
                                  console.error('Error downloading ebook:', error);
                                  alert('Failed to download ebook: ' + error.message);
                                }
                              }}
                            >
                              <BsDownload className="me-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center gap-2">
                          <BsFileEarmark className="me-2" />
                          <span>{book.ebookFile.split('_').slice(3).join('_') || book.ebookFile}</span>
                          <Button
                            variant="outline-light"
                            size="sm"
                            onClick={async () => {
                              try {
                                await bookService.downloadEbook(book.id);
                              } catch (error) {
                                console.error('Error downloading ebook:', error);
                                alert('Failed to download ebook: ' + error.message);
                              }
                            }}
                            className="ms-2"
                          >
                            <BsDownload className="me-1" />
                            Download
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Series Members Navigation - at the bottom */}
                  {book.series && seriesMembers.length > 0 && (
                    <div className="book-detail-series-section">
                      <h3>
                        "{book.series}" series
                      </h3>
                      <div className="series-books-horizontal">
                        {seriesMembers.map((member) => (
                          <SeriesBookItem
                            key={member.id}
                            bookItem={member}
                            onBookClick={handleBookClick}
                            getCoverUrl={getCoverUrl}
                            currentBookId={book.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Col>
            </Row>
          ) : (
            <div className="book-details">
              {Array.isArray(book.authors) && book.authors.length > 1 ? (
                <div className="book-author-section">
                  <strong>Authors:</strong>{' '}
                  {book.authors.map((author, index) => (
                    <span key={index}>
                      <span 
                        className="clickable-author"
                        onClick={() => handleSearch('author', author)}
                      >
                        {author}
                      </span>
                      {index < book.authors.length - 1 && ', '}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="book-author clickable-author" onClick={() => handleSearch('author', getAuthorDisplay())}>
                  <strong>Author:</strong> {getAuthorDisplay()}
                </p>
              )}
              
              {getArtistDisplay() && (
                Array.isArray(book.artists) && book.artists.length > 1 ? (
                  <div className="book-artist-section">
                    <strong>Artists:</strong>{' '}
                    {book.artists.map((artist, index) => (
                      <span key={index}>
                        <span 
                          className="clickable-author"
                          onClick={() => handleSearch('artist', artist)}
                        >
                          {artist}
                        </span>
                        {index < book.artists.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="book-author clickable-author" onClick={() => handleSearch('artist', getArtistDisplay())}>
                    <strong>Artist:</strong> {getArtistDisplay()}
                  </p>
                )
              )}
            
              {(book.language || book.format || book.pageCount || book.publishedYear || book.bookType) && (
                <div className="book-metadata-summary">
                  <div className="metadata-summary-line">
                    {renderBookMetadata()}
                  </div>
                  {book.publishedYear && (
                    <div className="metadata-summary-line">
                      Published in {book.publishedYear}.
                      </div>
                  )}
                </div>
              )}
              
              {/* Star Rating - always show for easy editing */}
              <div className="book-rating-section interactive">
                <strong>Rating:</strong>
                <StarRatingInput 
                  rating={currentBook.rating}
                  onRatingChange={handleRatingChange}
                  size="md"
                />
              </div>
              
              {/* Owner Section */}
              <div className="book-owner-section">
                <BsPerson className="me-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
                <strong>Owner:</strong>{' '}
                {editingOwner ? (
                  <div className="inline-edit-field">
                    <div className="input-with-dropdown">
                      <input
                        ref={ownerInputRef}
                        type="text"
                        value={ownerValue}
                        onChange={(e) => handleOwnerChange(e.target.value)}
                        onKeyDown={handleOwnerKeyDown}
                        onBlur={() => setTimeout(() => setShowOwnerSuggestions(false), 150)}
                        placeholder="Enter owner name"
                        autoFocus
                        autoComplete="off"
                      />
                      {showOwnerSuggestions && ownerSuggestions.length > 0 && (
                        <div className="inline-suggestions-dropdown">
                          {ownerSuggestions.map((name, index) => (
                            <div
                              key={index}
                              className={`suggestion-item ${highlightedOwnerIndex === index ? 'highlighted' : ''}`}
                              onClick={() => handleOwnerSuggestionClick(name)}
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={() => setHighlightedOwnerIndex(index)}
                            >
                              {name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="inline-edit-actions">
                      <button className="save-btn" onClick={saveOwner}>✓</button>
                      <button className="cancel-btn" onClick={cancelEditingOwner}>✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentBook.owner ? (
                      <span 
                        className="clickable-author"
                        onClick={() => handleSearch('owner', currentBook.owner)}
                      >
                        {currentBook.owner}
                      </span>
                    ) : (
                      <span className="placeholder-value">None</span>
                    )}
                    <button 
                      className="inline-edit-btn" 
                      onClick={(e) => { e.stopPropagation(); startEditingOwner(); }}
                      title="Edit owner"
                    >
                      <BsPencil size={12} />
                    </button>
                  </>
                )}
              </div>
              
              {/* Series Section */}
              <div className="series-section">
                <strong>Series:</strong>{' '}
                {editingSeries ? (
                  <div className="inline-edit-field series-edit">
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={seriesInputRef}
                        type="text"
                        value={seriesValue}
                        onChange={(e) => handleSeriesChange(e.target.value)}
                        onKeyDown={handleSeriesKeyDown}
                        onBlur={() => setTimeout(() => setShowSeriesSuggestions(false), 150)}
                        placeholder="Series name..."
                        autoFocus
                        autoComplete="off"
                        className="series-name-input"
                      />
                      {showSeriesSuggestions && seriesSuggestions.length > 0 && (
                        <div className="inline-suggestions-dropdown">
                          {seriesSuggestions.map((name, index) => (
                            <div
                              key={index}
                              className={`suggestion-item ${highlightedSeriesIndex === index ? 'highlighted' : ''}`}
                              onClick={() => handleSeriesSuggestionClick(name)}
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={() => setHighlightedSeriesIndex(index)}
                            >
                              {name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="series-number-label">#</span>
                    <input
                      type="number"
                      value={seriesNumberValue}
                      onChange={(e) => setSeriesNumberValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveSeries(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelEditingSeries(); }
                      }}
                      placeholder="1"
                      step="0.5"
                      min="0"
                      className="series-number-input"
                    />
                    <div className="inline-edit-actions">
                      <button className="save-btn" onClick={saveSeries}>✓</button>
                      <button className="cancel-btn" onClick={cancelEditingSeries}>✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentBook.series ? (
                      <span 
                        className="clickable-series"
                        onClick={() => handleSearch('series', currentBook.series)}
                      >
                        {currentBook.series}
                        {currentBook.seriesNumber && ` #${currentBook.seriesNumber}`}
                      </span>
                    ) : (
                      <span className="placeholder-value">None</span>
                    )}
                    <button 
                      className="inline-edit-btn" 
                      onClick={(e) => { e.stopPropagation(); startEditingSeries(); }}
                      title="Edit series"
                    >
                      <BsPencil size={12} />
                    </button>
                  </>
                )}
              </div>
              
              {currentBook.publisher && (
                <div className="publisher">
                  <strong>Publisher:</strong> {book.publisher}
                </div>
              )}
              
              {book.description && (
                <div className="description-section">
                  <p className="description-text">{book.description}</p>
                </div>
              )}
              
              <div className="comments-section">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="d-flex align-items-center">
                    <BsChatSquareText className="me-2" />
                    <strong>Reviews {comments.length > 0 && `(${comments.length})`}</strong>
                  </div>
                  {!showCommentModal && (
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      onClick={handleAddComment}
                    >
                      <BsPlus className="me-1" />Add Review
                    </Button>
                  )}
                </div>
                
                {/* Inline Comment Form */}
                {showCommentModal && (
                  <div className="comment-form-inline mb-3 p-3" style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <strong>{editingComment ? 'Edit Review' : 'Add Review'}</strong>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="text-secondary p-0"
                        onClick={handleCloseCommentModal}
                      >
                        <BsX size={20} />
                      </Button>
                    </div>
                    {commentErrors.submit && (
                      <div className="alert alert-danger mb-3">{commentErrors.submit}</div>
                    )}
                    <Form>
                      <Form.Group className="mb-3" style={{ position: 'relative', zIndex: 1000 }}>
                        <Form.Label>Name <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          ref={nameInputRef}
                          type="text"
                          value={commentFormData.name}
                          onChange={(e) => handleCommentInputChange('name', e.target.value)}
                          onKeyDown={handleNameKeyDown}
                          onBlur={handleNameBlur}
                          onFocus={handleNameFocus}
                          placeholder="Enter your name"
                          isInvalid={!!commentErrors.name}
                          autoComplete="off"
                        />
                        {commentErrors.name && (
                          <Form.Control.Feedback type="invalid">
                            {commentErrors.name}
                          </Form.Control.Feedback>
                        )}
                        {showNameSuggestions && nameSuggestions.length > 0 && (
                          <div
                            ref={nameDropdownRef}
                            className="autocomplete-dropdown"
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              zIndex: 1001,
                              backgroundColor: '#212529',
                              border: '1px solid #495057',
                              borderRadius: '0.25rem',
                              marginTop: '0.25rem',
                              maxHeight: '200px',
                              overflowY: 'auto',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                            }}
                          >
                            {nameSuggestions.map((name, index) => (
                              <div
                                key={index}
                                onClick={() => handleNameSuggestionClick(name)}
                                onMouseDown={(e) => e.preventDefault()}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  cursor: 'pointer',
                                  backgroundColor: highlightedNameIndex === index ? '#495057' : 'transparent',
                                  color: '#f8f9fa'
                                }}
                                onMouseEnter={() => setHighlightedNameIndex(index)}
                              >
                                {name}
                              </div>
                            ))}
                          </div>
                        )}
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Review <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={6}
                          value={commentFormData.comment}
                          onChange={(e) => handleCommentInputChange('comment', e.target.value)}
                          placeholder="Enter your review here..."
                          isInvalid={!!commentErrors.comment}
                          style={{ 
                            overflowY: 'auto',
                            resize: 'vertical',
                            minHeight: '120px',
                            maxHeight: '400px'
                          }}
                        />
                        {commentErrors.comment && (
                          <Form.Control.Feedback type="invalid">
                            {commentErrors.comment}
                          </Form.Control.Feedback>
                        )}
                      </Form.Group>
                      <div className="d-flex justify-content-end gap-2">
                        <Button variant="secondary" onClick={handleCloseCommentModal} disabled={loadingComments}>
                          Cancel
                        </Button>
                        <Button 
                          variant="primary" 
                          onClick={handleSaveComment}
                          disabled={loadingComments}
                        >
                          {loadingComments ? 'Saving...' : (editingComment ? 'Update' : 'Save')}
                        </Button>
                      </div>
                    </Form>
                  </div>
                )}
                
                {!showCommentModal && (
                  <>
                    {loadingComments ? (
                      <p className="comments-empty-message">Loading reviews...</p>
                    ) : comments.length === 0 ? (
                      <p className="comments-empty-message">No reviews yet. Be the first to add one!</p>
                    ) : (
                      <div className="comments-list">
                        {comments.map((comment) => (
                          <div key={comment.id} className="comment-item mb-3">
                            <div className="d-flex justify-content-between align-items-start mb-1">
                              <div>
                                <strong className="comment-name">{comment.name}</strong>
                                {comment.date && (
                                  <span className="comment-date ms-2 text-muted">
                                    {formatDate(comment.date)}
                                  </span>
                                )}
                              </div>
                              <div className="comment-actions">
                                {deletingCommentId === comment.id ? (
                                  <>
                                    <Button 
                                      variant="link" 
                                      size="sm" 
                                      className="text-danger p-0 me-2"
                                      onClick={() => handleDeleteComment(comment.id)}
                                      title="Confirm deletion"
                                    >
                                      Confirm deletion
                                    </Button>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="text-secondary p-0"
                                      onClick={() => setDeletingCommentId(null)}
                                      title="Cancel"
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="text-primary p-0 me-2"
                                      onClick={() => handleEditComment(comment)}
                                      title="Edit review"
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="text-danger p-0"
                                      onClick={() => handleDeleteComment(comment.id)}
                                      title="Delete review"
                                    >
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            <p className="comment-text mb-0">{comment.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              
              {book.genres && book.genres.length > 0 && (
                <div className="tags-section">
                  <div className="tags-label">Genres:</div>
                  <div className="tags-container">
                    {book.genres.map((genre, index) => (
                      <Badge 
                        key={index} 
                        bg="secondary" 
                        className="clickable-badge"
                        onClick={() => handleSearch('genre', genre)}
                      >
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {book.tags && book.tags.length > 0 && (
                <div className="tags-section">
                  <div className="tags-label">Tags:</div>
                  <div className="tags-container">
                    {book.tags.map((tag, index) => (
                      <Badge key={index} bg="info">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {book.description && (
                <div className="description-section enhanced">
                  <strong>Description</strong>
                  <div className={`description-content ${!descriptionExpanded && isDescriptionLong ? 'collapsed' : ''}`}>
                    <p className="description-text">{getDisplayDescription()}</p>
                    {!descriptionExpanded && isDescriptionLong && (
                      <div className="description-fade-overlay" />
                    )}
                  </div>
                  {isDescriptionLong && (
                    <button 
                      className="description-toggle-btn"
                      onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    >
                      {descriptionExpanded ? (
                        <>Show less <BsChevronUp className="ms-1" /></>
                      ) : (
                        <>Read more <BsChevronDown className="ms-1" /></>
                      )}
                    </button>
                  )}
                </div>
              )}
              
              {(book.isbn || book.isbn13) && (
                <div className="info-section">
                  <h4>ISBN</h4>
                  <Row>
                    {book.isbn && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>ISBN-10:</strong> {formatIsbnDisplay(book.isbn)}
                        </div>
                      </Col>
                    )}
                    {book.isbn13 && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>ISBN-13:</strong> {formatIsbnDisplay(book.isbn13)}
                        </div>
                      </Col>
                    )}
                  </Row>
                </div>
              )}
              
              {(book.filetype || book.drm || book.narrator || book.runtime) && (
                <div className="info-section">
                  <h4>Digital Format</h4>
                  <Row>
                    {book.filetype && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>File Type:</strong> {book.filetype}
                        </div>
                      </Col>
                    )}
                    {book.drm && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>DRM:</strong> {book.drm}
                        </div>
                      </Col>
                    )}
                    {book.narrator && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>Narrator:</strong> {book.narrator}
                        </div>
                      </Col>
                    )}
                    {book.runtime && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>Runtime:</strong> {Math.floor(book.runtime / 60)}h {book.runtime % 60}m
                        </div>
                      </Col>
                    )}
                  </Row>
                </div>
              )}
              
              {book.borrowed && (
                <div className="info-section">
                  <h4>Borrowing Information</h4>
                  <Row>
                    {book.borrowedDate && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>Borrowed Date:</strong> {book.borrowedDate}
                        </div>
                      </Col>
                    )}
                    {book.returnedDate && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>Returned Date:</strong> {book.returnedDate}
                        </div>
                      </Col>
                    )}
                    {book.borrowedNotes && (
                      <Col md={12}>
                        <div className="info-item">
                          <strong>Notes:</strong> {book.borrowedNotes}
                        </div>
                      </Col>
                    )}
                  </Row>
                </div>
              )}
              
              {book.urls && Object.keys(book.urls).length > 0 && (
                <div className="info-section">
                  <h4>External Links</h4>
                  <div className="external-links">
                    {Object.entries(book.urls).map(([label, url], index) => (
                      <a 
                        key={index}
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-outline-light btn-sm me-2 mb-2"
                      >
                        {label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              
              {book.annotation && (
                <div className="annotation-section">
                  <strong>Annotation:</strong>
                  <p className="annotation-text">{book.annotation}</p>
                </div>
              )}
              
              {view === 'detail' && book?.ebookFile && book.ebookFile.trim() ? (
                <div className="info-section">
                  <h4>Ebook File</h4>
                  {loadingEbookInfo ? (
                    <div className="d-flex align-items-center gap-2">
                      <div className="spinner-border spinner-border-sm" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      <span>Loading ebook info...</span>
                    </div>
                  ) : ebookInfo ? (
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <BsFileEarmark className="me-2" />
                        <div className="flex-grow-1">
                          <div><strong>{ebookInfo.originalName}</strong></div>
                          <small className="ebook-info-meta">
                            Format: {ebookInfo.format} • Size: {ebookInfo.sizeFormatted}
                          </small>
                        </div>
                        <Button
                          variant="outline-light"
                          size="sm"
                          onClick={async () => {
                            try {
                              await bookService.downloadEbook(book.id);
                            } catch (error) {
                              console.error('Error downloading ebook:', error);
                              alert('Failed to download ebook: ' + error.message);
                            }
                          }}
                        >
                          <BsDownload className="me-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <BsFileEarmark className="me-2" />
                      <span>{book.ebookFile.split('_').slice(3).join('_') || book.ebookFile}</span>
                      <Button
                        variant="outline-light"
                        size="sm"
                        onClick={async () => {
                          try {
                            await bookService.downloadEbook(book.id);
                          } catch (error) {
                            console.error('Error downloading ebook:', error);
                            alert('Failed to download ebook: ' + error.message);
                          }
                        }}
                        className="ms-2"
                      >
                        <BsDownload className="me-1" />
                        Download
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
              
              <div className="comments-section">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="d-flex align-items-center">
                    <BsChatSquareText className="me-2" />
                    <strong>Reviews {comments.length > 0 && `(${comments.length})`}</strong>
                  </div>
                  <Button 
                    variant="outline-primary" 
                    size="sm" 
                    onClick={handleAddComment}
                  >
                    <BsPlus className="me-1" />Add Review
                  </Button>
                </div>
                {loadingComments ? (
                  <p className="comments-empty-message">Loading reviews...</p>
                ) : comments.length === 0 ? (
                  <p className="comments-empty-message">No reviews yet. Be the first to add one!</p>
                ) : (
                  <div className="comments-list">
                    {comments.map((comment) => (
                      <div key={comment.id} className="comment-item mb-3">
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <div>
                            <strong className="comment-name">{comment.name}</strong>
                            {comment.date && (
                              <span className="comment-date ms-2 text-muted">
                                {formatDate(comment.date)}
                              </span>
                            )}
                          </div>
                          <div className="comment-actions">
                            {deletingCommentId === comment.id ? (
                              <>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-danger p-0 me-2"
                                  onClick={() => handleDeleteComment(comment.id)}
                                  title="Confirm deletion"
                                >
                                  Confirm deletion
                                </Button>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-secondary p-0"
                                  onClick={handleCancelDelete}
                                  title="Cancel"
                                >
                                  <BsX />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-primary p-0 me-2"
                                  onClick={() => handleEditComment(comment)}
                                  title="Edit review"
                                >
                                  <BsPencil />
                                </Button>
                                <Button 
                                  variant="link" 
                                  size="sm" 
                                  className="text-danger p-0"
                                  onClick={() => handleDeleteComment(comment.id)}
                                  title="Delete review"
                                >
                                  <BsTrash />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="comment-text mb-0">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
            </div>

            {/* Volumes View */}
            <div className={`book-volumes-view ${view === 'volumes' ? 'active' : ''}`}>

              {loadingVolumes && (
                <div className="text-center py-5">
                  <div className="spinner-border text-warning mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p>Searching for volumes...</p>
                </div>
              )}

              {volumeError && (
                <Alert variant="danger" className="mb-3">
                  {volumeError}
                </Alert>
              )}

              {!loadingVolumes && volumes.length === 0 && !volumeError && (
                <Alert variant="info" className="mb-3">
                  No volumes found for this series. You can still add volumes manually.
                </Alert>
              )}

              {!loadingVolumes && volumes.length > 0 && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-3 volume-selector-header">
                    <div>
                      <strong>{volumes.length} volume{volumes.length !== 1 ? 's' : ''} found</strong>
                      {selectedVolumes.size > 0 && (
                        <span className="ms-2 text-warning">
                          ({selectedVolumes.size} selected)
                        </span>
                      )}
                    </div>
                    <div>
                      <Button variant="outline-secondary" size="sm" onClick={selectAllVolumes} className="me-2">
                        Select All
                      </Button>
                      <Button variant="outline-secondary" size="sm" onClick={deselectAllVolumes}>
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  {book && (
                    <div className="mb-3">
                      <Form.Check
                        type="checkbox"
                        label={book.owner 
                          ? `Copy owner information from template book (${book.owner})`
                          : 'Copy owner information from template book'}
                        checked={copyOwnerInfo}
                        onChange={(e) => setCopyOwnerInfo(e.target.checked)}
                        disabled={enrichingVolumes}
                      />
                    </div>
                  )}

                  <div className="volumes-grid-container">
                    <div className="volumes-grid">
                      {volumes.map((volume) => {
                        const isSelected = selectedVolumes.has(volume.seriesNumber);
                        const coverUrl = getVolumeCoverImage(volume);
                        const existingBook = existingBooks.get(volume.seriesNumber);
                        const isAlreadyInCollection = existingBook && existingBook.titleStatus !== 'borrowed';
                        const isBorrowed = existingBook && existingBook.titleStatus === 'borrowed';
                        const isDisabled = isAlreadyInCollection;
                        
                        return (
                          <div
                            key={volume.seriesNumber || volume.title}
                            className={`volume-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                            onClick={() => !enrichingVolumes && !isDisabled && toggleVolume(volume.seriesNumber)}
                            style={{ 
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              opacity: isDisabled ? 0.6 : 1
                            }}
                          >
                            <div className="volume-checkbox">
                              {isSelected && <BsCheck />}
                            </div>
                            {coverUrl ? (
                              <img src={coverUrl} alt={volume.title} className="volume-cover" />
                            ) : (
                              <div className="volume-cover-placeholder">
                                <BsBook size={32} />
                              </div>
                            )}
                            <div className="volume-info">
                              <div className="volume-number">#{volume.seriesNumber}</div>
                              <div className="volume-title" title={volume.title}>
                                {volume.title || `Volume ${volume.seriesNumber}`}
                              </div>
                              {volume.authors && volume.authors.length > 0 && (
                                <div className="volume-authors">
                                  {Array.isArray(volume.authors) ? volume.authors.join(', ') : volume.authors}
                                </div>
                              )}
                              <div className="d-flex flex-wrap justify-content-center gap-1 mt-1">
                                {volume.publishedYear && (
                                  <Badge bg="secondary" className="volume-year">
                                    {volume.publishedYear}
                                  </Badge>
                                )}
                                {isAlreadyInCollection && (
                                  <Badge bg="info" className="volume-status">
                                    Already in collection
                                  </Badge>
                                )}
                                {isBorrowed && (
                                  <Badge bg="warning" text="dark" className="volume-status">
                                    Borrowed
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Edit View */}
            <div className={`book-edit-view ${view === 'edit' ? 'active' : ''}`}>
              {updatingBook && (
                <div className="text-center py-5">
                  <div className="spinner-border text-warning mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p>Updating book...</p>
                </div>
              )}
              <div className="book-edit-form-container" ref={editFormRef} style={{ display: updatingBook ? 'none' : 'block' }}>
                {view === 'edit' && book && (
                  <BookForm
                    book={book}
                    onSave={handleEditSave}
                    onCancel={handleEditCancel}
                    inline={true}
                    onBookUpdated={onBookUpdated}
                  />
                )}
              </div>
            </div>
          </div>
        </Modal.Body>
        
        <Modal.Footer>
          {view === 'edit' ? (
            <>
              <Button variant="secondary" onClick={handleEditCancel} disabled={updatingBook}>
                Cancel
              </Button>
              <Button 
                variant="warning" 
                onClick={() => {
                  // Trigger form submit - find the form inside BookForm's modal
                  const form = editFormRef.current?.querySelector('form');
                  if (form) {
                    form.requestSubmit();
                  }
                }}
                disabled={updatingBook}
                style={{ backgroundColor: '#fbbf24', borderColor: '#fbbf24', color: '#1a202c' }}
              >
                {updatingBook ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Updating...
                  </>
                ) : (
                  'Update Book'
                )}
              </Button>
            </>
          ) : view === 'volumes' ? (
            <>
              <Button variant="secondary" onClick={handleBackToDetail} disabled={enrichingVolumes}>
                <BsArrowLeft className="me-2" />
                Back
              </Button>
              <Button
                variant="warning"
                onClick={handleAddSelectedVolumes}
                disabled={enrichingVolumes || selectedVolumes.size === 0}
                style={{ backgroundColor: '#fbbf24', borderColor: '#fbbf24', color: '#1a202c' }}
              >
                {enrichingVolumes ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    Import {selectedVolumes.size} Volume{selectedVolumes.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="book-detail-footer-buttons d-flex justify-content-between w-100">
                <div className="book-detail-footer-left">
                  {book.series && (
                    <Button 
                      variant="outline-warning" 
                      onClick={handleShowVolumes}
                      style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', borderColor: '#fbbf24', color: '#fbbf24' }}
                      className="me-2"
                    >
                      <BsPlus className="me-2" />
                      Add Next Volume
                    </Button>
                  )}
                </div>
                <div className="book-detail-footer-right">
                  <Button 
                    variant="outline-secondary" 
                    onClick={handleShowEdit}
                    className="me-2"
                  >
                    <BsPencil className="me-2" />
                    Edit
                  </Button>
                  <Button 
                    ref={deleteBtnRef}
                    variant={confirmDelete ? "danger" : "outline-danger"} 
                    onClick={handleDelete}
                    className="me-2"
                  >
                    <BsTrash className="me-2" />
                    {confirmDelete ? 'Confirm Delete' : 'Delete'}
                  </Button>
                  <Button variant="secondary" onClick={handleClose}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal.Footer>
      </Modal>
      
      <CoverModal
        isOpen={showCoverModal}
        onClose={handleCloseCoverModal}
        coverUrl={coverModalData.coverUrl}
        title={coverModalData.title}
        artist={coverModalData.author}
        coverType={coverModalData.coverType || 'Cover'}
      />
    </>
  );
};

export default BookDetailCard;

