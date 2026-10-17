import React, { useState } from 'react';
import Menu from './shared/Menu';
import { BsBook, BsThreeDots, BsPencil, BsTrash, BsClipboard, BsFileEarmark, BsBoxArrowRight } from 'react-icons/bs';
import bookService from '../services/bookService';
import './BookThumbnail.css';
import CoverButton from './shared/CoverButton';
import CoverTag, { CoverTagStack } from './shared/CoverTag';
import { thumbProps } from '../utils/thumb';

interface BookData {
  id: number | string;
  title: string;
  subtitle?: string;
  authors: string | string[];
  cover?: string;
  series?: string;
  seriesNumber?: number | string;
  titleStatus?: string;
  ebookFile?: string;
  urls?: {
    openlibrary?: string;
    [key: string]: string | undefined;
  };
  [key: string]: unknown;
}

interface DropData {
  type: string;
  bookId?: number | string;
  bookData?: BookData;
  seriesName?: string;
  books?: BookData[];
}

interface BookThumbnailProps {
  book: BookData;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disableMenu?: boolean;
  hideInfo?: boolean;
  draggable?: boolean;
  onBookDroppedForSeries?: ((draggedBookId: number | string, draggedBookData: BookData, targetBook: BookData) => void) | null;
  onAddToExistingSeries?: ((bookId: number | string, bookData: BookData, seriesName: string, books: BookData[]) => void) | null;
  onRemoveFromSeries?: (() => void) | null;
  onSeriesMerge?: ((sourceSeries: string, sourceBooks: BookData[], targetSeries: string, targetBooks: BookData[]) => void) | null;
  dataItemId?: number | string;
  dataFirstLetter?: string;
}

const BookThumbnail: React.FC<BookThumbnailProps> = ({ book, onClick, onEdit, onDelete, disableMenu = false, hideInfo = false, draggable = true, onBookDroppedForSeries = null, onAddToExistingSeries = null, onRemoveFromSeries = null, onSeriesMerge = null, dataItemId, dataFirstLetter }) => {
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggable) return;
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'book',
      bookId: book.id,
      bookData: book
    }));
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const types = e.dataTransfer.types;
    if (types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data: DropData = JSON.parse(e.dataTransfer.getData('application/json'));

      // Handle series dropped on this book (only if this book has no series)
      if (data.type === 'series' && data.seriesName && !book.series && onAddToExistingSeries) {
        // Add this standalone book to the dropped series
        onAddToExistingSeries(book.id, book, data.seriesName, data.books || []);
        return;
      }

      // Handle book dropped on this book
      if (data.type === 'book' && data.bookId && data.bookId !== book.id) {
        // Case 1: This book has a series, dragged book has no series
        // -> Add dragged book to this book's series
        if (book.series && !data.bookData?.series && onAddToExistingSeries) {
          onAddToExistingSeries(data.bookId, data.bookData!, book.series, [book]);
        }
        // Case 2: This book has no series, dragged book has a series
        // -> Add this book to the dragged book's series
        else if (!book.series && data.bookData?.series && onAddToExistingSeries) {
          onAddToExistingSeries(book.id, book, data.bookData.series, [data.bookData]);
        }
        // Case 3: Neither book has a series
        // -> Create a new series with both books
        else if (!book.series && !data.bookData?.series && onBookDroppedForSeries) {
          onBookDroppedForSeries(data.bookId, data.bookData!, book);
        }
        // Case 4: Both books have series
        // -> If different series, trigger merge dialog
        else if (book.series && data.bookData?.series && book.series !== data.bookData.series && onSeriesMerge) {
          onSeriesMerge(data.bookData.series, [data.bookData], book.series, [book]);
        }
      }
    } catch (error) {
      console.error('Error parsing drop data:', error);
    }
  };

  const handleEditClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDelete();
  };

  const handleRemoveFromSeriesClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (onRemoveFromSeries) {
      onRemoveFromSeries();
    }
  };

  const handleCopyRef = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
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
            link = book.urls[linkKeys[0]] || '';
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

  const getAuthorDisplay = (): string => {
    if (Array.isArray(book.authors)) {
      return book.authors.join(', ');
    }
    return (book.authors as string) || 'Unknown Author';
  };

  const getCoverImage = (): string | null => {
    return bookService.getImageUrl(book.cover);
  };

  // Enable drop handling if we have any drop handler
  // - Standalone books can accept other standalones (to create series) or series/books-with-series
  // - Books with series can accept standalone books (to add them to the series)
  // - Books with series can accept other books with different series (to merge)
  const canAcceptDrop = onBookDroppedForSeries || onAddToExistingSeries || onSeriesMerge;

  return (
    <div
      className={`book-thumbnail cover-host ${isDragOver ? 'drag-over' : ''}`}
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
        {(book.seriesNumber || book.titleStatus === 'borrowed') && (
          <CoverTagStack className="book-thumbnail-tags">
            {book.seriesNumber && <CoverTag className="book-thumbnail-series-badge">#{book.seriesNumber}</CoverTag>}
            {book.titleStatus === 'borrowed' && <CoverTag variant="alert">Borrowed</CoverTag>}
          </CoverTagStack>
        )}
        {book.ebookFile && (book.ebookFile as string).trim() && (
          <CoverButton
            className="book-thumbnail-ebook-badge"
            reveal="always"
            label="Télécharger l'e-book"
            onClick={async (e: React.MouseEvent) => {
              e.stopPropagation();
              try {
                await bookService.downloadEbook(book.id);
              } catch (error) {
                console.error('Error downloading ebook:', error);
                alert('Erreur lors du telechargement de l\'e-book: ' + (error as Error).message);
              }
            }}
          >
            <BsFileEarmark size={16} />
          </CoverButton>
        )}
        {getCoverImage() ? (
          <img
            {...thumbProps(getCoverImage()!)}
            loading="lazy"
            decoding="async"
            alt={`${book.title} cover`}
            className="book-thumbnail-image"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              if (target.nextSibling) {
                (target.nextSibling as HTMLElement).style.display = 'flex';
              }
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
        <div className="book-thumbnail-menu" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Menu align="end" label="More" trigger={props => (
            <CoverButton {...props} label="More" reveal="always" className="book-thumbnail-dropdown-toggle">
              <BsThreeDots />
            </CoverButton>
          )}>
            <Menu.Item icon={<BsClipboard />} onSelect={() => handleCopyRef()}>Copy ref.</Menu.Item>
            <Menu.Item icon={<BsPencil />} onSelect={() => handleEditClick()}>Edit</Menu.Item>
            {onRemoveFromSeries && (
              <Menu.Item icon={<BsBoxArrowRight />} onSelect={() => handleRemoveFromSeriesClick()}>Remove from series</Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item icon={<BsTrash />} danger onSelect={() => handleDeleteClick()}>Delete</Menu.Item>
          </Menu>
        </div>
      )}
    </div>
  );
};

export default BookThumbnail;
