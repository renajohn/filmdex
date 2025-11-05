import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsBook, BsThreeDots, BsPencil, BsTrash } from 'react-icons/bs';
import bookService from '../services/bookService';
import './BookThumbnail.css';

const BookThumbnail = ({ book, onClick, onEdit, onDelete, disableMenu = false }) => {
  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
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
        {book.borrowed && (
          <div className="book-thumbnail-borrowed-ribbon">
            Read & Gone
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
      
      <div className="book-thumbnail-info">
        <h6 className="book-thumbnail-title" title={book.title}>
          {book.title}
        </h6>
        <p className="book-thumbnail-author" title={getAuthorDisplay()}>
          {getAuthorDisplay()}
        </p>
      </div>

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

