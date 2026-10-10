import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { BsArrowBarDown, BsArrowBarUp, BsPencil, BsTrash, BsX } from 'react-icons/bs';
import shelvingService, {
  type ShelfLevel, type ShelfSection, type ShelvedItem, type ShelvingPlan, type ShelfSettings,
} from '../services/shelvingService';
import ShelfFurniture from './ShelfFurniture';
import { onShelvesChanged, refreshShelfLocations } from '../utils/shelfLocations';
import { SECTION_LABELS } from './shelfLabels';
import './ShelvesPage.css';

type Tab = ShelfSection | 'furniture' | 'places';

/** The sections an object can be moved to: a CD's or a film's. */
const SECTIONS_FOR: Record<ShelvedItem['kind'], ShelfSection[]> = {
  album: ['music', 'classical'],
  movie: ['films'],
  box_set: ['films'],
};

/** Where an object is, as the Location field reads it: in order, on a shelf put by hand, or in a place off the shelves. */
const locationOf = (item: ShelvedItem): string =>
  item.placeId != null ? `place:${item.placeId}` : item.pinned && item.levelId != null ? `level:${item.levelId}` : '';

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The letter a filing name stands under; digits share one heading. */
const letterOf = (sortName: string): string => {
  const first = normalize(sortName).replace(/[^a-z0-9]/g, '').charAt(0).toUpperCase();
  return !first ? '#' : /[0-9]/.test(first) ? '0–9' : first;
};

/** A small poster: TMDB's original size is several megabytes. */
const thumbnail = (image: string | null): string | null => {
  if (!image) return null;
  if (image.includes('image.tmdb.org/t/p/original')) return image.replace('/t/p/original', '/t/p/w92');
  if (image.startsWith('http') || image.startsWith('/')) return image;
  return `/api/images/${image}`;
};

const keyOf = (item: ShelvedItem) => `${item.kind}:${item.id}`;

/** The heading a shelf's objects stand under, and the id to scroll to it by. */
const NO_SHELF = 'No shelf yet';
const anchorOf = (heading: string) => `shelf-group-${heading === NO_SHELF ? 'none' : heading}`;

interface EditorProps {
  item: ShelvedItem;
  places: ShelvingPlan['places'];
  units: ShelvingPlan['units'];
  onSave: (settings: ShelfSettings) => Promise<void>;
  onClose: () => void;
  onTogether: (collectionId: number, together: boolean) => void;
}

/** What can be set by hand for one object: its section, the name it is filed under, a place off the shelves. */
const ShelfItemEditor: React.FC<EditorProps> = ({ item, places, units: furniture, onSave, onClose, onTogether }) => {
  const [section, setSection] = useState<string>(item.sectionAuto ? '' : item.section);
  const [shelveUnder, setShelveUnder] = useState(item.sortSource === 'manual' ? item.sortName : '');
  const [units, setUnits] = useState<string>(item.unitsAuto ? '' : String(item.units));
  const [location, setLocation] = useState<string>(locationOf(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = (name: string) => `shelf-${item.kind}-${item.id}-${name}`;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        section: (section || null) as ShelfSection | null,
        shelveUnder: shelveUnder.trim() || null,
        placeId: location.startsWith('place:') ? Number(location.slice(6)) : null,
        levelId: location.startsWith('level:') ? Number(location.slice(6)) : null,
        units: units ? Number(units) : null,
      });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Form className="shelf-editor" onSubmit={save} onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      {SECTIONS_FOR[item.kind].length > 1 && (
        <Form.Group className="shelf-editor-field" controlId={fieldId('section')}>
          <Form.Label>Section</Form.Label>
          <Form.Select size="sm" value={section} onChange={event => setSection(event.target.value)}>
            <option value="">Automatic</option>
            {SECTIONS_FOR[item.kind].map(key => <option key={key} value={key}>{SECTION_LABELS[key]}</option>)}
          </Form.Select>
        </Form.Group>
      )}
      <Form.Group className="shelf-editor-field shelf-editor-wide" controlId={fieldId('under')}>
        <Form.Label>Sort as</Form.Label>
        <Form.Control
          size="sm"
          value={shelveUnder}
          placeholder={item.sortSource === 'manual' ? '' : item.sortName}
          onChange={event => setShelveUnder(event.target.value)}
          autoFocus
        />
      </Form.Group>
      <Form.Group className="shelf-editor-field shelf-editor-narrow" controlId={fieldId('units')}>
        <Form.Label>Width</Form.Label>
        <Form.Control
          size="sm"
          type="number"
          min={0.5}
          max={50}
          step={0.1}
          value={units}
          placeholder={item.unitsAuto ? String(item.units) : ''}
          onChange={event => setUnits(event.target.value)}
        />
      </Form.Group>
      <Form.Group className="shelf-editor-field" controlId={fieldId('place')}>
        <Form.Label>Location</Form.Label>
        <Form.Select size="sm" value={location} onChange={event => setLocation(event.target.value)}>
          <option value="">In order{item.code && !item.pinned ? ` (now ${item.code})` : ''}</option>
          {furniture.length > 0 && (
            <optgroup label="On a shelf, by hand">
              {furniture.flatMap(unit => unit.levels).map(level => (
                <option key={level.id} value={`level:${level.id}`}>
                  {level.code}{level.section ? ` · ${SECTION_LABELS[level.section]}` : ' · Free'}
                </option>
              ))}
            </optgroup>
          )}
          {places.length > 0 && (
            <optgroup label="Off the shelves">
              {places.map(place => <option key={place.id} value={`place:${place.id}`}>{place.name}</option>)}
            </optgroup>
          )}
        </Form.Select>
      </Form.Group>
      {item.collections && item.collections.length > 0 && (
        <fieldset className="shelf-editor-field shelf-editor-collections">
          <legend className="form-label">Collection</legend>
          {item.collections.map(collection => (
            <Form.Check key={collection.id} id={fieldId(`together-${collection.id}`)} type="checkbox"
              label={`Keep “${collection.name}” together`} checked={collection.together}
              onChange={event => onTogether(collection.id, event.target.checked)} />
          ))}
        </fieldset>
      )}
      <div className="shelf-editor-actions">
        <Button size="sm" variant="outline-secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" variant="warning" type="submit" disabled={saving}>Save</Button>
      </div>
      <p className="shelf-editor-help">
        <strong>Sort as</strong>: the name it is shelved by alphabetically, e.g. “Marriner, Neville” for a Marriner CD.
        {' '}<strong>Width</strong>: how many standard cases it takes on the shelf (1 is a Blu-ray or CD case; a DVD is 1.2).
        {' '}<strong>Location</strong>: in order with the rest, or a shelf of your choosing (a free one, for a box set laid flat), or somewhere off the shelves.
        {item.collections && item.collections.length > 0 && <>
          {' '}<strong>Collection</strong>: its films stand together, under the first one out, in the order they came out.
        </>}
      </p>
      {error && <div className="shelf-editor-error">{error}</div>}
    </Form>
  );
};

interface RowProps {
  item: ShelvedItem;
  position?: number;
  editing: boolean;
  places: ShelvingPlan['places'];
  units: ShelvingPlan['units'];
  onEdit: () => void;
  onSave: (settings: ShelfSettings) => Promise<void>;
  onClose: () => void;
  onNoRoom: () => void;
  onMoveBack: () => void;
  onTogether: (collectionId: number, together: boolean) => void;
  /** The section's shelves before and after its own: null when there is none, undefined when unknown. */
  before?: string | null;
  after?: string | null;
  /** Whether it stands first on its shelf, where no room cannot be told. */
  firstOnShelf?: boolean;
}

const ShelfRow: React.FC<RowProps> = ({
  item, position, editing, places, units, onEdit, onSave, onClose, onNoRoom, onMoveBack, onTogether, before, after, firstOnShelf,
}) => {
  const collection = item.together && item.collections?.find(entry => entry.id === item.together!.id);
  const image = thumbnail(item.image);
  // A classical CD or a compilation is filed under a name worked out from its credits: worth a look.
  const unsure = item.sortSource === 'guess' && item.kind === 'album';
  const movable = item.code && !item.pinned && !editing;
  return (
    <li className={`shelf-row ${editing ? 'editing' : ''}`}>
      <div className="shelf-row-main" onClick={editing ? undefined : onEdit}>
        {position != null && <span className="shelf-position">{position}</span>}
        <div className={`shelf-cover ${item.kind === 'album' ? '' : 'shelf-cover-film'}`}>
          {image && <img src={image} alt="" loading="lazy" />}
        </div>
        <div className="shelf-info">
          <div className="shelf-sort-name">
            {item.sortName}
            {item.sortSource === 'manual' && <span className="shelf-tag">set by hand</span>}
            {collection && <span className="shelf-tag shelf-tag-collection" title="Kept together with its collection">{collection.name}</span>}
            {unsure && item.section === 'classical' && <span className="shelf-tag shelf-tag-guess">guessed</span>}
          </div>
          {/* A film filed under its own title would show it twice. */}
          {!(item.kind === 'movie' && normalize(item.title).endsWith(normalize(item.sortName))) && <div className="shelf-title">{item.title}</div>}
          <div className="shelf-subtitle">{item.subtitle}</div>
        </div>
        {(item.units > 1 || !item.unitsAuto) && (
          <span className="shelf-units" title={item.unitsAuto ? 'Standard cases wide, estimated' : 'Standard cases wide, set by hand'}>
            {item.units} {item.units === 1 ? 'case' : 'cases'}
          </span>
        )}
        {!item.sectionAuto && <span className="shelf-tag">{SECTION_LABELS[item.section]}</span>}
        {item.code && (
          <span className={`shelf-code ${item.pinned ? 'pinned' : ''}`} title={item.pinned ? 'Put on this shelf by hand' : 'Its place in order'}>
            {item.code}
          </span>
        )}
        {movable && (
          <button type="button" className="shelf-edit shelf-move" disabled={before === null}
            aria-label={`Move ${item.title} back to ${before || 'the shelf before'}`}
            title={before === null
              ? `${item.code} is the first shelf of its section`
              : `It fits on ${before || 'the shelf before'}: move it back there, with what stands before it on ${item.code}`}
            onClick={event => { event.stopPropagation(); onMoveBack(); }}>
            <BsArrowBarUp />
            {before && <span className="shelf-move-target">{before}</span>}
          </button>
        )}
        {movable && (
          <button type="button" className="shelf-edit shelf-move" disabled={after === null || firstOnShelf}
            aria-label={`No room for ${item.title}: move it on to ${after || 'the next shelf'}`}
            title={after === null
              ? `${item.code} is the last shelf of its section`
              : firstOnShelf
                ? `It stands first on ${item.code}: give the shelf more room instead`
                : `No room on ${item.code}: it and the ones after it go on to ${after || 'the next shelf'}`}
            onClick={event => { event.stopPropagation(); onNoRoom(); }}>
            <BsArrowBarDown />
            {after && <span className="shelf-move-target">{after}</span>}
          </button>
        )}
        {!editing && (
          <button type="button" className="shelf-edit" aria-label={`Edit shelving of ${item.title}`} onClick={event => { event.stopPropagation(); onEdit(); }}>
            <BsPencil />
          </button>
        )}
      </div>
      {editing && <ShelfItemEditor item={item} places={places} units={units} onSave={onSave} onClose={onClose} onTogether={onTogether} />}
    </li>
  );
};

/**
 * Where each CD and film stands: every section in the order it fills the
 * shelves, under the name it is filed by, and the places off the shelves for
 * what does not fit on them. A name worked out from a classical CD's credits
 * is marked, to be checked against the cover.
 */
const ShelvesPage: React.FC = () => {
  const [plan, setPlan] = useState<ShelvingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('films');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [newPlace, setNewPlace] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  // A shelf's heading to scroll to once its section shows, and a shelf to open as the furniture shows.
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [furnitureFocus, setFurnitureFocus] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setPlan(await shelvingService.getPlan());
      // The cards across the app show the shelves as they now stand.
      refreshShelfLocations();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onShelvesChanged(load), [load]);

  const saveItem = (item: ShelvedItem) => async (settings: ShelfSettings) => {
    await shelvingService.saveItem(item.kind, item.id, settings);
    setEditing(null);
    await load();
  };

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // A shelf code finds what stands on it: "A-3".
  const matches = useCallback((item: ShelvedItem) => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const text = normalize(`${item.sortName} ${item.title} ${item.subtitle} ${item.code || ''}`);
    return words.every(word => text.includes(word));
  }, [query]);

  const section = plan?.sections.find(entry => entry.key === tab);
  // Once the section has shelves, the list reads shelf by shelf, as it is arranged; before, letter by letter.
  const byShelf = !!section?.items.some(item => item.code);
  const groups = useMemo(() => {
    if (!section) return [];
    const result: Array<{ heading: string; rows: Array<{ item: ShelvedItem; position: number }> }> = [];
    section.items.forEach((item, index) => {
      if (!matches(item)) return;
      const heading = byShelf ? item.code || NO_SHELF : letterOf(item.sortName);
      const last = result[result.length - 1];
      if (last?.heading === heading) last.rows.push({ item, position: index + 1 });
      else result.push({ heading, rows: [{ item, position: index + 1 }] });
    });
    return result;
  }, [section, matches, byShelf]);

  // The section's shelves in the order they fill, and each shelf by its code.
  const shelves = useMemo(
    () => (plan?.units || []).flatMap(unit => unit.levels).filter(level => level.section === tab),
    [plan, tab],
  );
  const levelByCode = useMemo(() => new Map((plan?.units || []).flatMap(unit => unit.levels).map(level => [level.code, level])), [plan]);

  useEffect(() => {
    if (!jumpTo || !section) return;
    document.getElementById(anchorOf(jumpTo))?.scrollIntoView?.({ block: 'start' });
    setJumpTo(null);
  }, [jumpTo, section, groups]);

  /** Takes a section's list to a shelf's objects, from the furniture. */
  const showShelf = (level: ShelfLevel, inSection: ShelfSection) => {
    setTab(inSection);
    setQuery('');
    setJumpTo(level.code);
  };

  /** Takes the furniture to a shelf, from its heading in the list. */
  const setUpShelf = (level: ShelfLevel) => {
    setFurnitureFocus(level.id);
    setTab('furniture');
  };

  /** The shelves before and after an object's own, in its section's order, and whether it stands first on its own. */
  const neighbours = (item: ShelvedItem) => {
    if (item.levelId == null || !section) return {};
    const at = shelves.findIndex(level => level.id === item.levelId);
    if (at < 0) return {};
    return {
      before: shelves[at - 1]?.code ?? null,
      after: shelves[at + 1]?.code ?? null,
      firstOnShelf: section.items.find(other => other.levelId === item.levelId && !other.pinned) === item,
    };
  };

  const rowProps = (item: ShelvedItem) => ({
    item,
    places: plan?.places || [],
    units: plan?.units || [],
    editing: editing === keyOf(item),
    onEdit: () => setEditing(keyOf(item)),
    onSave: saveItem(item),
    onClose: () => setEditing(null),
    onNoRoom: () => run(() => shelvingService.noRoom(item.kind, item.id)),
    onMoveBack: () => run(() => shelvingService.moveBack(item.kind, item.id)),
    onTogether: (collectionId: number, together: boolean) => run(() => shelvingService.setTogether(collectionId, together)),
    ...neighbours(item),
  });

  const units = (items: ShelvedItem[]) => items.reduce((sum, item) => sum + item.units, 0);
  const keptElsewhere = plan?.places.reduce((sum, place) => sum + place.items.length, 0) || 0;

  return (
    <div className="shelves-page">
      <div className="shelves-header">
        <h2>Shelves</h2>
        <p className="shelves-subtitle">
          The order each section stands in on the shelves, and the shelf each object goes on once the furniture is described.
        </p>
      </div>

      {error && <div className="shelves-notice shelves-error">{error}</div>}

      <div className="shelves-controls">
        <div className="shelves-tabs" role="tablist">
          {plan?.sections.map(entry => (
            <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key}
              className={`shelves-tab section-${entry.key} ${tab === entry.key ? 'active' : ''}`} onClick={() => setTab(entry.key)}>
              {SECTION_LABELS[entry.key]} <span className="shelves-tab-count">{entry.items.length}</span>
            </button>
          ))}
          {plan && (
            <button type="button" role="tab" aria-selected={tab === 'furniture'}
              className={`shelves-tab ${tab === 'furniture' ? 'active' : ''}`} onClick={() => setTab('furniture')}>
              Furniture <span className="shelves-tab-count">{plan.units.length}</span>
            </button>
          )}
          {plan && (
            <button type="button" role="tab" aria-selected={tab === 'places'}
              className={`shelves-tab ${tab === 'places' ? 'active' : ''}`} onClick={() => setTab('places')}>
              Elsewhere <span className="shelves-tab-count">{keptElsewhere}</span>
            </button>
          )}
        </div>
        {tab !== 'places' && tab !== 'furniture' && (
          <Form.Control className="shelves-search" size="sm" type="search" placeholder="Find on the shelves…"
            value={query} onChange={event => setQuery(event.target.value)} />
        )}
      </div>

      {!plan && !error && <div className="shelves-empty">Loading…</div>}

      {section && (
        <>
          <div className="shelves-figures">
            {section.items.length} objects, about <strong>{Math.round(units(section.items))}</strong> standard cases wide
            {section.shelves > 0 && <> on {section.shelves} shelves</>}
            {section.unshelved > 0 && section.shelves > 0 && <>, <strong className="shelves-over">{section.unshelved} without a shelf</strong></>}
            {section.shelves === 0 && plan && (
              <> · <button type="button" className="shelves-link" onClick={() => setTab('furniture')}>
                {plan.units.length === 0 ? 'Describe the furniture' : `Give ${SECTION_LABELS[section.key]} a shelf`}
              </button></>
            )}
          </div>
          {/* The shelves in the order they fill: one click takes the list to what stands on one. */}
          {byShelf && !query && (
            <nav className="shelf-strip" aria-label={`Shelves of ${SECTION_LABELS[section.key]}`}>
              {shelves.map(level => (
                <button key={level.id} type="button" className={`shelf-chip ${level.count === 0 ? 'empty' : ''}`}
                  title={level.count === 0 ? `${level.code}: empty` : `${level.code}: ${level.first}${level.count > 1 ? ` – ${level.last}` : ''}`}
                  onClick={() => setJumpTo(level.code)}>
                  {level.code}<span className="shelf-chip-count">{level.count}</span>
                </button>
              ))}
              {section.unshelved > 0 && (
                <button type="button" className="shelf-chip shelf-chip-over" onClick={() => setJumpTo(NO_SHELF)}>
                  {NO_SHELF}<span className="shelf-chip-count">{section.unshelved}</span>
                </button>
              )}
            </nav>
          )}
          {groups.length === 0 && <div className="shelves-empty">Nothing matches.</div>}
          {groups.map(group => {
            const level = byShelf ? levelByCode.get(group.heading) : undefined;
            return (
              <section key={group.heading} id={anchorOf(group.heading)} className="shelf-letter">
                <div className="shelf-letter-heading">
                  <h3>{group.heading}</h3>
                  {level && (
                    <span className="shelf-letter-meta">
                      {level.count} · {level.used} of {level.capacity} cases{level.locked && ' · locked'}
                    </span>
                  )}
                  {level && (
                    <button type="button" className="shelves-link" onClick={() => setUpShelf(level)}>Set up {level.code} ›</button>
                  )}
                </div>
                {group.heading === NO_SHELF && (
                  <p className="shelf-letter-note">
                    The {SECTION_LABELS[section.key].toLowerCase()} shelves are full from here. Give {SECTION_LABELS[section.key]} another
                    shelf, or a shelf more room, in <button type="button" className="shelves-link" onClick={() => setTab('furniture')}>Furniture</button>.
                  </p>
                )}
                <ul className="shelf-list">
                  {group.rows.map(({ item, position }) => (
                    <ShelfRow key={keyOf(item)} position={position} {...rowProps(item)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {plan && tab === 'furniture' && <ShelfFurniture plan={plan} run={run} onShowShelf={showShelf} focusLevelId={furnitureFocus} />}

      {plan && tab === 'places' && (
        <div className="shelf-places">
          <p className="shelves-subtitle">
            Places off the shelves, for the box sets too big for them. Choose one as the Location in an object's pencil.
          </p>
          <Form className="shelf-place-add" onSubmit={event => {
            event.preventDefault();
            const name = newPlace.trim();
            if (name) run(async () => { await shelvingService.createPlace(name); setNewPlace(''); });
          }}>
            <Form.Control size="sm" placeholder="New place, e.g. Wardrobe, top" value={newPlace}
              onChange={event => setNewPlace(event.target.value)} />
            <Button size="sm" variant="warning" type="submit" disabled={!newPlace.trim()}>Add</Button>
          </Form>
          {plan.places.length === 0 && <div className="shelves-empty">No place off the shelves yet.</div>}
          {plan.places.map(place => (
            <section key={place.id} className="shelf-place">
              <div className="shelf-place-heading">
                {renaming?.id === place.id ? (
                  <Form className="shelf-place-rename" onSubmit={event => {
                    event.preventDefault();
                    const name = renaming.name.trim();
                    if (name) run(async () => { await shelvingService.renamePlace(place.id, name); setRenaming(null); });
                  }}>
                    <Form.Control size="sm" value={renaming.name} autoFocus
                      onChange={event => setRenaming({ id: place.id, name: event.target.value })} />
                    <Button size="sm" variant="warning" type="submit">Rename</Button>
                    <button type="button" className="shelf-edit" aria-label="Cancel" onClick={() => setRenaming(null)}><BsX /></button>
                  </Form>
                ) : (
                  <>
                    <h3>{place.name} <span className="shelves-tab-count">{place.items.length}</span></h3>
                    <button type="button" className="shelf-edit" aria-label={`Rename ${place.name}`}
                      onClick={() => setRenaming({ id: place.id, name: place.name })}><BsPencil /></button>
                    <button type="button" className="shelf-edit" aria-label={`Delete ${place.name}`}
                      title="Delete the place; what is kept there goes back to the shelves"
                      onClick={() => run(() => shelvingService.deletePlace(place.id))}><BsTrash /></button>
                  </>
                )}
              </div>
              {place.items.length === 0 ? (
                <div className="shelves-empty">Nothing kept here.</div>
              ) : (
                <ul className="shelf-list">
                  {place.items.map(item => <ShelfRow key={keyOf(item)} {...rowProps(item)} />)}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShelvesPage;
