import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Form, Alert, Table, Badge } from 'react-bootstrap';
import { BsX, BsSearch, BsPlus, BsChevronDown, BsChevronRight, BsBook } from 'react-icons/bs';
import bookService from '../services/bookService';
import BookForm from './BookForm';
import VolumeSelector from './VolumeSelector';
import './AddBookDialog.css';

const AddBookDialog = ({ show, onHide, onAddBook, onAddStart, onBookAdded, onAddError, templateBook, onAddBooksBatch }) => {
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
  const [searchLanguage, setSearchLanguage] = useState('fr'); // Français par défaut
  const [enriching, setEnriching] = useState(false);
  const [enrichingBookIndex, setEnrichingBookIndex] = useState(null); // Track which book is being enriched
  const [showVolumeSelector, setShowVolumeSelector] = useState(false);
  const isbnInputRef = useRef(null);
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (show) {
      setTimeout(() => {
        if (searchTab === 'isbn' && isbnInputRef.current) {
          isbnInputRef.current.focus();
        } else if (searchTab === 'title' && titleInputRef.current) {
          titleInputRef.current.focus();
        }
      }, 100);
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
    }
  }, [show]);

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

  const handleSearch = async () => {
    const trimmedIsbn = searchIsbn.trim();
    const trimmedTitle = searchTitle.trim();
    const trimmedAuthor = searchAuthor.trim();
    
    // Check if any search field is filled based on current tab
    if (searchTab === 'isbn') {
      if (!trimmedIsbn) {
        setError('Please enter an ISBN');
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
        language: searchLanguage
      };
      
      let query = '';
      
      if (searchTab === 'isbn') {
        // ISBN search mode
        filters.isbn = trimmedIsbn;
        query = ''; // ISBN search doesn't need a general query
      } else {
        // Title/Author search mode
        if (trimmedTitle) {
          filters.title = trimmedTitle;
        }
        if (trimmedAuthor) {
          filters.author = trimmedAuthor;
        }
        
        // Build query from title/author
        if (trimmedTitle && trimmedAuthor) {
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
      
      // Expand all groups initially if there are few results
      if (grouped.length <= 3) {
        setExpandedGroups(new Set(grouped.map((_, idx) => idx)));
      } else {
        setExpandedGroups(new Set());
      }
    } catch (err) {
      setError('Search failed: ' + err.message);
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
    setSearchLanguage('fr'); // Reset to default
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
        onSave={async (bookData) => {
          if (onAddStart) onAddStart();
          try {
            const createdBook = await onAddBook(bookData);
            handleBookAdded(createdBook);
            return createdBook;
          } catch (err) {
            if (onAddError) onAddError(err);
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
            <div className="row g-2 mb-3">
              <div className="col-12 col-md-10">
                <Form.Control
                  ref={isbnInputRef}
                  type="text"
                  placeholder="Enter ISBN (10 or 13 digits)"
                  value={searchIsbn}
                  onChange={(e) => setSearchIsbn(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="search-input"
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
            <div className="row g-2 mb-3">
              <div className="col-12 col-md-4">
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
              <div className="col-12 col-md-3">
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
                  onChange={(e) => setSearchLanguage(e.target.value)}
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

          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          {/* Grouped Search Results */}
          {groupedResults.length > 0 && (
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
                          <Button
                            size="sm"
                            variant="warning"
                            className="select-book-btn-header"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectBook(group.books[0], group.books, 0, groupIndex);
                            }}
                            disabled={enriching}
                            style={{ backgroundColor: '#fbbf24', borderColor: '#fbbf24', color: '#1a202c' }}
                          >
                            {enriching && enrichingBookIndex === `group-${groupIndex}-book-0` ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Enriching...
                              </>
                            ) : (
                              'Select & Add'
                            )}
                          </Button>
                        )}
                      </div>
                      
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
                                        variant="warning"
                                        className="select-book-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectBook(book, group.books, bookIndex, groupIndex);
                                        }}
                                        disabled={enriching}
                                        style={{ 
                                          backgroundColor: enriching && enrichingBookIndex === `group-${groupIndex}-book-${bookIndex}` ? 'rgba(251, 191, 36, 0.6)' : '#fbbf24', 
                                          borderColor: '#fbbf24', 
                                          color: '#1a202c',
                                          minWidth: '120px'
                                        }}
                                      >
                                        {enriching && enrichingBookIndex === `group-${groupIndex}-book-${bookIndex}` ? (
                                          <>
                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                            Enriching...
                                          </>
                                        ) : (
                                          'Select & Add'
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

          {/* Simple list view for non-grouped results (fallback) */}
          {groupedResults.length === 0 && searchResults.length > 0 && (
            <div className="search-results">
              <h6 className="results-title">Search Results ({searchResults.length})</h6>
              <div className="results-list">
                {searchResults.map((book, index) => (
                  <div 
                    key={index} 
                    className="result-item"
                    onClick={() => !enriching && handleSelectBook(book, null, null, null, index)}
                    style={{ 
                      opacity: enriching && enrichingBookIndex === `list-${index}` ? 0.6 : enriching ? 0.5 : 1,
                      cursor: enriching ? 'not-allowed' : 'pointer',
                      position: 'relative'
                    }}
                  >
                    {enriching && enrichingBookIndex === `list-${index}` && (
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 10,
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        padding: '20px 30px',
                        borderRadius: '8px',
                        border: '2px solid #fbbf24',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <div className="spinner-border text-warning" role="status" style={{ color: '#fbbf24', width: '2rem', height: '2rem' }}>
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        <div style={{ color: '#fbbf24', fontWeight: '600' }}>Enriching book metadata...</div>
                      </div>
                    )}
                    <div className="result-cover">
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt={book.title} />
                      ) : (
                        <div className="result-cover-placeholder">
                          <BsBook size={24} />
                        </div>
                      )}
                    </div>
                    <div className="result-info">
                      <div className="result-title">{book.title}</div>
                      {book.subtitle && (
                        <div className="result-subtitle">{book.subtitle}</div>
                      )}
                      {book.authors && book.authors.length > 0 && (
                        <div className="result-author">
                          by {Array.isArray(book.authors) ? book.authors.join(', ') : book.authors}
                        </div>
                      )}
                      <div className="result-meta">
                        {book.language && (
                          <Badge bg={getLanguageBadgeVariant(book.language)} className="me-2">
                            {getLanguageDisplay(book.language)}
                          </Badge>
                        )}
                        {book.publishedYear && <span>{book.publishedYear}</span>}
                        {book.publisher && <span>{book.publisher}</span>}
                        {book.isbn && <span>ISBN: {book.isbn}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="manual-entry-section">
          <Button 
            variant="outline-secondary" 
            onClick={handleManualEntry}
            className="manual-entry-btn"
          >
            <BsPlus className="me-2" />
            Add Manually
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default AddBookDialog;
