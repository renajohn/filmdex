import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { BsArrowBarDown, BsChevronLeft, BsChevronRight, BsLock, BsPencil, BsPlusLg, BsTrash, BsUnlock, BsX } from 'react-icons/bs';
import shelvingService, {
  type ShelfLevel, type ShelfSection, type ShelfUnit, type ShelvedItem, type ShelvingPlan,
} from '../services/shelvingService';
import { SECTION_LABELS } from './shelfLabels';

interface Props {
  plan: ShelvingPlan;
  /** Runs a change, then reloads the plan; shows what went wrong. */
  run: (action: () => Promise<unknown>) => Promise<void>;
  /** Shows a shelf's objects in a section's list: the shelf's own, or that of what was put on a free one by hand. */
  onShowShelf: (level: ShelfLevel, section: ShelfSection) => void;
  /** A shelf to open as the tab appears, chosen from a section's list. */
  focusLevelId?: number | null;
}

const nextLetter = (units: ShelfUnit[]): string => {
  const taken = new Set(units.map(unit => unit.letter));
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!taken.has(letter)) return letter;
  }
  return '';
};

/** A number from a field, or null when it is empty or not one. */
const numberOf = (value: string): number | null => {
  const parsed = Number(value.replace(',', '.'));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

/** What a shelf is for, as its choices read. */
const SECTION_CHOICES: Array<{ value: ShelfSection | null; label: string; hint: string }> = [
  ...(Object.keys(SECTION_LABELS) as ShelfSection[]).map(key => ({ value: key, label: SECTION_LABELS[key], hint: `Takes the ${SECTION_LABELS[key].toLowerCase()} in order` })),
  { value: null, label: 'Free', hint: 'Only what you put here by hand, such as a box set laid flat' },
];

const sectionClass = (level: ShelfLevel) => (level.section ? `section-${level.section}` : 'free');

/** The first and last object on a shelf, or why there is none. */
const rangeOf = (level: ShelfLevel): string => {
  if (level.count === 0) return level.section ? 'Empty' : 'Nothing put here yet';
  return level.count === 1 ? level.first! : `${level.first} – ${level.last}`;
};

interface PanelProps {
  level: ShelfLevel;
  unit: ShelfUnit;
  /** What stands on it, in order. */
  items: ShelvedItem[];
  run: Props['run'];
  onShowShelf: Props['onShowShelf'];
  onClose: () => void;
}

/** One shelf's setup: what it is for, what it holds, whether it keeps it; and what stands on it. */
const ShelfPanel: React.FC<PanelProps> = ({ level, unit, items, run, onShowShelf, onClose }) => {
  const [capacity, setCapacity] = useState(level.ownCapacity == null ? '' : String(level.ownCapacity));
  const inOrder = level.count - level.pinned;
  const capacityId = `shelf-capacity-${level.id}`;

  const saveCapacity = () => {
    const value = numberOf(capacity);
    if (value === level.ownCapacity) return;
    run(() => shelvingService.updateLevel(level.id, { capacity: value == null ? null : Math.round(value) }));
  };

  return (
    <div className="furniture-panel" role="group" aria-label={`Set up ${level.code}`}>
      <div className="furniture-panel-head">
        <strong>{level.code}</strong>
        <span className="furniture-panel-figures">{level.used} of {level.capacity} cases taken</span>
        <button type="button" className="shelf-edit" aria-label={`Close ${level.code}`} onClick={onClose}><BsX /></button>
      </div>

      <div className="furniture-panel-field">
        <span className="furniture-panel-label">This shelf is for</span>
        <div className="furniture-choices" role="radiogroup" aria-label={`Section of ${level.code}`}>
          {SECTION_CHOICES.map(choice => (
            <button key={choice.label} type="button" role="radio" aria-checked={level.section === choice.value}
              className={`furniture-choice ${choice.value ? `section-${choice.value}` : 'free'} ${level.section === choice.value ? 'active' : ''}`}
              title={choice.hint}
              onClick={() => { if (level.section !== choice.value) run(() => shelvingService.updateLevel(level.id, { section: choice.value })); }}>
              {choice.label}
            </button>
          ))}
        </div>
        <span className="furniture-panel-hint">{SECTION_CHOICES.find(choice => choice.value === level.section)?.hint}.</span>
      </div>

      <div className="furniture-panel-row">
        <Form.Group className="furniture-panel-field" controlId={capacityId}>
          <Form.Label className="furniture-panel-label">Holds</Form.Label>
          <div className="furniture-capacity">
            <Form.Control size="sm" inputMode="numeric" placeholder={String(unit.capacity)} value={capacity}
              onChange={event => setCapacity(event.target.value)} onBlur={saveCapacity}
              onKeyDown={event => { if (event.key === 'Enter') saveCapacity(); }} />
            <span>cases{level.ownCapacity == null ? ', like the rest of the unit' : ` (the unit's hold ${unit.capacity})`}</span>
          </div>
        </Form.Group>

        {level.section && (
          <div className="furniture-panel-field">
            <span className="furniture-panel-label">Once arranged</span>
            <Button size="sm" variant={level.locked ? 'success' : 'outline-secondary'} className="furniture-lock"
              disabled={!level.locked && inOrder === 0}
              title={level.locked ? 'Keeps what it holds now. Click to let the order fill it again.' : inOrder === 0 ? 'Nothing stands on it in order to keep' : 'Keeps what it holds now, whatever comes before in the order'}
              onClick={() => run(() => shelvingService.updateLevel(level.id, { locked: !level.locked }))}>
              {level.locked ? <><BsLock /> Locked: keeps what it holds</> : <><BsUnlock /> Lock what it holds</>}
            </Button>
          </div>
        )}
      </div>

      {level.breakBefore && (
        <div className="furniture-break">
          <BsArrowBarDown aria-hidden="true" />
          <span>No room from <strong>{level.breakBefore}</strong>: it and the ones after went on to the next shelf.</span>
          <Button size="sm" variant="outline-secondary" onClick={() => run(() => shelvingService.updateLevel(level.id, { breakBefore: null }))}>
            Forget
          </Button>
        </div>
      )}

      <div className="furniture-panel-field">
        <span className="furniture-panel-label">
          On it now
          {level.count > 0 && <> · {level.count}{level.pinned > 0 && `, ${level.pinned} by hand`}</>}
        </span>
        {items.length === 0 ? (
          <span className="furniture-panel-hint">
            {level.section ? 'Nothing yet.' : 'Nothing yet: choose this shelf as the Location in an object’s pencil.'}
          </span>
        ) : (
          <ol className="furniture-contents">
            {items.map(item => (
              <li key={`${item.kind}:${item.id}`}>
                {item.sortName}
                {item.pinned && <span className="shelf-tag">by hand</span>}
              </li>
            ))}
          </ol>
        )}
        {items.length > 0 && (
          <button type="button" className="furniture-link" onClick={() => onShowShelf(level, items[0].section)}>
            Open {level.code} in {SECTION_LABELS[items[0].section]} ›
          </button>
        )}
      </div>
    </div>
  );
};

interface UnitProps {
  unit: ShelfUnit;
  first: boolean;
  last: boolean;
  itemsOf: (level: ShelfLevel) => ShelvedItem[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  run: Props['run'];
  onShowShelf: Props['onShowShelf'];
}

/** A unit as it stands: its shelves from the top, each a board to click and set up. */
const UnitColumn: React.FC<UnitProps> = ({ unit, first, last, itemsOf, selected, onSelect, run, onShowShelf }) => {
  const [editing, setEditing] = useState(false);
  const [letter, setLetter] = useState(unit.letter);
  const [levels, setLevels] = useState(String(unit.levels.length));
  const [capacity, setCapacity] = useState(String(unit.capacity));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="furniture-unit" aria-label={`Unit ${unit.letter}`}>
      <div className="furniture-unit-heading">
        <h3>{unit.letter}</h3>
        <span className="furniture-unit-meta">{unit.levels.length} shelves · {unit.capacity} cases each</span>
        <button type="button" className={`shelf-edit ${editing ? 'active' : ''}`} aria-label={`Set up unit ${unit.letter}`}
          aria-expanded={editing} onClick={() => { setEditing(!editing); setConfirmDelete(false); }}><BsPencil /></button>
      </div>
      {editing && (
        <Form className="furniture-unit-edit" onSubmit={event => {
          event.preventDefault();
          run(async () => {
            await shelvingService.updateUnit(unit.id, { letter, levels: Number(levels), capacity: Number(capacity) });
            setEditing(false);
          });
        }}>
          <Form.Group controlId={`unit-${unit.id}-letter`} className="furniture-unit-letter">
            <Form.Label>Letter</Form.Label>
            <Form.Control size="sm" value={letter} onChange={event => setLetter(event.target.value)} />
          </Form.Group>
          <Form.Group controlId={`unit-${unit.id}-levels`}>
            <Form.Label>Shelves</Form.Label>
            <Form.Control size="sm" type="number" min={1} max={20} value={levels} onChange={event => setLevels(event.target.value)} />
          </Form.Group>
          <Form.Group controlId={`unit-${unit.id}-capacity`}>
            <Form.Label>Cases per shelf</Form.Label>
            <Form.Control size="sm" type="number" min={1} value={capacity} onChange={event => setCapacity(event.target.value)} />
          </Form.Group>
          <Button size="sm" variant="warning" type="submit" className="furniture-span">Save</Button>
          <div className="furniture-unit-tools furniture-span">
            <Button size="sm" variant="outline-secondary" disabled={first} aria-label={`Move ${unit.letter} left`}
              onClick={() => run(() => shelvingService.updateUnit(unit.id, { move: -1 }))}><BsChevronLeft /> Left</Button>
            <Button size="sm" variant="outline-secondary" disabled={last} aria-label={`Move ${unit.letter} right`}
              onClick={() => run(() => shelvingService.updateUnit(unit.id, { move: 1 }))}>Right <BsChevronRight /></Button>
            {confirmDelete ? (
              <Button size="sm" variant="danger" onClick={() => run(() => shelvingService.deleteUnit(unit.id))}>Delete {unit.letter}?</Button>
            ) : (
              <Button size="sm" variant="outline-danger" aria-label={`Delete unit ${unit.letter}`} onClick={() => setConfirmDelete(true)}><BsTrash /> Delete</Button>
            )}
          </div>
        </Form>
      )}
      <ol className="furniture-shelves">
        {unit.levels.map(level => {
          const open = selected === level.id;
          const full = level.capacity > 0 ? Math.min(100, Math.round((level.used / level.capacity) * 100)) : 0;
          return (
            <li key={level.id} id={`shelf-level-${level.id}`}
              className={`furniture-shelf ${sectionClass(level)} ${level.locked ? 'locked' : ''} ${open ? 'open' : ''}`}>
              <button type="button" className="furniture-board" aria-expanded={open} onClick={() => onSelect(open ? null : level.id)}>
                <span className="furniture-shelf-code">{level.code}</span>
                <span className="furniture-shelf-text">
                  <span className="furniture-shelf-line">
                    <span className="furniture-shelf-section">{level.section ? SECTION_LABELS[level.section] : 'Free'}</span>
                    {level.count > 0 && <span className="furniture-shelf-count">{level.count} · {level.used}/{level.capacity}</span>}
                    {level.locked && <BsLock className="furniture-shelf-mark" title="Locked: keeps what it holds" aria-label="Locked" />}
                    {level.breakBefore && <BsArrowBarDown className="furniture-shelf-mark" title={`No room from ${level.breakBefore}`} aria-label="No room" />}
                  </span>
                  <span className="furniture-shelf-range">{rangeOf(level)}</span>
                </span>
                <span className="furniture-fill" aria-hidden="true">
                  <span className={`furniture-fill-bar ${level.used > level.usable ? 'over' : ''}`} style={{ width: `${full}%` }} />
                </span>
              </button>
              {open && (
                <ShelfPanel level={level} unit={unit} items={itemsOf(level)} run={run} onShowShelf={onShowShelf} onClose={() => onSelect(null)} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

/**
 * The shelving units side by side, as they stand, each a column of boards
 * from the top shelf down: its section's colour, how full it is and what it
 * holds from first to last. A board opens to set the shelf up. A section
 * fills its shelves unit after unit from the left, top shelf first.
 */
const ShelfFurniture: React.FC<Props> = ({ plan, run, onShowShelf, focusLevelId = null }) => {
  const [adding, setAdding] = useState(plan.units.length === 0);
  const [letter, setLetter] = useState(nextLetter(plan.units));
  const [levels, setLevels] = useState('10');
  const [capacity, setCapacity] = useState('12');
  const [section, setSection] = useState<string>('films');
  const [selected, setSelected] = useState<number | null>(focusLevelId);
  const unshelved = plan.sections.filter(entry => entry.items.length > 0 && entry.shelves > 0 && entry.unshelved > 0);

  // What stands on each shelf, in the order of its section; a shelf put by hand is counted where it is.
  const itemsByLevel = useMemo(() => {
    const result = new Map<number, ShelvedItem[]>();
    for (const entry of plan.sections) {
      for (const item of entry.items) {
        if (item.levelId == null) continue;
        result.set(item.levelId, [...(result.get(item.levelId) || []), item]);
      }
    }
    return result;
  }, [plan]);
  const itemsOf = (level: ShelfLevel) => itemsByLevel.get(level.id) || [];

  useEffect(() => {
    if (focusLevelId != null) document.getElementById(`shelf-level-${focusLevelId}`)?.scrollIntoView?.({ block: 'center' });
  }, [focusLevelId]);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await shelvingService.createUnit({ letter, levels: Number(levels), capacity: Number(capacity), section: (section || null) as ShelfSection | null });
      setLetter(nextLetter([...plan.units, { id: 0, letter: letter.toUpperCase(), capacity: 0, levels: [] }]));
      setAdding(false);
    });
  };

  return (
    <div className="furniture">
      <p className="shelves-subtitle">
        Your units as they stand, shelves numbered from the top. Click a shelf to set it up: what it is for, how many cases it holds, whether it keeps what it holds.
      </p>

      {unshelved.map(entry => (
        <div key={entry.key} className="shelves-notice shelves-warning">
          {entry.unshelved} {SECTION_LABELS[entry.key].toLowerCase()} have no shelf yet: give {SECTION_LABELS[entry.key]} another shelf, or a shelf more room.
        </div>
      ))}

      <div className="furniture-units">
        {plan.units.map((unit, index) => (
          <UnitColumn key={`${unit.id}:${unit.letter}:${unit.capacity}:${unit.levels.length}`} unit={unit}
            first={index === 0} last={index === plan.units.length - 1}
            itemsOf={itemsOf} selected={selected} onSelect={setSelected} run={run} onShowShelf={onShowShelf} />
        ))}

        <section className={`furniture-unit furniture-unit-add ${adding ? 'open' : ''}`} aria-label="New unit">
          {adding ? (
            <Form className="furniture-add" onSubmit={add}>
              <div className="furniture-unit-heading furniture-span">
                <h3>{letter.toUpperCase() || '?'}</h3>
                <span className="furniture-unit-meta">New unit</span>
                {plan.units.length > 0 && (
                  <button type="button" className="shelf-edit" aria-label="Cancel adding a unit" onClick={() => setAdding(false)}><BsX /></button>
                )}
              </div>
              <Form.Group controlId="furniture-letter" className="furniture-unit-letter">
                <Form.Label>Letter</Form.Label>
                <Form.Control size="sm" value={letter} onChange={event => setLetter(event.target.value)} />
              </Form.Group>
              <Form.Group controlId="furniture-levels">
                <Form.Label>Shelves</Form.Label>
                <Form.Control size="sm" type="number" min={1} max={20} value={levels} onChange={event => setLevels(event.target.value)} />
              </Form.Group>
              <Form.Group controlId="furniture-capacity">
                <Form.Label>Cases per shelf</Form.Label>
                <Form.Control size="sm" type="number" min={1} value={capacity} onChange={event => setCapacity(event.target.value)} />
              </Form.Group>
              <Form.Group controlId="furniture-section" className="furniture-span">
                <Form.Label>Its shelves are for</Form.Label>
                <Form.Select size="sm" value={section} onChange={event => setSection(event.target.value)}>
                  {(Object.keys(SECTION_LABELS) as ShelfSection[]).map(key => <option key={key} value={key}>{SECTION_LABELS[key]}</option>)}
                  <option value="">Nothing yet: free shelves</option>
                </Form.Select>
              </Form.Group>
              <p className="furniture-panel-hint furniture-span">
                A case is a Blu-ray or CD jewel case; a DVD takes 1.2. You can give each shelf its own section and room afterwards.
              </p>
              <Button size="sm" variant="warning" type="submit" className="furniture-span" disabled={!letter.trim()}>Add unit</Button>
            </Form>
          ) : (
            <button type="button" className="furniture-add-button" onClick={() => setAdding(true)}>
              <BsPlusLg aria-hidden="true" />
              Add a unit
            </button>
          )}
        </section>
      </div>
    </div>
  );
};

export default ShelfFurniture;
