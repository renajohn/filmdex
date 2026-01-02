import React, { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Grid } from 'react-window';
import './VirtualizedMovieGrid.css';

// Constants for grid sizing
const CARD_MIN_WIDTH = 180;
const GAP = 20;

// Cell component for react-window v2
const GridCell = memo(({ 
  columnIndex, 
  rowIndex, 
  style,
  // Custom props passed via cellProps
  items,
  columnCount,
  cardWidth,
  renderCard,
}) => {
  const index = rowIndex * columnCount + columnIndex;
  
  if (index >= items.length) {
    return null;
  }

  const { movie, letter } = items[index];
  
  // Adjust style for gap handling
  const adjustedStyle = {
    ...style,
    left: parseFloat(style.left) + GAP,
    top: parseFloat(style.top) + GAP,
    width: cardWidth,
    height: parseFloat(style.height) - GAP,
    padding: 0,
  };

  return (
    <div style={adjustedStyle} className="virtual-grid-cell">
      {renderCard(movie, true, letter)}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders
  const prevIndex = prevProps.rowIndex * prevProps.columnCount + prevProps.columnIndex;
  const nextIndex = nextProps.rowIndex * nextProps.columnCount + nextProps.columnIndex;
  
  if (prevIndex >= prevProps.items.length && nextIndex >= nextProps.items.length) {
    return true; // Both empty, no need to re-render
  }
  
  const prevMovie = prevProps.items[prevIndex]?.movie;
  const nextMovie = nextProps.items[nextIndex]?.movie;
  
  return (
    prevMovie?.id === nextMovie?.id &&
    prevProps.style?.top === nextProps.style?.top &&
    prevProps.style?.left === nextProps.style?.left &&
    prevProps.cardWidth === nextProps.cardWidth
  );
});

GridCell.displayName = 'GridCell';

const VirtualizedMovieGrid = ({ 
  movies, 
  renderMovieCard,
  sortLoading = false,
  className = ''
}) => {
  const gridRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Use ResizeObserver for reliable dimension detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: rect.height
      });
    };

    // Initial measurement
    updateDimensions();

    // Set up ResizeObserver
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  
  // Calculate number of columns based on container width
  const getColumnCount = useCallback((width) => {
    if (width <= 0) return 1;
    // Calculate how many cards fit with minimum width and gaps
    const availableWidth = width - GAP;
    const cardWithGap = CARD_MIN_WIDTH + GAP;
    return Math.max(1, Math.floor(availableWidth / cardWithGap));
  }, []);

  // Calculate actual card width based on container width and column count
  const getCardWidth = useCallback((width, columnCount) => {
    if (columnCount <= 0) return CARD_MIN_WIDTH;
    // Distribute remaining space evenly
    const totalGaps = (columnCount - 1) * GAP;
    return Math.floor((width - totalGaps - GAP * 2) / columnCount);
  }, []);

  // Prepare items with letter information for alphabetical index
  const itemsWithLetters = useMemo(() => {
    return movies.map(movie => {
      const firstChar = movie.title?.charAt(0)?.toUpperCase() || '';
      const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
      return { movie, letter };
    });
  }, [movies]);

  // Reset scroll when movies change significantly
  useEffect(() => {
    if (gridRef.current?.element) {
      gridRef.current.element.scrollTop = 0;
    }
  }, [movies.length > 0 ? movies[0]?.id : null]);

  if (!movies || movies.length === 0) {
    return null;
  }

  // Use fallback dimensions if container hasn't been measured yet
  const width = dimensions.width || (typeof window !== 'undefined' ? window.innerWidth - 60 : 1200);
  const height = dimensions.height || (typeof window !== 'undefined' ? window.innerHeight - 220 : 600);
  
  const columnCount = getColumnCount(width);
  const rowCount = Math.ceil(movies.length / columnCount);
  const cardWidth = getCardWidth(width, columnCount);
  const cardHeight = Math.floor(cardWidth * 1.5) + GAP; // 2:3 aspect ratio + gap

  return (
    <div 
      ref={containerRef}
      className={`virtualized-movie-grid ${sortLoading ? 'sort-loading' : ''} ${className}`}
    >
      <Grid
        gridRef={gridRef}
        className="virtual-grid"
        columnCount={columnCount}
        columnWidth={cardWidth + GAP}
        rowCount={rowCount}
        rowHeight={cardHeight}
        defaultHeight={height}
        defaultWidth={width}
        overscanCount={3}
        style={{ 
          height, 
          width,
          overflowX: 'hidden',
        }}
        cellComponent={GridCell}
        cellProps={{
          items: itemsWithLetters,
          columnCount,
          cardWidth,
          renderCard: renderMovieCard,
        }}
      />
    </div>
  );
};

export default memo(VirtualizedMovieGrid);
