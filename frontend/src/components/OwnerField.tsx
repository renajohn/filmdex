import React, { useEffect, useMemo, useRef, useState } from 'react';
import bookService from '../services/bookService';
import { TextField } from './shared/TextField';
import './shared/menu.css';
import './OwnerField.css';

interface OwnerFieldProps {
  value: string;
  onChange: (owner: string) => void;
  placeholder?: string;
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Whose a book is, among the owners the library knows (Oriane, Alice,
 * Renault, Violaine): their list opens with the field and narrows as one
 * types, as in a book's card; another name is kept as typed.
 */
const OwnerField: React.FC<OwnerFieldProps> = ({ value, onChange, placeholder }) => {
  const [owners, setOwners] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    bookService.getAutocompleteSuggestions('owner', '')
      .then(found => {
        if (!live) return;
        const names = ((found || []) as Array<string | { owner?: string }>).map(s => (typeof s === 'string' ? s : s?.owner || '')).filter(Boolean);
        setOwners([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => {
    const words = plain(value);
    return owners.filter(owner => !words || plain(owner).includes(words)).filter(owner => owner !== value);
  }, [owners, value]);

  const choose = (owner: string) => { onChange(owner); setOpen(false); setActive(-1); };

  return (
    <div className="owner-field" ref={boxRef}
      onBlur={event => { if (!boxRef.current?.contains(event.relatedTarget as Node)) setOpen(false); }}>
      <TextField value={value} placeholder={placeholder} autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (!open || !shown.length) return;
          if (event.key === 'ArrowDown') { setActive(i => Math.min(i + 1, shown.length - 1)); event.preventDefault(); }
          if (event.key === 'ArrowUp') { setActive(i => Math.max(i - 1, 0)); event.preventDefault(); }
          if (event.key === 'Enter' && active >= 0) { choose(shown[active]); event.preventDefault(); }
          if (event.key === 'Escape') setOpen(false);
        }} />
      {open && shown.length > 0 && (
        <div className="owner-field__list menu-surface" role="listbox">
          {shown.map((owner, index) => (
            <button key={owner} type="button" role="option" aria-selected={index === active}
              className={`menu-item${index === active ? ' menu-item--active' : ''}`}
              onMouseDown={event => event.preventDefault()} onClick={() => choose(owner)}>
              {owner}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default OwnerField;
