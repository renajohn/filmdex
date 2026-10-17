import React from 'react';
import './cover.css';

export type CoverTagVariant = 'plain' | 'gold' | 'orange' | 'muted' | 'alert' | 'on';

interface CoverTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * What it says by its colour: plain (white), gold (a format, a shelf),
   * orange (a copy to do again), muted (not known), alert (spiders, snakes, a
   * book lent), on (plain gold: wished, to buy).
   */
  variant?: CoverTagVariant;
  children: React.ReactNode;
}

/**
 * A tag on a cover, a poster or a book's cover, the one look of DexVault
 * (cover.css). Stack several with CoverTagStack.
 */
const CoverTag: React.FC<CoverTagProps> = ({ variant = 'plain', className, children, ...rest }) => (
  <span className={['cover-tag', variant !== 'plain' && `cover-tag--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
    {children}
  </span>
);

interface CoverTagStackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** A column shares one width; a row wraps. */
  direction?: 'column' | 'row';
  children: React.ReactNode;
}

/** Tags together in a corner: a column of one width, or a row. Its own class places it. */
export const CoverTagStack: React.FC<CoverTagStackProps> = ({ direction = 'column', className, children, ...rest }) => (
  <div className={['cover-tag-stack', direction === 'row' && 'cover-tag-stack--row', className].filter(Boolean).join(' ')} {...rest}>
    {children}
  </div>
);

export default CoverTag;
