import React, { forwardRef } from 'react';
import './button.css';

/**
 * The buttons of DexVault (button.css), as CoverButton is on covers.
 *
 * - primary: plain gold, the one action a window is for (Play, Save, Rename).
 *   One per window; a destructive action never takes it.
 * - secondary: the glass of the menus and covers, a light edge.
 * - quiet: words alone, a veil under the pointer (Cancel, See more).
 * - danger: red words; in a confirmation it stands where the gold would.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Before the words. */
  icon?: React.ReactNode;
  /** Under way: a spinner in place of the icon, and no second click. */
  loading?: boolean;
  /** On: in Listen Next, wished. Gold words on a gold-tinted glass. */
  active?: boolean;
  /** As wide as its place. */
  block?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary', size = 'md', icon, loading = false, active, block = false, className, disabled, type = 'button', children, ...rest
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={[
      'ui-button',
      `ui-button--${variant}`,
      size === 'sm' && 'ui-button--sm',
      active && 'ui-button--on',
      block && 'ui-button--block',
      className,
    ].filter(Boolean).join(' ')}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...(active !== undefined ? { 'aria-pressed': active } : {})}
    {...rest}
  >
    {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : icon && <span className="ui-button__icon" aria-hidden="true">{icon}</span>}
    {children != null && children !== false && <span className="ui-button__label">{children}</span>}
  </button>
));

Button.displayName = 'Button';

export interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  /** Opens in a tab of its own, as a page elsewhere (Ricardo, Navidrome). */
  external?: boolean;
}

/** A link that looks like a Button: it goes somewhere rather than doing something. */
export const LinkButton: React.FC<LinkButtonProps> = ({
  variant = 'secondary', size = 'md', icon, external = false, className, children, ...rest
}) => (
  <a
    className={['ui-button', `ui-button--${variant}`, size === 'sm' && 'ui-button--sm', className].filter(Boolean).join(' ')}
    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    {...rest}
  >
    {icon && <span className="ui-button__icon" aria-hidden="true">{icon}</span>}
    <span className="ui-button__label">{children}</span>
  </a>
);

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** What it does, for the tooltip and screen readers: an icon alone says nothing. */
  label: string;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  /** confirm: gold (✓ beside a field); danger: red under the pointer (a bin). */
  tone?: 'default' | 'confirm' | 'danger';
  /** On a glass of its own, when it stands alone in a bar. */
  boxed?: boolean;
  /** On: gold. */
  active?: boolean;
  loading?: boolean;
}

/** An icon alone, in a rounded square: a ✕ that closes, a pencil, a bin. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  label, size = 'md', tone = 'default', boxed = false, active, loading = false, className, title, disabled, type = 'button', children, ...rest
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={[
      'ui-icon-button',
      size === 'sm' && 'ui-icon-button--sm',
      tone !== 'default' && `ui-icon-button--${tone}`,
      boxed && 'ui-icon-button--boxed',
      active && 'ui-icon-button--on',
      className,
    ].filter(Boolean).join(' ')}
    aria-label={label}
    title={title ?? label}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...(active !== undefined ? { 'aria-pressed': active } : {})}
    {...rest}
  >
    {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : children}
  </button>
));

IconButton.displayName = 'IconButton';

export default Button;
