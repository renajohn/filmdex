import React from 'react';
import { BsBookshelf } from 'react-icons/bs';
import { useShelfLocation } from '../../utils/shelfLocations';
import './ShelfCode.css';

interface ShelfCodeProps {
  kind: 'movie' | 'album';
  id: number | string | null | undefined;
  /** "overlay" sits on a poster or cover; "inline" beside a title. */
  variant?: 'overlay' | 'inline';
  className?: string;
}

/** Where to find the film or CD: its shelf, "B-3", or the place it is kept in. Nothing until the furniture gives it one. */
const ShelfCode: React.FC<ShelfCodeProps> = ({ kind, id, variant = 'overlay', className }) => {
  const where = useShelfLocation(kind, id);
  if (!where) return null;
  return (
    <span className={`shelf-code-badge shelf-code-${variant}${className ? ` ${className}` : ''}`} title={`On the shelves: ${where}`}>
      {variant === 'inline' && <BsBookshelf aria-hidden="true" />}
      {where}
    </span>
  );
};

export default ShelfCode;
