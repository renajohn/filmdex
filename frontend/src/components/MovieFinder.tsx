import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BsCamera, BsCheckLg, BsChevronRight, BsCollectionPlay, BsFilter, BsPersonFill, BsPlusLg, BsSearch } from 'react-icons/bs';
import movieFinderService, {
  EditionInput, FinderMovie, FinderPerson, FinderSaga, MOVIE_FORMATS, MovieHave, shortFormat, tmdbImage,
} from '../services/movieFinderService';
import apiService from '../services/api';
import Button, { IconButton } from './shared/Button';
import Chip from './shared/Chip';
import CoverButton from './shared/CoverButton';
import CoverTag from './shared/CoverTag';
import Dialog from './shared/Dialog';
import Segmented from './shared/Segmented';
import { Loading } from './shared/Spinner';
import { TextField } from './shared/TextField';
import toast from './shared/Toast';
import './finder.css';

export type MovieFinderMode = 'wish' | 'owned';

export interface MovieFinderHead {
  title: string;
  onBack?: () => void;
}

/** Wished movies being bought: one, or the movies of a wished box set. */
export interface MovieBuying {
  movies: Array<{ id: number; tmdbId: number; title: string; posterPath: string | null; year: string | null; format: string | null }>;
  boxName?: string | null;
}

interface MovieFinderProps {
  mode: MovieFinderMode;
  onHead: (head: MovieFinderHead) => void;
  /** A movie added, wished, bought or taken off the wish list. */
  onChanged: (movie: unknown) => void;
  onClose: () => void;
  onPhoto?: () => void;
  buying?: MovieBuying | null;
}

type View = 'search' | 'person' | 'saga' | 'edition' | 'box';

const DEBOUNCE_MS = 250;
const EDITION_CHIPS = ['Steelbook', "Director's Cut", 'Collector', 'Extended'];
const today = () => new Date().toISOString().slice(0, 10);
const remembered = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* a private window */ }
};
const formatLabel = (format: string) => (format === 'Blu-ray 4K' ? '4K UHD' : format);
const editionTitle = (title: string, edition: string) => (edition.trim() ? `${title}, ${edition.trim()}` : title);
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * A movie as one finds an album: as one types, a title, a director, an actor
 * or a saga. The people and sagas the words name get pills, which open their
 * movies; a saga's can be taken as one box set. On the wish list a click
 * wishes the movie in the format chosen beside the field; for the collection
 * it asks which edition: its format, what tells it apart, its price.
 */
const MovieFinder: React.FC<MovieFinderProps> = ({ mode, onHead, onChanged, onClose, onPhoto, buying }) => {
  const [view, setView] = useState<View>(buying ? (buying.movies.length > 1 ? 'box' : 'edition') : 'search');
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<FinderMovie[]>([]);
  const [people, setPeople] = useState<FinderPerson[]>([]);
  const [sagas, setSagas] = useState<FinderSaga[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [wishFormat, setWishFormat] = useState(() => remembered('dv.movieWishFormat', 'Blu-ray 4K'));
  // What was wished or taken off here, over what the search said.
  const [have, setHave] = useState<Record<number, MovieHave>>({});
  const [busy, setBusy] = useState<Set<number>>(new Set());

  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [credits, setCredits] = useState<{ directed: FinderMovie[]; actedIn: FinderMovie[] } | null>(null);
  const [role, setRole] = useState<'directed' | 'actedIn'>('directed');
  const [filter, setFilter] = useState('');

  const [saga, setSaga] = useState<{ id: number; name: string } | null>(null);
  const [sagaMovies, setSagaMovies] = useState<FinderMovie[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const [movie, setMovie] = useState<FinderMovie | null>(null);
  const [cameFrom, setCameFrom] = useState<View>('search');
  const [form, setForm] = useState<EditionInput & { boxName?: string }>(() => ({
    format: buying?.movies[0]?.format || remembered('dv.movieFormat', 'Blu-ray 4K'),
    edition: '', price: '', acquiredDate: today(), comments: '', boxName: buying?.boxName || '',
  }));
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const haveOf = (m: FinderMovie): MovieHave => have[m.id] ?? m.have;
  const wishMode = mode === 'wish' && !buying;

  // The search, as one types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setMovies([]); setPeople([]); setSagas([]); setSearching(false); setError(null); return; }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      movieFinderService.search(q, controller.signal)
        .then(found => { setMovies(found.movies); setPeople(found.people); setSagas(found.sagas); setActive(0); setError(null); setSearching(false); })
        .catch(e => { if ((e as Error).name !== 'AbortError') { setError((e as Error).message); setSearching(false); } });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const back = () => {
    if (buying) { onClose(); return; }
    if (view === 'edition') setView(cameFrom);
    else if (view === 'box') setView('saga');
    else setView('search');
  };

  useEffect(() => {
    const titles: Record<View, string> = {
      search: mode === 'wish' ? 'Add a movie to the wish list' : 'Add a movie',
      person: person?.name || '',
      saga: saga?.name || '',
      edition: buying ? 'Which edition did you buy?' : 'Which edition do you have?',
      box: buying ? 'Which box set did you buy?' : 'Which box set do you have?',
    };
    onHead({ title: titles[view], onBack: view === 'search' || buying ? undefined : back });
    if (view === 'search') setTimeout(() => searchRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, person, saga, mode]);

  useEffect(() => {
    (listRef.current?.querySelector('.finder__row--active') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  /* ---------- Acting ---------- */

  const toggleWish = async (m: FinderMovie) => {
    if (busy.has(m.id)) return;
    const had = haveOf(m);
    setBusy(prev => new Set(prev).add(m.id));
    try {
      if (had.wished) {
        await apiService.deleteMovie(had.wished.id);
        setHave(prev => ({ ...prev, [m.id]: { ...had, wished: null } }));
        onChanged(null);
      } else {
        const added = await movieFinderService.addMovie(m, 'wish', { format: wishFormat });
        setHave(prev => ({ ...prev, [m.id]: { ...had, wished: { id: added.id, format: wishFormat } } }));
        onChanged(added);
        toast(`${m.title} is on the wish list, in ${wishFormat}`, {
          tone: 'success',
          action: { label: 'Undo', onClick: () => { apiService.deleteMovie(added.id).then(() => { setHave(prev => ({ ...prev, [m.id]: had })); onChanged(null); }); } },
        });
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(m.id); return next; });
    }
  };

  const choose = (m: FinderMovie, from: View) => {
    if (wishMode) { toggleWish(m); return; }
    const owned = haveOf(m).owned;
    const last = remembered('dv.movieFormat', 'Blu-ray 4K');
    // The last format used, or the first one not already had.
    const format = owned.some(e => e.format === last && plain(e.title) === plain(m.title))
      ? MOVIE_FORMATS.find(f => !owned.some(e => e.format === f)) || last : last;
    setMovie(m);
    setForm({ format, edition: '', price: '', acquiredDate: today(), comments: '' });
    setCameFrom(from);
    setView('edition');
  };

  const openPerson = (p: FinderPerson) => {
    setPerson({ id: p.id, name: p.name });
    setCredits(null);
    setFilter('');
    setRole(p.role === 'director' ? 'directed' : 'actedIn');
    setView('person');
    movieFinderService.person(p.id)
      .then(found => {
        setCredits({ directed: found.directed, actedIn: found.actedIn });
        if (!found.directed.length) setRole('actedIn');
        else if (!found.actedIn.length) setRole('directed');
      })
      .catch(e => { setCredits({ directed: [], actedIn: [] }); toast((e as Error).message, { tone: 'danger' }); });
  };

  const openSaga = (s: FinderSaga) => {
    setSaga({ id: s.id, name: s.name });
    setSagaMovies(null);
    setView('saga');
    movieFinderService.saga(s.id)
      .then(found => {
        setSagaMovies(found.movies);
        // All of it but what one already has: a box set fills in what is missing.
        const missing = found.movies.filter(m => (wishMode ? !m.have.wished && !m.have.owned.length : !m.have.owned.length));
        setPicked(new Set((missing.length ? missing : found.movies).map(m => m.id)));
      })
      .catch(e => { setSagaMovies([]); toast((e as Error).message, { tone: 'danger' }); });
  };

  const pickedMovies = (sagaMovies || []).filter(m => picked.has(m.id));
  const boxName = () => `${saga?.name || ''}${pickedMovies.length > 1 ? `, ${pickedMovies.length} movies` : ''}`;

  const wishBox = async () => {
    setSaving(true);
    try {
      const name = boxName();
      const added = await movieFinderService.addBoxSet(name, pickedMovies, 'wish', { format: wishFormat });
      onChanged(added);
      toast(`The box set ${name} is on the wish list: ${added.movies.length} movies, in ${wishFormat}`, { tone: 'success' });
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally { setSaving(false); }
  };

  const save = async () => {
    setSaving(true);
    const edition: EditionInput = { format: form.format, edition: form.edition, price: form.price, acquiredDate: form.acquiredDate, comments: form.comments };
    try {
      remember('dv.movieFormat', form.format);
      if (buying) {
        const bought = await movieFinderService.buy(buying.movies.map(m => m.id), edition);
        onChanged(bought);
        toast(buying.movies.length > 1 ? `The box set ${buying.boxName || ''} is in the collection` : `${bought[0]?.title} is in the collection`, { tone: 'success' });
      } else if (view === 'box') {
        const added = await movieFinderService.addBoxSet(form.boxName || boxName(), pickedMovies, 'owned', edition);
        onChanged(added);
        toast(`The box set ${added.collection.name} is in the collection: ${added.movies.length} movies`, { tone: 'success' });
      } else if (movie) {
        const added = await movieFinderService.addMovie(movie, 'owned', edition);
        onChanged(added);
        toast(`${added.title} is in the collection, ${form.format}`, { tone: 'success' });
      }
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally { setSaving(false); }
  };

  /* ---------- Pieces ---------- */

  const haveTags = (m: FinderMovie) => {
    const h = haveOf(m);
    const formats = [...new Set(h.owned.map(e => shortFormat(e.format)).filter(Boolean))];
    return (
      <>
        {formats.length > 0 && <CoverTag variant={mode === 'owned' ? 'on' : 'gold'}>{formats.join(' · ')}</CoverTag>}
        {h.wished && <CoverTag variant={mode === 'wish' ? 'on' : 'gold'}>{`Wished${h.wished.format ? ` · ${shortFormat(h.wished.format)}` : ''}`}</CoverTag>}
      </>
    );
  };

  const rowAction = (m: FinderMovie) => {
    if (!wishMode) return <BsChevronRight className="finder__go" aria-hidden="true" />;
    const on = Boolean(haveOf(m).wished);
    return (
      <IconButton label={on ? 'Take it off the wish list' : 'Wish it'} size="sm" tone={on ? 'confirm' : undefined}
        loading={busy.has(m.id)} onClick={event => { event.stopPropagation(); toggleWish(m); }}>
        {on ? <BsCheckLg /> : <BsPlusLg />}
      </IconButton>
    );
  };

  const posterGrid = (list: FinderMovie[], onPick: (m: FinderMovie) => void, isPicked?: (m: FinderMovie) => boolean) => (
    <div className="finder__grid finder__grid--posters">
      {list.map(m => {
        const pick = isPicked ? isPicked(m) : undefined;
        const on = pick ?? (wishMode && Boolean(haveOf(m).wished));
        return (
          <div key={m.id} className={`finder__card cover-host${pick === false ? ' finder__card--out' : ''}`} onClick={() => onPick(m)}>
            <div className="finder__cover finder__cover--poster">
              {m.posterPath ? <img src={tmdbImage(m.posterPath, 'w342')} alt="" loading="lazy" /> : null}
              <span className="finder__card-tag">{haveTags(m)}</span>
              <CoverButton className="finder__card-button" size="small" reveal={on ? 'always' : 'hover'} active={on}
                label={isPicked ? (on ? 'Take it out of the box set' : 'Put it in the box set') : !wishMode ? 'Choose its edition' : on ? 'Take it off the wish list' : 'Wish it'}
                onClick={event => { event.stopPropagation(); onPick(m); }}>
                {!isPicked && !wishMode ? <BsChevronRight /> : on ? <BsCheckLg /> : <BsPlusLg />}
              </CoverButton>
            </div>
            <div className="finder__card-title">{m.title}</div>
            <div className="finder__card-meta">{m.year}</div>
          </div>
        );
      })}
    </div>
  );

  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: event.target.value }));

  const formatChoice = (
    <Segmented label="Format" value={form.format} onChange={format => setForm(prev => ({ ...prev, format }))}
      options={MOVIE_FORMATS.map(format => ({ value: format, label: formatLabel(format) }))} />
  );

  const priceAndDate = (shared: number) => {
    const total = parseFloat(String(form.price || '').replace(',', '.'));
    return (
      <>
        <label className="finder__field">
          <span>{shared > 1 ? 'Price of the box CHF' : 'Price CHF'}</span>
          <TextField inputMode="decimal" value={form.price} onChange={set('price')} placeholder="—" />
          {shared > 1 && <small>{Number.isFinite(total) ? `${(total / shared).toFixed(2)} CHF a movie` : 'Shared out among its movies'}</small>}
        </label>
        <label className="finder__field">
          <span>{buying ? 'Bought' : 'Acquired'}</span>
          <TextField type="date" value={form.acquiredDate} onChange={set('acquiredDate')} />
        </label>
      </>
    );
  };

  /* ---------- Views ---------- */

  const searchView = (
    <>
      <div className="finder__top finder__top--row">
        <TextField
          ref={searchRef}
          icon={<BsSearch />}
          placeholder="A title, a director, an actor, a saga: amélie, jeunet, bourne…"
          value={query}
          autoFocus
          aria-label="Search for a movie"
          suffix={searching ? '…' : movies.length ? `${movies.length} found` : undefined}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { setActive(i => Math.min(i + 1, movies.length - 1)); event.preventDefault(); }
            if (event.key === 'ArrowUp') { setActive(i => Math.max(i - 1, 0)); event.preventDefault(); }
            if (event.key === 'Enter' && movies[active]) { event.preventDefault(); choose(movies[active], 'search'); }
          }}
        />
        {wishMode && (
          <Segmented label="Wished in" value={wishFormat} onChange={format => { setWishFormat(format); remember('dv.movieWishFormat', format); }}
            options={MOVIE_FORMATS.slice(0, 3).map(format => ({ value: format, label: shortFormat(format), tooltip: `Wish movies in ${format}` }))} />
        )}
      </div>
      <div className="finder__results" ref={listRef}>
        {query.trim().length < 2 ? (
          <p className="finder__empty">Movies appear as you type: a title, a director, an actor, a saga.</p>
        ) : error ? (
          <p className="finder__empty">{error}</p>
        ) : (
          <>
            {sagas.length > 0 && (
              <>
                <div className="finder__label">Sagas</div>
                <div className="finder__artists">
                  {sagas.map(s => (
                    <button key={s.id} type="button" className="finder__artist" onClick={() => openSaga(s)} title={`The movies of ${s.name}, or its box set`}>
                      <span className="finder__faces" aria-hidden="true">
                        {s.posterPath ? <img className="finder__face--poster" src={tmdbImage(s.posterPath, 'w92')} alt="" /> : <BsCollectionPlay />}
                      </span>
                      <span className="finder__artist-name">{s.name}</span>
                      <span className="finder__artist-note">{s.movies} movies · or the box set</span>
                      <BsChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {people.length > 0 && (
              <>
                <div className="finder__label">People</div>
                <div className="finder__artists">
                  {people.map(p => (
                    <button key={p.id} type="button" className="finder__artist" onClick={() => openPerson(p)} title={`All the movies of ${p.name}`}>
                      <span className="finder__faces" aria-hidden="true">
                        {p.profilePath ? <img className="finder__face--round" src={tmdbImage(p.profilePath, 'w92')} alt="" />
                          : p.posters.length ? p.posters.map(x => <img key={x} className="finder__face--poster" src={tmdbImage(x, 'w92')} alt="" />)
                            : <BsPersonFill />}
                      </span>
                      <span className="finder__artist-name">{p.name}</span>
                      <span className="finder__artist-note">{p.role} · all their movies</span>
                      <BsChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {movies.length > 0 ? (
              <>
                <div className="finder__label">Movies</div>
                <div role="listbox" aria-label="Movies">
                  {movies.map((m, i) => (
                    <div key={`${m.mediaType}:${m.id}`} role="option" aria-selected={i === active}
                      className={`finder__row${i === active ? ' finder__row--active' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => choose(m, 'search')}>
                      {m.posterPath
                        ? <img className="finder__thumb finder__thumb--poster" src={tmdbImage(m.posterPath, 'w92')} alt="" loading="lazy" />
                        : <span className="finder__thumb finder__thumb--poster" />}
                      <span className="finder__text">
                        <span className="finder__title">{m.title}</span>
                        <span className="finder__meta">
                          {[m.year, m.mediaType === 'tv' ? 'TV series' : null, m.directors.join(', ') || null, m.originalTitle].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {haveTags(m)}
                      <kbd className="finder__key" aria-hidden="true">↵</kbd>
                      {rowAction(m)}
                    </div>
                  ))}
                </div>
              </>
            ) : searching ? (
              <Loading>Searching…</Loading>
            ) : (
              <p className="finder__empty">No movie found.</p>
            )}
          </>
        )}
      </div>
    </>
  );

  const shownCredits = useMemo(() => {
    const list = credits ? credits[role] : [];
    const words = plain(filter);
    return list.filter(m => !words || plain(m.title).includes(words) || (m.year || '').startsWith(words));
  }, [credits, role, filter]);

  const personView = person && (
    <>
      <div className="finder__top finder__top--row">
        <TextField icon={<BsFilter />} placeholder={`Filter the movies of ${person.name}: a title, a year…`} value={filter} autoFocus
          aria-label={`Filter the movies of ${person.name}`} onChange={event => setFilter(event.target.value)}
          suffix={credits ? (filter ? `${shownCredits.length} of ${credits[role].length}` : `${credits[role].length} movies`) : undefined}
          onKeyDown={event => { if (event.key === 'Enter' && shownCredits.length === 1) choose(shownCredits[0], 'person'); }} />
        {credits && credits.directed.length > 0 && credits.actedIn.length > 0 && (
          <Segmented label="Their movies" value={role} onChange={setRole}
            options={[{ value: 'directed', label: 'Directed', count: credits.directed.length }, { value: 'actedIn', label: 'Acted in', count: credits.actedIn.length }]} />
        )}
      </div>
      <div className="finder__results">
        {!credits ? <Loading>Loading the movies…</Loading>
          : !shownCredits.length ? <p className="finder__empty">{filter ? `No movie of ${person.name} with “${filter}”.` : 'No movie.'}</p>
            : (
              <>
                <p className="finder__hint">The oldest first · {wishMode ? 'click a poster to wish it' : 'click the one you have'}</p>
                {posterGrid(shownCredits, m => choose(m, 'person'))}
              </>
            )}
      </div>
    </>
  );

  const sagaView = saga && (
    <div className="finder__results">
      {!sagaMovies ? <Loading>Loading the saga…</Loading>
        : !sagaMovies.length ? <p className="finder__empty">No movie in this saga.</p>
          : (
            <>
              <p className="finder__hint">{sagaMovies.length} movies, in their order · click one to take it out of the box set, or to put it back</p>
              {posterGrid(sagaMovies, m => setPicked(prev => { const next = new Set(prev); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next; }),
                m => picked.has(m.id))}
            </>
          )}
    </div>
  );

  const editionMovie = buying ? buying.movies[0] : movie;
  const owned = movie ? haveOf(movie).owned : [];
  const duplicate = !buying && movie && owned.some(e => e.format === form.format && plain(e.title) === plain(editionTitle(movie.title, form.edition || '')));

  const editionView = editionMovie && (
    <div className="finder__results">
      <div className="finder__album">
        {editionMovie.posterPath ? <img className="finder__poster" src={tmdbImage(editionMovie.posterPath, 'w185')} alt="" /> : null}
        <div>
          <div className="finder__title">{editionMovie.title}</div>
          <div className="finder__meta">{[editionMovie.year, movie?.directors.join(', ')].filter(Boolean).join(' · ')}</div>
          {owned.length > 0 && (
            <div className="finder__already">Already in your collection: {owned.map(e => (
              <CoverTag key={e.id} variant="gold">{[shortFormat(e.format), plain(e.title) !== plain(movie!.title) ? e.title : null].filter(Boolean).join(' · ')}</CoverTag>
            ))}</div>
          )}
          {buying && buying.movies[0].format && <div className="finder__already">Wished in <CoverTag>{buying.movies[0].format}</CoverTag></div>}
        </div>
      </div>
      <div className="finder__form">
        <div className="finder__field finder__field--wide"><span>Format</span>{formatChoice}</div>
        <label className="finder__field finder__field--wide">
          <span>Edition <small>what tells it apart, if anything</small></span>
          <TextField value={form.edition} onChange={set('edition')} placeholder="Steelbook, Director's Cut, Collector, 2-disc…" />
        </label>
        <div className="finder__chips">
          {EDITION_CHIPS.map(chip => (
            <Chip key={chip} active={form.edition === chip} onClick={() => setForm(prev => ({ ...prev, edition: prev.edition === chip ? '' : chip }))}>{chip}</Chip>
          ))}
        </div>
        {priceAndDate(1)}
        <label className="finder__field finder__field--wide">
          <span>Comments</span>
          <TextField value={form.comments} onChange={set('comments')} placeholder="Where, from whom…" />
        </label>
      </div>
      {duplicate && <p className="finder__warn">You already have this {shortFormat(form.format)}: name what tells this one apart (a Steelbook…), or choose another format.</p>}
    </div>
  );

  const boxMovies = buying ? buying.movies : pickedMovies.map(m => ({ id: m.id, tmdbId: m.id, title: m.title, posterPath: m.posterPath, year: m.year, format: null }));
  const boxView = (
    <div className="finder__results">
      <div className="finder__form">
        <label className="finder__field finder__field--wide">
          <span>Box set</span>
          <TextField value={buying ? buying.boxName || '' : form.boxName || boxName()} readOnly={Boolean(buying)} onChange={set('boxName')} />
        </label>
        <ol className="finder__boxlist">
          {boxMovies.map(m => (
            <li key={m.id}>{m.posterPath ? <img src={tmdbImage(m.posterPath, 'w92')} alt="" /> : <span className="finder__boxlist-blank" />}<span>{m.title}</span><small>{m.year}</small></li>
          ))}
        </ol>
        <div className="finder__field finder__field--wide"><span>Format, for every movie of the box</span>{formatChoice}</div>
        {priceAndDate(boxMovies.length)}
      </div>
    </div>
  );

  /* ---------- Footer ---------- */

  const footer = (() => {
    if (view === 'edition') {
      return (
        <>
          <span className="finder__note">{buying ? '' : 'Added at once: its ratings and cast follow.'}</span>
          <Button variant="quiet" onClick={back}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={Boolean(duplicate)}>
            {buying ? 'I bought it' : `Add this ${formatLabel(form.format)}`}
          </Button>
        </>
      );
    }
    if (view === 'box') {
      return (
        <>
          <span className="finder__note">Its movies in their order, each a {form.format} of the collection.</span>
          <Button variant="quiet" onClick={back}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!boxMovies.length}>
            {buying ? 'I bought the box set' : `Add the box set (${boxMovies.length})`}
          </Button>
        </>
      );
    }
    if (view === 'saga') {
      return (
        <>
          <span className="finder__note">{wishMode ? `Wished together, in ${wishFormat}, as one box set.` : 'Then its format and price, for the whole box.'}</span>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!picked.size}
            onClick={() => { if (wishMode) wishBox(); else { setForm(prev => ({ ...prev, boxName: boxName(), format: remembered('dv.movieFormat', 'Blu-ray 4K') })); setView('box'); } }}>
            {wishMode ? `Wish the box set (${picked.size})` : `I have the box set (${picked.size})`}
          </Button>
        </>
      );
    }
    return (
      <>
        <span className="finder__note">
          {view === 'search' && (wishMode ? 'One click wishes the movie, in the format chosen beside the field.' : 'Choose the movie, then its edition.')}
        </span>
        {!wishMode && onPhoto && <Button icon={<BsCamera />} onClick={onPhoto} title="Photograph the cover, as before">Photo</Button>}
        <Button variant="quiet" onClick={onClose}>{wishMode ? 'Done' : 'Cancel'}</Button>
      </>
    );
  })();

  return (
    <>
      <Dialog.Body className="finder">
        {view === 'search' && searchView}
        {view === 'person' && personView}
        {view === 'saga' && sagaView}
        {view === 'edition' && editionView}
        {view === 'box' && boxView}
      </Dialog.Body>
      <Dialog.Footer className="finder__footer">{footer}</Dialog.Footer>
    </>
  );
};

export default MovieFinder;
