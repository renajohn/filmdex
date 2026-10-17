import React, { useContext, useEffect, useRef } from 'react';
import FormContext from 'react-bootstrap/FormContext';
import Menu, { MenuChevron } from './Menu';
import { isAppleMobile } from '../../utils/navidrome';
import './field.css';

interface SelectOption {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled: boolean;
  /** The label of its optgroup, a section of the menu. */
  group: string | null;
}

export interface SelectProps {
  value?: string | number | null;
  /** As a select's: `event.target.value` is the value chosen, `event.target.name` the field's. */
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  /** `<option>`s, as in a select, in `<optgroup>`s, fragments or lists if need be. */
  children: React.ReactNode;
  size?: 'sm' | 'lg';
  /** Its own look, by `className`, rather than a form's field: a word to change within a sentence, say. */
  bare?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  title?: string;
  'aria-label'?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}

const textOf = (node: React.ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
};

/** The `<option>`s among the children, however deep in optgroups, fragments and lists. */
const optionsOf = (children: React.ReactNode, group: string | null = null): SelectOption[] => {
  const found: SelectOption[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement<{ value?: unknown; label?: string; disabled?: boolean; children?: React.ReactNode }>(child)) return;
    if (child.type === 'option') {
      const text = textOf(child.props.children);
      found.push({ value: child.props.value == null ? text : String(child.props.value), label: child.props.children, text, disabled: Boolean(child.props.disabled), group });
    } else if (child.type === 'optgroup') {
      found.push(...optionsOf(child.props.children, child.props.label ?? ''));
    } else if (child.type === React.Fragment) {
      found.push(...optionsOf(child.props.children, group));
    }
  });
  return found;
};

/** What a select's onChange is handed: the value chosen, and the field's name. */
const changeEvent = (value: string, name?: string) => {
  const target = { value, name: name ?? '' };
  return { target, currentTarget: target, type: 'change' } as unknown as React.ChangeEvent<HTMLSelectElement>;
};

/**
 * The one select of DexVault's forms. Closed, a field like the others
 * (ui-input, field.css); open, the list is DexVault's Menu, a ✓ on the value. On an
 * iPhone or an iPad, the system's own wheel, easier under a finger.
 */
const Select: React.FC<SelectProps> = ({
  value, onChange, children, size, bare = false, disabled, id, name, className = '', style, autoFocus, title, onKeyDown, onClick, ...rest
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const native = isAppleMobile();
  // In a Form.Group, its controlId, for the group's label to name it.
  const { controlId } = useContext(FormContext);
  const fieldId = id ?? controlId;
  const fieldClass = (bare ? `menu-select menu-select--bare ${className}` : `ui-input${size === 'sm' ? ' ui-input--sm' : ''} menu-select ${className}`).trim();

  useEffect(() => {
    if (autoFocus && !native) triggerRef.current?.focus();
  }, [autoFocus, native]);

  if (native) {
    return (
      <select value={value ?? ''} onChange={onChange} disabled={disabled} id={fieldId} name={name} className={fieldClass} style={style}
        autoFocus={autoFocus} title={title} aria-label={rest['aria-label']} onKeyDown={onKeyDown} onClick={onClick}>
        {children}
      </select>
    );
  }

  const options = optionsOf(children);
  const current = value == null ? '' : String(value);
  // As a select shows its first option when the value is none of them.
  const shown = options.find(option => option.value === current) ?? options[0];
  const placeholder = shown?.value === '';

  return (
    <Menu matchWidth label={rest['aria-label'] ?? title} trigger={(props, open) => (
      <button type="button" {...props} ref={element => { props.ref(element); triggerRef.current = element; }}
        id={fieldId} name={name} className={`${fieldClass}${placeholder ? ' menu-select--placeholder' : ''}`} style={style}
        disabled={disabled} title={title} aria-label={rest['aria-label']}
        onKeyDown={event => { props.onKeyDown(event); onKeyDown?.(event); }}
        onClick={event => { onClick?.(event); props.onClick(event); }}>
        {/* The value, for a form's tests and tools as for a select. */}
        <span className="menu-select__value" data-value={shown?.value ?? ''}>{shown?.label ?? ' '}</span>
        <MenuChevron open={open} />
      </button>
    )}>
      {options.map((option, index) => (
        <React.Fragment key={option.value}>
          {option.group !== null && option.group !== options[index - 1]?.group && <Menu.Section title={option.group} />}
          <Menu.Choice value={option.value} muted={option.value === ''} selected={option.value === shown?.value} disabled={option.disabled}
            onSelect={() => { if (option.value !== current) onChange?.(changeEvent(option.value, name)); }}>
            {option.label}
          </Menu.Choice>
        </React.Fragment>
      ))}
    </Menu>
  );
};

export default Select;
