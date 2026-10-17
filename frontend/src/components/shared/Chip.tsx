import React from 'react';
import { BsX } from 'react-icons/bs';
import './chip.css';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** A number after the words: how many there are. */
  count?: React.ReactNode;
  /** On: the filter is applied. Gold words on a gold tint. Leave undefined for a chip that only acts. */
  active?: boolean;
  /** quiet: nothing there (an empty shelf), half seen. */
  muted?: boolean;
  /** What its words mean, as a cover's tags: gold a shelf, alert what has no room. */
  tone?: 'default' | 'gold' | 'alert';
  /** A filter in place, with a ✕ to take it away; the chip itself does nothing else. */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * A pill (chip.css): a filter to turn on or off, a shelf to jump to, a filter
 * in place with its ✕. Rounded, small, the menus' glass; on, gold.
 */
const Chip: React.FC<ChipProps> = ({
  children, icon, count, active, muted = false, tone = 'default', onRemove, removeLabel, className, type = 'button', ...rest
}) => {
  const classes = ['ui-chip', active && 'ui-chip--on', muted && 'ui-chip--muted', tone !== 'default' && `ui-chip--${tone}`, onRemove && 'ui-chip--removable', className].filter(Boolean).join(' ');
  const content = (
    <>
      {icon && <span className="ui-chip__icon" aria-hidden="true">{icon}</span>}
      <span className="ui-chip__label">{children}</span>
      {count != null && <span className="ui-chip__count">{count}</span>}
    </>
  );
  if (onRemove) {
    return (
      <span className={classes}>
        {content}
        <button type="button" className="ui-chip__remove" onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'} title={removeLabel ?? 'Remove'}>
          <BsX aria-hidden="true" />
        </button>
      </span>
    );
  }
  return (
    <button type={type} className={classes} {...(active !== undefined ? { 'aria-pressed': active } : {})} {...rest}>
      {content}
    </button>
  );
};

export default Chip;
