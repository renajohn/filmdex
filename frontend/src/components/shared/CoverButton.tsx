import React, { forwardRef } from 'react';
import './cover.css';

export interface CoverButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** What it does, for the tooltip and screen readers: "Add to Watch Next". */
  label: string;
  /** On: in Listen or Watch Next, wished, playing. Plain gold, always in sight. Leave undefined for a button with no on state. */
  active?: boolean;
  size?: 'small' | 'normal' | 'large';
  /** When it shows: while its card (class cover-host) is hovered, half seen until then, or always. */
  reveal?: 'hover' | 'dim' | 'always';
  children: React.ReactNode;
}

/**
 * A round button on a cover, a poster or a book's cover, the one look of
 * DexVault (cover.css). Its own stylesheet only places it in a corner.
 */
const CoverButton = forwardRef<HTMLButtonElement, CoverButtonProps>(({
  label, active, size = 'normal', reveal = 'hover', className, title, type = 'button', children, ...rest
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={[
      'cover-button',
      size !== 'normal' && `cover-button--${size}`,
      `cover-button--reveal-${reveal}`,
      active && 'cover-button--on',
      className,
    ].filter(Boolean).join(' ')}
    aria-label={label}
    title={title ?? label}
    {...(active !== undefined ? { 'aria-pressed': active } : {})}
    {...rest}
  >
    {children}
  </button>
));

CoverButton.displayName = 'CoverButton';

export default CoverButton;
