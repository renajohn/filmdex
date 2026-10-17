import React from 'react';
import './spinner.css';

/**
 * DexVault's spinner (spinner.css): a faint ring and an arc going round it.
 * Grey on its own, for a wait is neither on nor to do; in a button, a field
 * or on a cover, the colour of what it stands in for.
 */
export interface SpinnerProps {
  /** sm 12 px (a small button, beside a word), md 16 px (a button, a field), lg 32 px (a page, a section). */
  size?: 'sm' | 'md' | 'lg';
  /** What it waits for, for screen readers; without it the spinner is only seen. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label, className, style, ...rest }) => (
  <span
    className={['ui-spinner', `ui-spinner--${size}`, className].filter(Boolean).join(' ')}
    style={style}
    {...rest}
    {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
  />
);

/** A page or a section that loads: the large spinner, and what it waits for under it. */
export const Loading: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children = 'Loading…', className }) => (
  <div className={['ui-loading', className].filter(Boolean).join(' ')} role="status">
    <Spinner size="lg" />
    <div className="ui-loading__words">{children}</div>
  </div>
);

export default Spinner;
