import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsBook, BsThreeDots, BsPencil, BsTrash, BsClipboard } from 'react-icons/bs';
import bookService from '../services/bookService';
import './BookThumbnail.css';

const BookThumbnail = ({ book, onClick, onEdit, onDelete, disableMenu = false, hideInfo = false }) => {
  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
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

  return (
    <div className="book-thumbnail" onClick={onClick}>
      <div className="book-thumbnail-cover">
        {book.titleStatus === 'borrowed' && (
          <div className="book-thumbnail-borrowed-ribbon">
            Borrowed
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
            
            <Dropdown.Menu>
              <Dropdown.Item onClick={handleCopyRef}>
                <BsClipboard className="me-2" /> Copy ref.
              </Dropdown.Item>
              <Dropdown.Item onClick={handleEditClick}>
                <BsPencil className="me-2" /> Edit
              </Dropdown.Item>
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

