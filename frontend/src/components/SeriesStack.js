import React, { useRef } from 'react';
import { Popover, Overlay } from 'react-bootstrap';
import BookThumbnail from './BookThumbnail';
import './SeriesStack.css';

const SeriesStack = ({ seriesName, books, onBookClick, onEdit, onDelete, isExpanded, onToggleExpanded, sortedBooks, onClose }) => {
  const targetRef = useRef(null);
  const containerRef = useRef(null);

  const handleClick = (e) => {
    // Toujours ouvrir le tas, même si on clique sur un livre
    // Sauf si on clique sur le menu (edit/delete)
    if (e.target.closest('.book-thumbnail-menu')) {
      return;
    }
    if (onToggleExpanded) {
      onToggleExpanded();
    }
  };

  const handleBookClick = (book) => {
    onBookClick(book);
  };

  const handleEdit = (book, e) => {
    e?.stopPropagation();
    onEdit(book);
  };

  const handleDelete = (book, e) => {
    e?.stopPropagation();
    onDelete(book);
  };

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
        className={`series-stack ${isExpanded ? 'expanded' : ''}`} 
        onClick={handleClick} 
        style={{ position: 'relative' }}
      >
        <div ref={containerRef} className="series-stack-container">
          {displayBooks.slice(0, 3).map((book, index) => {
            // Rotation simple pour l'état normal :
            // - Index 0 (dessus) : 0° (parfaitement droit), centré
            // - Index 1 (dessous) : +4° (légèrement à droite), légèrement décalé
            // - Index 2 : -4° (légèrement à gauche), légèrement décalé
            let rotation = 0;
            let offsetX = 0;
            let offsetY = 0;
            if (index === 1) {
              rotation = 4; // Légèrement à droite
              offsetX = 0; // Pas de décalage
              offsetY = 0; // Pas de décalage
            } else if (index === 2) {
              rotation = -4; // Légèrement à gauche
              offsetX = 0; // Pas de décalage
              offsetY = 0; // Pas de décalage
            }
            
            const zIndex = 3 - index; // Premier livre au-dessus
            
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
                  book={book}
                  onClick={(e) => {
                    // Ne pas ouvrir le livre directement, laisser le parent gérer le clic pour ouvrir le tas
                    e.stopPropagation();
                    if (onToggleExpanded) {
                      onToggleExpanded();
                    }
                  }}
                  onEdit={(e) => handleEdit(book, e)}
                  onDelete={(e) => handleDelete(book, e)}
                  hideInfo={true}
                />
              </div>
            );
          })}
        </div>
        <div className="series-stack-label">
          <span className="series-stack-name">{seriesName}</span>
          <span className="series-stack-count">({books.length})</span>
        </div>
      </div>
      
      {isExpanded && sortedBooks && containerRef.current && (
        <Overlay
          show={isExpanded}
          target={containerRef.current}
          placement="bottom"
          rootClose
          onHide={(e) => {
            // Prevent closing if a modal is open (check for modal backdrop or modal element)
            const modalBackdrop = document.querySelector('.modal-backdrop');
            const modal = document.querySelector('.modal.show, .book-detail-modal');
            if (modalBackdrop || modal) {
              // Don't close the popover if a modal is open
              // The state will be restored by the parent component
              return;
            }
            if (onClose) {
              onClose(e);
            }
          }}
        >
          <Popover id="series-expansion-popover" className="series-expansion-popover">
            <Popover.Header>
              <div className="series-expansion-header">
                <h4 className="series-expansion-title">{seriesName}</h4>
                <span className="series-expansion-count">{sortedBooks.length} books</span>
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
                      book={book}
                      onClick={() => onBookClick(book)}
                      onEdit={() => onEdit(book)}
                      onDelete={() => onDelete(book)}
                    />
                  </div>
                ))}
              </div>
            </Popover.Body>
          </Popover>
        </Overlay>
      )}
    </>
  );
};

export default SeriesStack;

