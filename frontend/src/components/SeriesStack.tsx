
import React, { useRef, useEffect, useState } from 'react';
import { Popover, Overlay, Button } from 'react-bootstrap';
import { BsPencil, BsCheck, BsX, BsPlus } from 'react-icons/bs';
import BookThumbnail from './BookThumbnail';
import './SeriesStack.css';

interface Book {
  id: number;
  title: string;
  seriesNumber?: number | string | null;
  [key: string]: any;
}

interface SeriesStackProps {
  seriesName: string;
  books: Book[];
  onBookClick: (book: Book) => void;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
  isExpanded: boolean;
  onToggleExpanded?: () => void;
  sortedBooks?: Book[];
  onClose?: (e: any) => void;
  onBookDropped?: (bookId: number, bookData: any, seriesName: string, books: Book[]) => void;
  onSeriesMerge?: (fromSeriesName: string, fromBooks: Book[], toSeriesName: string, toBooks: Book[]) => void;
  onSeriesRename?: (oldName: string, newName: string, books: Book[]) => Promise<void>;
  onRemoveFromSeries?: (book: Book) => void;
  onAddBooksToSeries?: (seriesName: string, books: Book[]) => void;
  dataFirstLetter?: string;
  totalCount?: number;
}

const SeriesStack: React.FC<SeriesStackProps> = ({ seriesName, books, onBookClick, onEdit, onDelete, isExpanded, onToggleExpanded, sortedBooks, onClose, onBookDropped, onSeriesMerge, onSeriesRename, onRemoveFromSeries, onAddBooksToSeries, dataFirstLetter, totalCount }) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(seriesName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Reset edited name when series name changes
  useEffect(() => {
    setEditedName(seriesName);
  }, [seriesName]);

  const handleStartEditName = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingName(true);
    setEditedName(seriesName);
  };

  const handleSaveName = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    const newName = editedName.trim();
    if (newName && newName !== seriesName && onSeriesRename) {
      await onSeriesRename(seriesName, newName, books);
    }
    setIsEditingName(false);
  };

  const handleCancelEditName = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    setIsEditingName(false);
    setEditedName(seriesName);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName(e);
    } else if (e.key === 'Escape') {
      handleCancelEditName(e);
    }
  };


  // Make the stack draggable
  const handleDragStart = (e: React.DragEvent) => {
    // Don't start drag if clicking on menu
    if ((e.target as HTMLElement).closest('.book-thumbnail-menu')) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'series',
      seriesName: seriesName,
      books: books
    }));
    e.dataTransfer.effectAllowed = 'move';
    if (targetRef.current) {
      targetRef.current.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (targetRef.current) {
      targetRef.current.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if it's a book or series being dragged
    const types = e.dataTransfer.types;
    if (types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're actually leaving the stack (outer div)
    if (!targetRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));

      if (data.type === 'series' && data.seriesName && onSeriesMerge) {
        // Another series is being dropped on this one - merge them
        if (data.seriesName !== seriesName) {
          onSeriesMerge(data.seriesName, data.books, seriesName, books);
        }
      } else if (data.type === 'book' && data.bookId && onBookDropped) {
        // A single book is being dropped
        const isAlreadyInSeries = books.some(b => b.id === data.bookId);
        if (!isAlreadyInSeries) {
          onBookDropped(data.bookId, data.bookData, seriesName, books);
        }
      }
    } catch (error) {
      console.error('Error parsing drop data:', error);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Toujours ouvrir le tas, même si on clique sur un livre
    // Sauf si on clique sur le menu (edit/delete)
    if ((e.target as HTMLElement).closest('.book-thumbnail-menu')) {
      return;
    }
    if (onToggleExpanded) {
      onToggleExpanded();
    }
  };

  const handleBookClick = (book: Book) => {
    onBookClick(book);
  };

  const handleEdit = (book: Book, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onEdit(book);
  };

  const handleDelete = (book: Book, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDelete(book);
  };

  // Handle clicks outside the popover to close it and cancel the click event
  useEffect(() => {
    if (!isExpanded) return;

    const handleDocumentClick = (e: MouseEvent) => {
      // Check if click is outside the popover and the stack container
      const popoverElement = document.querySelector('#series-expansion-popover');
      const clickedInsidePopover = popoverElement && popoverElement.contains(e.target as Node);
      const clickedInsideStack = containerRef.current && containerRef.current.contains(e.target as Node);

      // Also check if clicking on a modal (don't close in that case)
      const modalBackdrop = document.querySelector('.modal-backdrop');
      const modal = document.querySelector('.modal.show, .book-detail-modal');
      if (modalBackdrop || modal) {
        return;
      }

      if (!clickedInsidePopover && !clickedInsideStack) {
        // Click is outside, close the popover and prevent the event
        e.preventDefault();
        e.stopPropagation();
        if (onClose) {
          onClose(e);
        }
      }
    };

    // Use capture phase to catch the event early
    document.addEventListener('click', handleDocumentClick, true);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [isExpanded, onClose]);

  // Use provided sortedBooks or sort them
  const displayBooks = sortedBooks || [...books].sort((a, b) => {
    const numA = a.seriesNumber != null ? Number(a.seriesNumber) : 999999;
    const numB = b.seriesNumber != null ? Number(b.seriesNumber) : 999999;
    if (isNaN(numA) && isNaN(numB)) return a.title.localeCompare(b.title);
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return numA - numB;
  });

  return (
    <>
      <div
        ref={targetRef}
        className={`series-stack ${isExpanded ? 'expanded' : ''} ${isDragOver ? 'drag-over' : ''}`}
        onClick={handleClick}
        draggable={!isExpanded}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative' }}
        {...(dataFirstLetter ? { 'data-first-letter': dataFirstLetter } : {})}
      >
        <div ref={containerRef} className="series-stack-container">
          {/* Invisible drag handle overlay */}
          {!isExpanded && (
            <div className="series-stack-drag-overlay" />
          )}
          {displayBooks.slice(0, 3).map((book, index) => {
            let rotation = 0;
            let offsetX = 0;
            let offsetY = 0;
            if (index === 1) {
              rotation = 4;
              offsetX = 0;
              offsetY = 0;
            } else if (index === 2) {
              rotation = -4;
              offsetX = 0;
              offsetY = 0;
            }

            const zIndex = 3 - index;

            return (
              <div
                key={book.id}
                className={`series-stack-item ${index === 0 ? 'series-stack-item-first' : ''}`}
                style={{
                  transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${rotation}deg)`,
                  zIndex: zIndex,
                }}
              >
                <BookThumbnail
                  book={book as any}
                  draggable={false}
                  onClick={() => {
                    if (onToggleExpanded) {
                      onToggleExpanded();
                    }
                  }}
                  onEdit={() => handleEdit(book)}
                  onDelete={() => handleDelete(book)}
                  hideInfo={true}
                />
              </div>
            );
          })}
        </div>
        <div className="series-stack-label">
          <span className="series-stack-name">{seriesName}</span>
          <span className="series-stack-count">
            {totalCount && totalCount !== books.length
              ? `(${books.length}/${totalCount})`
              : `(${books.length})`}
          </span>
        </div>
      </div>

      {/* Dark overlay backdrop when popover is open */}
      {isExpanded && (
        <div
          className="series-popover-backdrop"
          onClick={(e) => {
            // Close popover when clicking on backdrop
            e.preventDefault();
            e.stopPropagation();
            if (onClose) {
              onClose(e);
            }
          }}
        />
      )}

      {isExpanded && sortedBooks && containerRef.current && (
        <Overlay
          show={isExpanded}
          target={containerRef.current}
          placement="bottom"
          rootClose
          onHide={(e: any) => {
            // Prevent closing if a modal is open (check for modal backdrop or modal element)
            const modalBackdrop = document.querySelector('.modal-backdrop');
            const modal = document.querySelector('.modal.show, .book-detail-modal');
            if (modalBackdrop || modal) {
              return;
            }
            if (onClose) {
              onClose(e);
            }
          }}
        >
          <Popover
            id="series-expansion-popover"
            className="series-expansion-popover"
          >
            <Popover.Header>
              <div className="series-expansion-header">
                {isEditingName ? (
                  <div className="series-name-edit">
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={handleNameKeyDown}
                      className="series-name-input"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button className="series-name-btn save" onClick={handleSaveName} title="Save">
                      <BsCheck size={18} />
                    </button>
                    <button className="series-name-btn cancel" onClick={handleCancelEditName} title="Cancel">
                      <BsX size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="series-name-display">
                    <h4 className="series-expansion-title">{seriesName}</h4>
                    {onSeriesRename && (
                      <button className="series-name-btn edit" onClick={handleStartEditName} title="Edit series name">
                        <BsPencil size={14} />
                      </button>
                    )}
                  </div>
                )}
                <span className="series-expansion-count">
                  {totalCount && totalCount !== sortedBooks.length
                    ? `${sortedBooks.length}/${totalCount} books`
                    : `${sortedBooks.length} books`}
                </span>
              </div>
            </Popover.Header>
            <Popover.Body>
              <div className="series-expansion-books">
                {sortedBooks.map((book, index) => (
                  <div
                    key={book.id}
                    className="series-expansion-book-item"
                    style={{
                      animationDelay: `${index * 0.03}s`,
                    }}
                  >
                    <BookThumbnail
                      book={book as any}
                      onClick={() => onBookClick(book)}
                      onEdit={() => onEdit(book)}
                      onDelete={() => onDelete(book)}
                      onRemoveFromSeries={onRemoveFromSeries ? () => onRemoveFromSeries(book) : null}
                    />
                  </div>
                ))}
              </div>
              {onAddBooksToSeries && (
                <div className="series-expansion-footer">
                  <Button
                    variant="outline-success"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddBooksToSeries(seriesName, books);
                    }}
                  >
                    <BsPlus size={18} className="me-1" />
                    Add Books to Series
                  </Button>
                </div>
              )}
            </Popover.Body>
          </Popover>
        </Overlay>
      )}
    </>
  );
};

export default SeriesStack;
