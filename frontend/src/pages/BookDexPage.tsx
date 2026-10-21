import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import BookSearchComponent from '../components/BookSearch';
import bookService from '../services/bookService';
import { IconButton } from '../components/shared/Button';
import { BsX } from 'react-icons/bs';
import { toast, toneOf } from '../components/shared/Toast';
import Segmented from '../components/shared/Segmented';
import ReadingJournal from '../components/ReadingJournal';

type BookDexView = 'library' | 'reading';
const VIEW = 'dv.bookdexView';
const rememberedView = (): BookDexView => { try { return localStorage.getItem(VIEW) === 'reading' ? 'reading' : 'library'; } catch { return 'library'; } };

const BookSearch = BookSearchComponent;

interface BookDexPageProps {
  searchCriteria?: any;
}

export interface BookDexPageRef {
  openAddDialog: () => void;
}

const BookDexPage = forwardRef<BookDexPageRef, BookDexPageProps>(({ searchCriteria }, ref) => {
  const location = useLocation();
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const bookSearchRef = useRef<any>(null);
  // The shelves at home, or what one has read (one's own or borrowed): two views of the books.
  const [view, setView] = useState<BookDexView>(rememberedView);
  const chooseView = (next: BookDexView) => { setView(next); try { localStorage.setItem(VIEW, next); } catch { /* a private window */ } };

  // Once: a search in the URL (a pill, a filter taken away) must not reload every book,
  // which made the shelves flicker at each click.
  useEffect(() => {
    loadBooks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
      const data = await bookService.getAllBooks() as any[];
      setBooks(data);
    } catch (error) {
      console.error('Error loading books:', error);
      showAlertMessage('Failed to load books: ' + (error as Error).message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const showAlertMessage = (message: string, type: string = 'success') => {
    toast(message, { tone: toneOf(type) });
  };

  const handleAddBook = async (bookData: any) => {
    try {
      const createdBook = await bookService.addBook(bookData);
      await loadBooks();
      showAlertMessage('Book added successfully!', 'success');
      return createdBook;
    } catch (error) {
      console.error('Error adding book:', error);
      // For duplicate book errors, don't show alert here - let onAddError handle it
      // This ensures consistent error display via Bootstrap alert
      const errorMessage = (error as Error).message || 'Failed to add book';
      if (!errorMessage.toLowerCase().includes('already exists')) {
        // Only show alert for non-duplicate errors
        showAlertMessage('Failed to add book: ' + errorMessage, 'danger');
      }
      throw error;
    }
  };

  const handleUpdateBook = async (id: number | string, bookData: any) => {
    try {
      await bookService.updateBook(id, bookData);
      await loadBooks();
      showAlertMessage('Book updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating book:', error);
      showAlertMessage('Failed to update book: ' + (error as Error).message, 'danger');
    }
  };

  const handleDeleteBook = async (id: number | string) => {
    try {
      await bookService.deleteBook(id);
      await loadBooks();
      showAlertMessage('Book deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting book:', error);
      showAlertMessage('Failed to delete book: ' + (error as Error).message, 'danger');
    }
  };

  // First in the bar, as MusicDex's Digital: the shelves or the journal.
  const viewSwitch = (
    <Segmented
      label="Books"
      kind="tabs"
      size="sm"
      value={view}
      onChange={chooseView}
      options={[{ value: 'library', label: 'Library' }, { value: 'reading', label: 'Reading' }]}
    />
  );

  return (
    <div className="bookdex-page">
      {view === 'reading' ? <ReadingJournal viewSwitch={viewSwitch} searchCriteria={searchCriteria} /> : (
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
        viewSwitch={viewSwitch}
      />
      )}

    </div>
  );
});

BookDexPage.displayName = 'BookDexPage';

export default BookDexPage;
