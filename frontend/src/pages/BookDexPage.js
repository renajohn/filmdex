import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import BookSearch from '../components/BookSearch';
import bookService from '../services/bookService';

const BookDexPage = forwardRef(({ searchCriteria }, ref) => {
  const location = useLocation();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success');
  const [showAlert, setShowAlert] = useState(false);
  const bookSearchRef = useRef(null);

  useEffect(() => {
    loadBooks();
    
    // Check for URL search parameters
    const urlParams = new URLSearchParams(location.search);
    const searchParam = urlParams.get('search');
    if (searchParam && bookSearchRef.current) {
      // Set the search query in the BookSearch component
      bookSearchRef.current.setSearchQuery(searchParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Check if we're in wishlist mode
  const urlParams = new URLSearchParams(location.search);
  const isWishlistMode = urlParams.get('mode') === 'wishlist';

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    openAddDialog: () => {
      if (bookSearchRef.current) {
        bookSearchRef.current.openAddDialog();
      }
    }
  }));

  const handleOpenAddDialog = () => {
    if (bookSearchRef.current) {
      bookSearchRef.current.openAddDialog();
    }
  };

  const loadBooks = async () => {
    try {
      setLoading(true);
      // getAllBooks() now returns both 'owned' and 'borrowed' books (excludes 'wish')
      const data = await bookService.getAllBooks();
      setBooks(data);
    } catch (error) {
      console.error('Error loading books:', error);
      showAlertMessage('Failed to load books: ' + error.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const showAlertMessage = (message, type = 'success') => {
    setAlertMessage(message);
    setAlertType(type);
    setShowAlert(true);
    setTimeout(() => {
      setShowAlert(false);
    }, 5000);
  };

  const handleAddBook = async (bookData) => {
    try {
      const createdBook = await bookService.addBook(bookData);
      await loadBooks();
      showAlertMessage('Book added successfully!', 'success');
      return createdBook;
    } catch (error) {
      console.error('Error adding book:', error);
      showAlertMessage('Failed to add book: ' + error.message, 'danger');
      throw error;
    }
  };

  const handleUpdateBook = async (id, bookData) => {
    try {
      await bookService.updateBook(id, bookData);
      await loadBooks();
      showAlertMessage('Book updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating book:', error);
      showAlertMessage('Failed to update book: ' + error.message, 'danger');
    }
  };

  const handleDeleteBook = async (id) => {
    try {
      await bookService.deleteBook(id);
      await loadBooks();
      showAlertMessage('Book deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting book:', error);
      showAlertMessage('Failed to delete book: ' + error.message, 'danger');
    }
  };

  return (
    <div className="bookdex-page">
      <BookSearch
        ref={bookSearchRef}
        books={books}
        loading={loading}
        onAddBook={handleAddBook}
        onUpdateBook={handleUpdateBook}
        onDeleteBook={handleDeleteBook}
        onShowAlert={showAlertMessage}
        onOpenAddDialog={handleOpenAddDialog}
        refreshTrigger={books.length}
        searchCriteria={searchCriteria}
        defaultTitleStatus={isWishlistMode ? 'wish' : undefined}
      />

      {/* Alert */}
      {showAlert && (
        <div className={`alert alert-${alertType} alert-dismissible fade show position-fixed`} 
             style={{ top: '20px', right: '20px', zIndex: 9999 }}>
          {alertMessage}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setShowAlert(false)}
          ></button>
        </div>
      )}
    </div>
  );
});

BookDexPage.displayName = 'BookDexPage';

export default BookDexPage;


