import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Row, Col, Badge, Form, Alert } from 'react-bootstrap';
import { BsPencil, BsTrash, BsBook, BsCalendar, BsTag, BsTranslate, BsFileEarmark, BsStar, BsPerson, BsHouse, BsChatSquareText, BsPlus, BsX, BsCheck, BsArrowLeft, BsDownload } from 'react-icons/bs';
import bookService from '../services/bookService';
import bookCommentService from '../services/bookCommentService';
import CoverModal from './CoverModal';
import BookForm from './BookForm';
import './BookDetailCard.css';
import './VolumeSelector.css';

const BookDetailCard = ({ book, onClose, onEdit, onUpdateBook, onBookUpdated, onDelete, onSearch, onAddNextVolume, onAddBooksBatch, onAddStart, onBookAdded, onAddError }) => {
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

  useEffect(() => {
    if (book && book.id) {
      loadComments();
    }
  }, [book?.id]);

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
    if (Array.isArray(book.authors)) {
      return book.authors.join(', ');
    }
    return book.authors || 'Unknown Author';
  };

  const getArtistDisplay = () => {
    if (Array.isArray(book.artists)) {
      return book.artists.join(', ');
    }
    return book.artists || null;
  };

  const getCoverImage = () => {
    return bookService.getImageUrl(book.cover);
  };

  const formatBookMetadata = () => {
    const parts = [];
    
    // Language
    let langName = null;
    if (book.language) {
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
      langName = langMap[book.language.toLowerCase()] || book.language.toUpperCase();
    }
    
    // Format
    const format = book.format || null;
    
    // Pages
    const pages = book.pageCount || null;
    
    // Build the sentence naturally
    let sentence = '';
    
    if (pages && (langName || format)) {
      // "88-page French physical book" or "88-page physical book" or "88-page French book"
      const pageDesc = `${pages}-page`;
      const descParts = [];
      if (langName) descParts.push(langName);
      if (format) descParts.push(format);
      descParts.push('book');
      sentence = `${pageDesc} ${descParts.join(' ')}`;
    } else if (langName || format) {
      // "French physical book" or "physical book" or "French book"
      const descParts = [];
      if (langName) descParts.push(langName);
      if (format) descParts.push(format);
      descParts.push('book');
      sentence = descParts.join(' ');
      if (pages) {
        sentence += ` (${pages} page${pages !== 1 ? 's' : ''})`;
      }
    } else if (pages) {
      // Just pages: "88-page book"
      sentence = `${pages}-page book`;
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
            return !existingBook || existingBook.borrowed;
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
    if (existingBook && !existingBook.borrowed) {
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

      const enrichedVolumes = [];
      for (let i = 0; i < volumesToAdd.length; i++) {
        const volume = volumesToAdd[i];
        setEnrichmentProgress({ current: i + 1, total: volumesToAdd.length });
        
        try {
          const enriched = await bookService.enrichBook(volume);
          
          if (copyOwnerInfo && book) {
            if (book.owner !== undefined) {
              enriched.owner = book.owner || null;
            }
            if (book.borrowed !== undefined) {
              enriched.borrowed = book.borrowed;
            }
            if (book.borrowedDate) {
              enriched.borrowedDate = book.borrowedDate;
            }
            if (book.returnedDate) {
              enriched.returnedDate = book.returnedDate;
            }
            if (book.borrowedNotes) {
              enriched.borrowedNotes = book.borrowedNotes;
            }
          }
          
          enrichedVolumes.push(enriched);
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
          enrichedVolumes.push(volumeWithOwner);
        }
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
      scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
      
      // Store original overflow values
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyPosition = document.body.style.position;
      const originalBodyTop = document.body.style.top;
      
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
        // Restore body scroll when modal closes
        document.body.style.overflow = originalBodyOverflow;
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = '';
        document.documentElement.style.overflow = originalHtmlOverflow;
        
        // Restore scroll position only if we're not in edit mode
        // Use setTimeout to ensure modal is fully closed and DOM has updated
        if (view === 'detail') {
          setTimeout(() => {
            window.scrollTo({
              top: scrollPositionRef.current,
              behavior: 'auto'
            });
          }, 0);
        }
        
        // Remove event listeners
        document.removeEventListener('touchmove', preventScroll);
        document.removeEventListener('wheel', preventScroll);
      };
    }
  }, [book, view]);

  return (
    <>
      <Modal 
        show={true} 
        onHide={handleClose} 
        size="md" 
        centered 
        style={{ zIndex: 10100 }}
        className="book-detail-modal"
        backdrop={true}
        keyboard={true}
      >
        <Modal.Header closeButton>
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
                <div className="book-cover-container">
                  <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '4px' }}>
                    {book.borrowed && (
                      <div className="book-thumbnail-borrowed-ribbon">
                        Read & Gone
                      </div>
                    )}
                    <img 
                      src={getCoverImage()} 
                      alt={`${book.title} cover`}
                      className="book-cover-image book-cover-clickable"
                      onClick={() => handleCoverClick(getCoverImage(), 'Front Cover')}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  </div>
                  <div 
                    className="book-cover-placeholder"
                    style={{ display: getCoverImage() ? 'none' : 'flex' }}
                  >
                    <BsBook size={64} />
                  </div>
                  
                  {(book.language || book.format || book.pageCount || book.publishedYear) && (
                    <div className="book-metadata-summary">
                      {formatBookMetadata() && (
                        <div className="metadata-summary-line">
                          {formatBookMetadata()}.
                        </div>
                      )}
                      {book.publishedYear && (
                        <div className="metadata-summary-line">
                          Published in {book.publishedYear}.
                        </div>
                      )}
                    </div>
                  )}
                  
                  {book.rating && (
                    <div className="book-rating-section">
                      <BsStar className="me-2" style={{ color: '#fbbf24' }} />
                      <strong>Rating:</strong> {book.rating}/5
                    </div>
                  )}
                  
                  {book.owner && (
                    <div className="book-owner-section">
                      <BsPerson className="me-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
                      <strong>Owner:</strong>{' '}
                      <span 
                        className="clickable-author"
                        onClick={() => handleSearch('owner', book.owner)}
                      >
                        {book.owner}
                      </span>
                    </div>
                  )}
                </div>
              </Col>
              
              <Col md={9}>
                <div className="book-details">
                  {book.series && (
                    <div className="series-section">
                      <div>
                        <strong>Series:</strong>{' '}
                        <span 
                          className="clickable-series"
                          onClick={() => handleSearch('series', book.series)}
                        >
                          {book.series}
                          {book.seriesNumber && ` #${book.seriesNumber}`}
                        </span>
                      </div>
                    </div>
                  )}
                  
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
                              <strong>ISBN-10:</strong> {book.isbn}
                            </div>
                          </Col>
                        )}
                        {book.isbn13 && (
                          <Col md={6}>
                            <div className="info-item">
                              <strong>ISBN-13:</strong> {book.isbn13}
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
            
              {(book.language || book.format || book.pageCount || book.publishedYear) && (
                <div className="book-metadata-summary">
                  {formatBookMetadata() && (
                    <div className="metadata-summary-line">
                      {formatBookMetadata()}.
                    </div>
                  )}
                  {book.publishedYear && (
                    <div className="metadata-summary-line">
                      Published in {book.publishedYear}.
                      </div>
                  )}
                </div>
              )}
              
              {book.rating && (
                <div className="book-rating-section">
                  <BsStar className="me-2" style={{ color: '#fbbf24' }} />
                  <strong>Rating:</strong> {book.rating}/5
                </div>
              )}
              
              {book.owner && (
                <div className="book-owner-section">
                  <BsPerson className="me-2" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
                  <strong>Owner:</strong>{' '}
                  <span 
                    className="clickable-author"
                    onClick={() => handleSearch('owner', book.owner)}
                  >
                    {book.owner}
                  </span>
                </div>
              )}
              
              {book.series && (
                <div className="series-section">
                  <div>
                    <strong>Series:</strong>{' '}
                    <span 
                      className="clickable-series"
                      onClick={() => handleSearch('series', book.series)}
                    >
                      {book.series}
                      {book.seriesNumber && ` #${book.seriesNumber}`}
                    </span>
                  </div>
                </div>
              )}
              
              {book.publisher && (
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
                <div className="description-section">
                  <strong>Description:</strong>
                  <p className="description-text">{book.description}</p>
                </div>
              )}
              
              {(book.isbn || book.isbn13) && (
                <div className="info-section">
                  <h4>ISBN</h4>
                  <Row>
                    {book.isbn && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>ISBN-10:</strong> {book.isbn}
                        </div>
                      </Col>
                    )}
                    {book.isbn13 && (
                      <Col md={6}>
                        <div className="info-item">
                          <strong>ISBN-13:</strong> {book.isbn13}
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
                        const isAlreadyInCollection = existingBook && !existingBook.borrowed;
                        const isBorrowed = existingBook && existingBook.borrowed;
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
              <div className="d-flex justify-content-between w-100">
                <div>
                  {book.series && (
                    <Button 
                      variant="outline-warning" 
                      onClick={handleShowVolumes}
                      style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', borderColor: '#fbbf24', color: '#fbbf24' }}
                    >
                      <BsPlus className="me-2" />
                      Add Next Volume
                    </Button>
                  )}
                </div>
                <div>
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

