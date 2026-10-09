import React, { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { BsChevronLeft, BsChevronRight, BsLock, BsPencil, BsTrash, BsUnlock, BsX } from 'react-icons/bs';
import shelvingService, { type ShelfLevel, type ShelfSection, type ShelfUnit, type ShelvingPlan } from '../services/shelvingService';
import { SECTION_LABELS } from './shelfLabels';

interface Props {
  plan: ShelvingPlan;
  /** Runs a change, then reloads the plan; shows what went wrong. */
  run: (action: () => Promise<unknown>) => Promise<void>;
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

const LevelCard: React.FC<{ level: ShelfLevel; run: Props['run'] }> = ({ level, run }) => {
  const [capacity, setCapacity] = useState(level.ownCapacity == null ? '' : String(level.ownCapacity));
  const full = level.usable > 0 ? Math.min(100, Math.round((level.used / level.capacity) * 100)) : 0;
  const saveCapacity = () => {
    const value = numberOf(capacity);
    if (value === level.ownCapacity) return;
    run(() => shelvingService.updateLevel(level.id, { capacity: value == null ? null : Math.round(value) }));
  };

  return (
    <li className={`furniture-level ${level.locked ? 'locked' : ''} ${level.section ? '' : 'free'}`}>
      <div className="furniture-level-top">
        <span className="furniture-code">{level.code}</span>
        <Form.Select size="sm" aria-label={`Section of ${level.code}`} value={level.section || ''}
          onChange={event => run(() => shelvingService.updateLevel(level.id, { section: (event.target.value || null) as ShelfSection | null }))}>
          <option value="">Free: by hand only</option>
          {(Object.keys(SECTION_LABELS) as ShelfSection[]).map(key => <option key={key} value={key}>{SECTION_LABELS[key]}</option>)}
        </Form.Select>
        <button type="button" className="shelf-edit" aria-label={level.locked ? `Unlock ${level.code}` : `Lock ${level.code}`}
          title={level.locked ? 'Arranged: keeps what it holds. Click to unlock.' : 'Lock once arranged, so it keeps what it holds'}
          disabled={!level.locked && level.count === 0}
          onClick={() => run(() => shelvingService.updateLevel(level.id, { locked: !level.locked }))}>
          {level.locked ? <BsLock /> : <BsUnlock />}
        </button>
      </div>
      {(level.section || level.count > 0) && (
        <>
          <div className="furniture-fill" title={`${level.used} of ${level.capacity} cases, filled up to ${level.usable}`}>
            <div className={`furniture-fill-bar ${level.used > level.usable ? 'over' : ''}`} style={{ width: `${full}%` }} />
          </div>
          <div className="furniture-level-range">
            {level.count === 0 ? 'Empty' : `${level.count} · ${level.first}${level.count > 1 ? ` – ${level.last}` : ''}`}
            {level.pinned > 0 && level.section && ` (${level.pinned} by hand)`}
          </div>
          {level.breakBefore && (
            <div className="furniture-break">
              No room from {level.breakBefore}
              <button type="button" className="shelf-edit" aria-label={`Forget that ${level.breakBefore} had no room`}
                onClick={() => run(() => shelvingService.updateLevel(level.id, { breakBefore: null }))}><BsX /></button>
            </div>
          )}
          <Form.Control size="sm" className="furniture-capacity" inputMode="numeric" aria-label={`Capacity of ${level.code}`}
            placeholder={`Holds ${level.capacity}`} value={capacity}
            onChange={event => setCapacity(event.target.value)} onBlur={saveCapacity}
            onKeyDown={event => { if (event.key === 'Enter') saveCapacity(); }} />
        </>
      )}
    </li>
  );
};

const UnitColumn: React.FC<{ unit: ShelfUnit; first: boolean; last: boolean; run: Props['run'] }> = ({ unit, first, last, run }) => {
  const [editing, setEditing] = useState(false);
  const [letter, setLetter] = useState(unit.letter);
  const [levels, setLevels] = useState(String(unit.levels.length));
  const [capacity, setCapacity] = useState(String(unit.capacity));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="furniture-unit" aria-label={`Unit ${unit.letter}`}>
      <div className="furniture-unit-heading">
        <button type="button" className="shelf-edit" aria-label={`Move ${unit.letter} left`} disabled={first}
          onClick={() => run(() => shelvingService.updateUnit(unit.id, { move: -1 }))}><BsChevronLeft /></button>
        <h3>{unit.letter}</h3>
        <button type="button" className="shelf-edit" aria-label={`Move ${unit.letter} right`} disabled={last}
          onClick={() => run(() => shelvingService.updateUnit(unit.id, { move: 1 }))}><BsChevronRight /></button>
        <button type="button" className="shelf-edit" aria-label={`Edit unit ${unit.letter}`} onClick={() => setEditing(!editing)}><BsPencil /></button>
        {confirmDelete ? (
          <Button size="sm" variant="danger" onClick={() => run(() => shelvingService.deleteUnit(unit.id))}>Delete {unit.letter}?</Button>
        ) : (
          <button type="button" className="shelf-edit" aria-label={`Delete unit ${unit.letter}`} onClick={() => setConfirmDelete(true)}><BsTrash /></button>
        )}
      </div>
      {editing && (
        <Form className="furniture-unit-edit" onSubmit={event => {
          event.preventDefault();
          run(async () => {
            await shelvingService.updateUnit(unit.id, { letter, levels: Number(levels), capacity: Number(capacity) });
            setEditing(false);
          });
        }}>
          <Form.Control size="sm" aria-label="Letter" value={letter} onChange={event => setLetter(event.target.value)} />
          <Form.Control size="sm" aria-label="Shelves" type="number" min={1} max={20} value={levels} onChange={event => setLevels(event.target.value)} />
          <Form.Control size="sm" aria-label="Cases per shelf" type="number" min={1} value={capacity} onChange={event => setCapacity(event.target.value)} />
          <Button size="sm" variant="warning" type="submit">Save</Button>
        </Form>
      )}
      <ol className="furniture-levels">
        {unit.levels.map(level => <LevelCard key={`${level.id}:${level.ownCapacity}`} level={level} run={run} />)}
      </ol>
    </section>
  );
};

/**
 * The shelving units side by side, as they stand, each shelf with its
 * section, how full it is and what it holds from first to last. A section
 * fills its shelves unit after unit from the left, top shelf first.
 */
const ShelfFurniture: React.FC<Props> = ({ plan, run }) => {
  const [letter, setLetter] = useState(nextLetter(plan.units));
  const [levels, setLevels] = useState('10');
  const [capacity, setCapacity] = useState('12');
  const [section, setSection] = useState<string>('films');
  const unshelved = plan.sections.filter(entry => entry.items.length > 0 && entry.shelves > 0 && entry.unshelved > 0);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    run(async () => {
      await shelvingService.createUnit({ letter, levels: Number(levels), capacity: Number(capacity), section: (section || null) as ShelfSection | null });
      setLetter(nextLetter([...plan.units, { id: 0, letter: letter.toUpperCase(), capacity: 0, levels: [] }]));
    });
  };

  return (
    <div className="furniture">
      <p className="shelves-subtitle">
        Each unit is a column of shelves, numbered from the top: A-1, A-2… Capacity counts standard cases: Blu-ray for films (a DVD takes 1.2),
        jewel cases for CDs. Shelves fill to 85%, leaving room for what comes later. A free shelf only takes what you put on it by hand,
        from an object's pencil. Lock a shelf once arranged.
      </p>

      {unshelved.map(entry => (
        <div key={entry.key} className="shelves-notice shelves-warning">
          {entry.unshelved} {SECTION_LABELS[entry.key].toLowerCase()} have no shelf yet: give the section another shelf or more room.
        </div>
      ))}

      <Form className="furniture-add" onSubmit={add}>
        <Form.Group controlId="furniture-letter">
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
        <Form.Group controlId="furniture-section">
          <Form.Label>For</Form.Label>
          <Form.Select size="sm" value={section} onChange={event => setSection(event.target.value)}>
            <option value="">Nothing yet</option>
            {(Object.keys(SECTION_LABELS) as ShelfSection[]).map(key => <option key={key} value={key}>{SECTION_LABELS[key]}</option>)}
          </Form.Select>
        </Form.Group>
        <Button size="sm" variant="warning" type="submit" disabled={!letter.trim()}>Add unit</Button>
      </Form>

      {plan.units.length === 0 ? (
        <div className="shelves-empty">No unit yet. Add your first one above.</div>
      ) : (
        <div className="furniture-units">
          {plan.units.map((unit, index) => (
            <UnitColumn key={`${unit.id}:${unit.letter}:${unit.capacity}:${unit.levels.length}`} unit={unit}
              first={index === 0} last={index === plan.units.length - 1} run={run} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ShelfFurniture;
