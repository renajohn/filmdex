import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { Dropdown, Form } from 'react-bootstrap';
import { useNavigate, useLocation } from 'react-router-dom';
import bookService from '../services/bookService';
import BookForm from './BookForm';
import BookThumbnail from './BookThumbnail';
import BookDetailCard from './BookDetailCard';
import AddBookDialog from './AddBookDialog';
import { 
  BsSortDown, 
  BsChevronDown, 
  BsBook,
  BsGrid3X3Gap,
  BsPlus
} from 'react-icons/bs';
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
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingBook, setAddingBook] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingBook, setEditingBook] = useState(null);
  const [selectedBookDetails, setSelectedBookDetails] = useState(null);
  const [bookDetailsBeforeEdit, setBookDetailsBeforeEdit] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState({ show: false, bookId: null });
  const [templateBook, setTemplateBook] = useState(null);
  const previousSearchTextRef = useRef('');
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleBookClick = async (bookId) => {
    try {
      const details = await bookService.getBookById(bookId);
      setSelectedBookDetails(details);
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load book details: ' + err.message, 'danger');
      }
    }
  };

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
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <h3 className="empty-state-title">No Results Found</h3>
          <p className="empty-state-description">
            No books match "{searchCriteria.searchText}"
          </p>
          <p className="empty-state-hint">
            Try different keywords or clear your search
          </p>
          <div className="empty-state-collection-info">
            You have <strong>{allBooks.length}</strong> {allBooks.length === 1 ? 'book' : 'books'} in your collection
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📖</div>
          <h3 className="empty-state-title">Welcome to BookDex!</h3>
          <p className="empty-state-description">
            Your book collection is empty. Add your first book to get started and begin tracking your library.
          </p>
         
          <button 
            className="btn btn-primary btn-lg mt-4"
            onClick={onOpenAddDialog}
          >
            <BsBook className="me-2" />
            Add Your First Book
          </button>
        </div>
      );
    }

    if (groupBy === 'none') {
      return (
        <div className={`book-grid ${sortLoading ? 'sort-loading' : ''}`}>
          {filteredBooks.map((book) => (
            <BookThumbnail
              key={book.id}
              book={book}
              onClick={() => handleBookClick(book.id)}
              onEdit={() => handleEditBook(book)}
              onDelete={() => setShowDeleteModal({ show: true, bookId: book.id })}
            />
          ))}
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
                  {sortedGroupBooks.map((book) => (
                    <BookThumbnail
                      key={book.id}
                      book={book}
                      onClick={() => handleBookClick(book.id)}
                      onEdit={() => handleEditBook(book)}
                      onDelete={() => setShowDeleteModal({ show: true, bookId: book.id })}
                    />
                  ))}
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
    <div className="book-search">
      <div className="books-results">
        <div className="books-results-header">
          <div className="dropdowns-container">
            <Dropdown className="sort-dropdown-container">
              <Dropdown.Toggle 
                as="button"
                className={`filter-pill sort-dropdown-button ${loading || sortLoading ? 'filter-pill-loading' : ''}`}
                disabled={sortLoading}
              >
                {sortLoading ? (
                  <>
                    <span className="sort-loading-spinner"></span>
                    Sorting...
                  </>
                ) : (
                  <>
                    <BsSortDown className="sort-icon" />
                    Sort: {sortOptions.find(opt => opt.value === sortBy)?.label || 'Title A-Z'}
                  </>
                )}
              </Dropdown.Toggle>
              
              <Dropdown.Menu className="sort-dropdown-menu">
                {sortOptions.map(option => (
                  <Dropdown.Item
                    key={option.value}
                    className={`sort-dropdown-item ${sortBy === option.value ? 'active' : ''}`}
                    onClick={() => handleSortChange(option.value)}
                  >
                    {option.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            <Dropdown className="group-dropdown-container">
              <Dropdown.Toggle 
                as="button"
                className={`filter-pill group-dropdown-button ${loading || groupLoading ? 'filter-pill-loading' : ''}`}
                disabled={groupLoading}
              >
                {groupLoading ? (
                  <>
                    <span className="group-loading-spinner"></span>
                    Grouping...
                  </>
                ) : (
                  <>
                    <BsGrid3X3Gap className="group-icon" />
                    {groupOptions.find(opt => opt.value === groupBy)?.label || 'No grouping'}
                  </>
                )}
              </Dropdown.Toggle>
              
              <Dropdown.Menu className="group-dropdown-menu">
                {groupOptions.map(option => (
                  <Dropdown.Item
                    key={option.value}
                    className={`group-dropdown-item ${groupBy === option.value ? 'active' : ''}`}
                    onClick={() => handleGroupChange(option.value)}
                  >
                    {option.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            {groupBy !== 'none' && (
              <button 
                className="collapse-all-btn"
                onClick={toggleAllGroups}
              >
                {expandAllGroups ? 'Collapse All' : 'Expand All'}
              </button>
            )}

            <button 
              className="add-item-btn"
              onClick={() => setShowAddDialog(true)}
              title="Add Book to Collection"
            >
              <BsPlus className="me-1" />
              Add Book
            </button>
          </div>
          
          <div className="books-count-display">
            Showing {bookCount.filtered} of {bookCount.total} books
          </div>
        </div>

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
          setAddError('');
        }}
        onBookAdded={async () => {
          try {
            await loadBooks();
          } finally {
            setAddingBook(false);
            setAddError('');
            setTemplateBook(null); // Clear template after book is added
          }
        }}
        onAddError={(err) => {
          setAddingBook(false);
          setAddError(err?.message || 'Failed to add book');
          if (onShowAlert) onShowAlert('Failed to add book: ' + (err?.message || ''), 'danger');
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
          onClose={() => setSelectedBookDetails(null)}
          onEdit={() => handleEditBook(selectedBookDetails)}
          onUpdateBook={onUpdateBook}
          onBookUpdated={async (bookId) => {
            try {
              console.log('BookSearch: Refreshing book data for ID:', bookId);
              // Refresh the book list to show updated covers
              await loadBooks();
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
              await onDeleteBook(selectedBookDetails.id);
              setSelectedBookDetails(null);
              await loadBooks();
            } catch (e) {
              if (onShowAlert) onShowAlert('Failed to delete book: ' + (e?.message || ''), 'danger');
            }
          }}
          onSearch={updateSearchViaUrl}
          onAddBooksBatch={async (books) => {
            try {
              const result = await bookService.addBooksBatch(books);
              if (result.errors && result.errors.length > 0) {
                const errorMsg = result.errors.map(e => `${e.book}: ${e.error}`).join(', ');
                throw new Error(errorMsg);
              }
              await loadBooks();
              return result.success || [];
            } catch (error) {
              console.error('Error adding books batch:', error);
              throw error;
            }
          }}
          onAddStart={() => {
            setAddingBook(true);
            setAddError('');
          }}
          onBookAdded={async () => {
            try {
              await loadBooks();
            } finally {
              setAddingBook(false);
              setAddError('');
            }
          }}
          onAddError={(err) => {
            setAddingBook(false);
            setAddError(err?.message || 'Failed to add book');
            if (onShowAlert) onShowAlert('Failed to add book: ' + (err?.message || ''), 'danger');
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

      {addError && (
        <div className="error-message">
          {addError}
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
    </div>
  );
});

BookSearch.displayName = 'BookSearch';

export default BookSearch;

