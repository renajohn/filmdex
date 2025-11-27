import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsBook, BsThreeDots, BsPencil, BsTrash, BsClipboard, BsFileEarmark, BsBoxArrowRight } from 'react-icons/bs';
import bookService from '../services/bookService';
import './BookThumbnail.css';

const BookThumbnail = ({ book, onClick, onEdit, onDelete, disableMenu = false, hideInfo = false, draggable = true, onBookDroppedForSeries = null, onAddToExistingSeries = null, onRemoveFromSeries = null, onSeriesMerge = null, dataItemId, dataFirstLetter }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e) => {
    if (!draggable) return;
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'book',
      bookId: book.id,
      bookData: book
    }));
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const types = e.dataTransfer.types;
    if (types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      // Handle series dropped on this book (only if this book has no series)
      if (data.type === 'series' && data.seriesName && !book.series && onAddToExistingSeries) {
        // Add this standalone book to the dropped series
        onAddToExistingSeries(book.id, book, data.seriesName, data.books);
        return;
      }
      
      // Handle book dropped on this book
      if (data.type === 'book' && data.bookId && data.bookId !== book.id) {
        // Case 1: This book has a series, dragged book has no series
        // → Add dragged book to this book's series
        if (book.series && !data.bookData.series && onAddToExistingSeries) {
          onAddToExistingSeries(data.bookId, data.bookData, book.series, [book]);
        }
        // Case 2: This book has no series, dragged book has a series
        // → Add this book to the dragged book's series
        else if (!book.series && data.bookData.series && onAddToExistingSeries) {
          onAddToExistingSeries(book.id, book, data.bookData.series, [data.bookData]);
        } 
        // Case 3: Neither book has a series
        // → Create a new series with both books
        else if (!book.series && !data.bookData.series && onBookDroppedForSeries) {
          onBookDroppedForSeries(data.bookId, data.bookData, book);
        }
        // Case 4: Both books have series
        // → If different series, trigger merge dialog
        else if (book.series && data.bookData.series && book.series !== data.bookData.series && onSeriesMerge) {
          onSeriesMerge(data.bookData.series, [data.bookData], book.series, [book]);
        }
      }
    } catch (error) {
      console.error('Error parsing drop data:', error);
    }
  };

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
  };

  const handleRemoveFromSeriesClick = (e) => {
    e.stopPropagation();
    if (onRemoveFromSeries) {
      onRemoveFromSeries();
    }
  };

  const handleCopyRef = async (e) => {
    e.stopPropagation();
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

  const getAuthorDisplay = () => {
    if (Array.isArray(book.authors)) {
      return book.authors.join(', ');
    }
    return book.authors || 'Unknown Author';
  };

  const getCoverImage = () => {
    return bookService.getImageUrl(book.cover);
  };

  // Enable drop handling if we have any drop handler
  // - Standalone books can accept other standalones (to create series) or series/books-with-series
  // - Books with series can accept standalone books (to add them to the series)
  // - Books with series can accept other books with different series (to merge)
  const canAcceptDrop = onBookDroppedForSeries || onAddToExistingSeries || onSeriesMerge;

  return (
    <div 
      className={`book-thumbnail ${isDragOver ? 'drag-over' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={canAcceptDrop ? handleDragOver : undefined}
      onDragEnter={canAcceptDrop ? handleDragEnter : undefined}
      onDragLeave={canAcceptDrop ? handleDragLeave : undefined}
      onDrop={canAcceptDrop ? handleDrop : undefined}
      {...(dataItemId ? { 'data-item-id': dataItemId } : {})}
      {...(dataFirstLetter ? { 'data-first-letter': dataFirstLetter } : {})}
    >
      <div className="book-thumbnail-cover">
        {book.titleStatus === 'borrowed' && (
          <div className="book-thumbnail-borrowed-ribbon">
            Borrowed
          </div>
        )}
        {book.seriesNumber && (
          <div className="book-thumbnail-series-badge">
            #{book.seriesNumber}
          </div>
        )}
        {book.ebookFile && book.ebookFile.trim() && (
          <div 
            className="book-thumbnail-ebook-badge" 
            title="Télécharger l'e-book"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await bookService.downloadEbook(book.id);
              } catch (error) {
                console.error('Error downloading ebook:', error);
                alert('Erreur lors du téléchargement de l\'e-book: ' + error.message);
              }
            }}
          >
            <BsFileEarmark size={18} />
          </div>
        )}
        {getCoverImage() ? (
          <img 
            src={getCoverImage()} 
            alt={`${book.title} cover`}
            className="book-thumbnail-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className="book-thumbnail-placeholder"
          style={{ display: getCoverImage() ? 'none' : 'flex' }}
        >
          <BsBook size={32} />
        </div>
      </div>
      
      {!hideInfo && (
        <div className="book-thumbnail-info">
          <h6 className="book-thumbnail-title" title={book.title}>
            {book.title}
          </h6>
          <p className="book-thumbnail-author" title={getAuthorDisplay()}>
            {getAuthorDisplay()}
          </p>
        </div>
      )}

      {!disableMenu && (
        <div className="book-thumbnail-menu" onClick={(e) => e.stopPropagation()}>
          <Dropdown align="end">
            <Dropdown.Toggle
              variant="outline-secondary"
              size="sm"
              className="book-thumbnail-dropdown-toggle"
            >
              <BsThreeDots />
            </Dropdown.Toggle>
            
            <Dropdown.Menu 
              popperConfig={{ 
                strategy: 'fixed',
                modifiers: [
                  { name: 'preventOverflow', options: { boundary: 'viewport' } }
                ]
              }}
              renderOnMount
            >
              <Dropdown.Item onClick={handleCopyRef}>
                <BsClipboard className="me-2" /> Copy ref.
              </Dropdown.Item>
              <Dropdown.Item onClick={handleEditClick}>
                <BsPencil className="me-2" /> Edit
              </Dropdown.Item>
              {onRemoveFromSeries && (
                <Dropdown.Item onClick={handleRemoveFromSeriesClick}>
                  <BsBoxArrowRight className="me-2" /> Remove from series
                </Dropdown.Item>
              )}
              <Dropdown.Item onClick={handleDeleteClick} className="text-danger">
                <BsTrash className="me-2" /> Delete
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      )}
    </div>
  );
};

export default BookThumbnail;

