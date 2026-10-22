import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BsCamera, BsCheckLg, BsChevronRight, BsFilter, BsPencil, BsPersonFill, BsPlusLg, BsSearch, BsUpcScan } from 'react-icons/bs';
import bookFinderService, {
  BookEdition, BookFormat, BookKind, BookLanguage, FinderAuthor, FinderBook, FinderSeries,
} from '../services/bookFinderService';
import bookService from '../services/bookService';
import Button, { IconButton } from './shared/Button';
import CoverButton from './shared/CoverButton';
import CoverTag from './shared/CoverTag';
import Dialog from './shared/Dialog';
import Segmented from './shared/Segmented';
import { Loading } from './shared/Spinner';
import { TextField } from './shared/TextField';
import toast from './shared/Toast';
import { downscaleImage, base64ToFile } from '../utils/downscaleImage';
import { decodeBarcode } from '../utils/decodeBarcode';
import { straightenIfSure } from '../utils/straightenPhoto';
import CoverCropDialog from './CoverCropDialog';
import OwnerField from './OwnerField';
import Menu, { MenuChevron } from './shared/Menu';
import { useNarrow } from '../utils/useNarrow';
import './finder.css';

export type BookFinderMode = 'wish' | 'owned';
type Photo = { base64: string; mimeType: string };

export interface BookFinderHead {
  title: string;
  onBack?: () => void;
}

/** Wished books being bought. */
export interface BookBuying {
  books: Array<{ id: number; title: string; cover: string | null; authors: string[]; year: string | null; series: string | null; seriesNumber: number | null;
    bookType: string | null; language: string | null; format: string | null; owner: string | null }>;
}

interface BookFinderProps {
  mode: BookFinderMode;
  onHead: (head: BookFinderHead) => void;
  /** A book added, wished, bought or taken off the wish list. */
  onChanged: (book: unknown) => void;
  onClose: () => void;
  /** Fill the form from the book's photographs, those already taken handed over. */
  onPhotos?: (taken: { front?: Photo; back?: Photo }) => void;
  onIsbn?: () => void;
  /** Type it by hand: the words searched, when nothing was found, as its title. */
  onManual?: (title?: string) => void;
  buying?: BookBuying | null;
  /** The kind it opens on, rather than the last chosen: Score from the scores' section. */
  initialKind?: BookKind;
  /** From the reading journal: the edition asks when it was read. */
  reading?: boolean;
}

type View = 'search' | 'series' | 'author' | 'edition';

const DEBOUNCE_MS = 300;
const LANGUAGES: Array<{ value: BookLanguage; label: string }> = [{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }, { value: 'de', label: 'DE' }, { value: 'any', label: 'Any' }];
const KINDS: Array<{ value: BookKind; label: string }> = [{ value: 'all', label: 'All' }, { value: 'graphic-novel', label: 'BD' }, { value: 'book', label: 'Book' }, { value: 'score', label: 'Score' }];
const FORMATS: Array<{ value: BookFormat; label: string }> = [{ value: 'physical', label: 'Paper' }, { value: 'ebook', label: 'Ebook' }, { value: 'audiobook', label: 'Audiobook' }];
const kindLabel = (kind: string | null | undefined) => KINDS.find(k => k.value === kind)?.label || '';
const today = () => new Date().toISOString().slice(0, 10);
const remembered = <T extends string>(key: string, fallback: T): T => {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
};
const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* a private window */ }
};
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const keyOf = (book: FinderBook) => book.isbn13 || book.isbn10 || book.googleId;
const cover = (path: string | null | undefined) => bookService.getImageUrl(path) || '';
/** A volume's own title, without the series' words before it: "Au coeur de mes zoorigines". */
const volumeTitle = (book: FinderBook) => book.subtitle
  || book.title.replace(/^.*?(?:\(\s*)?(?:tome|vol\.?|volume|t)\s*0*\d+\s*\)?\s*[-:–]*\s*/i, '') || book.title;

/**
 * A book as one finds an album or a movie: as one types, a title, an author
 * or a series, in a language and of a kind (BD, book, score) chosen beside the
 * field. A series the words name gets a pill that opens its volumes, numbered:
 * those one has, those missing, the next one; an author, one that opens their
 * books. On the wish list a click wishes the book; for the library it asks its
 * edition: kind, format, language, price, date, whose it is.
 */
const BookFinder: React.FC<BookFinderProps> = ({ mode, onHead, onChanged, onClose, onPhotos, onIsbn, onManual, buying, initialKind, reading }) => {
  const [view, setView] = useState<View>(buying ? 'edition' : 'search');
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<BookLanguage>(() => remembered('dv.bookLanguage', 'fr'));
  const [kind, setKind] = useState<BookKind>(() => initialKind ?? remembered('dv.bookKind', 'all'));
  const [books, setBooks] = useState<FinderBook[]>([]);
  const [series, setSeries] = useState<FinderSeries[]>([]);
  const [authors, setAuthors] = useState<FinderAuthor[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // What was wished or taken off here, over what the search said.
  const [have, setHave] = useState<Record<string, FinderBook['have']>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const [serie, setSerie] = useState<FinderSeries | null>(null);
  const [volumes, setVolumes] = useState<FinderBook[] | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [author, setAuthor] = useState<FinderAuthor | null>(null);
  const [authorBooks, setAuthorBooks] = useState<FinderBook[] | null>(null);
  const [filter, setFilter] = useState('');

  const [chosen, setChosen] = useState<FinderBook[]>([]);
  const [cameFrom, setCameFrom] = useState<View>('search');
  const [form, setForm] = useState<BookEdition>(() => ({
    bookType: ((buying?.books[0]?.bookType as BookEdition['bookType']) || 'book'),
    format: ((buying?.books[0]?.format as BookFormat) || 'physical'),
    language: buying?.books[0]?.language || 'fr',
    owner: buying?.books[0]?.owner || '',
    priceChf: '', purchasedAt: today(),
  }));
  const [saving, setSaving] = useState(false);
  // Mine, or borrowed (a friend's, the library's): then no price, and whose it is.
  const [borrowed, setBorrowed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrow();
  // The book photographed, its back first: its barcode is its ISBN, the edition itself, read here at once; the model
  // reads its blurb meanwhile, or its ISBN, title and author when the barcode will not read. Its front, if taken, is its cover.
  const backRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ front?: Photo; back?: Photo }>({});
  const [readingPhoto, setReadingPhoto] = useState<'back' | 'blurb' | null>(null);
  const [blurb, setBlurb] = useState<string | null>(null);
  const [isbnRead, setIsbnRead] = useState<'barcode' | 'model' | null>(null);
  // The photos as taken, for the straightening dialog; each kept side is squared, by itself when the
  // detector is sure, else in the dialog opened at once on its best guess, and again on a tap of its thumbnail.
  const originals = useRef<{ front?: File; back?: File }>({});
  const [straightening, setStraightening] = useState<'front' | 'back' | null>(null);

  /** A side taken: squared when the detector is sure, else the dialog to check its corners. */
  const keepSide = async (side: 'front' | 'back', file: File) => {
    originals.current[side] = file;
    const squared = await straightenIfSure(file, 'book').catch(() => null);
    const kept = await downscaleImage(squared || file);
    setPhotos(prev => ({ ...prev, [side]: kept }));
    if (!squared) setStraightening(side);
    return kept;
  };

  const photographedBack = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReadingPhoto('back');
    setBlurb(null);
    setIsbnRead(null);
    try {
      setPhotos({});
      // The barcode read off the photo as taken, while the back is squared: the search does not wait for it.
      const [back, code] = await Promise.all([keepSide('back', file), decodeBarcode(file).catch(() => null)]);
      const isbn = code && /^97[89]\d{10}$/.test(code) ? code : null;
      if (isbn) { setQuery(isbn); setIsbnRead('barcode'); setReadingPhoto('blurb'); }
      const { draft } = await bookService.readPhotos({ back });
      setBlurb(draft.description);
      if (!isbn) {
        if (draft.isbn13) { setQuery(draft.isbn13); setIsbnRead('model'); }
        else if (draft.title) setQuery([draft.title, draft.authors[0]].filter(Boolean).join(' '));
        else toast('Nothing could be read on this back: try another photo, or its front.', { tone: 'warning' });
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setReadingPhoto(null);
    }
  };

  const photographedFront = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      try { await keepSide('front', file); } catch (e) { toast((e as Error).message, { tone: 'danger' }); }
    }
  };

  /** A book added from the photos: its blurb as printed, its back kept, its front as its cover when taken. */
  const keepPhotos = async (added: { id?: number } | null) => {
    if (!added?.id || (!photos.back && !photos.front)) return;
    try {
      if (photos.back) await bookService.uploadBackCover(added.id, base64ToFile(photos.back.base64, photos.back.mimeType, 'back.jpg'));
      if (photos.front) await bookService.uploadCover(added.id, base64ToFile(photos.front.base64, photos.front.mimeType, 'front.jpg'));
    } catch (e) {
      toast(`Added, its photos not: ${(e as Error).message}`, { tone: 'warning' });
    }
  };

  const listRef = useRef<HTMLDivElement>(null);

  const wishMode = mode === 'wish' && !buying;
  const haveOf = (book: FinderBook) => (keyOf(book) in have ? have[keyOf(book)] : book.have);
  const ofKind = (book: FinderBook) => kind === 'all' || book.bookType === kind;
  const shown = useMemo(() => books.filter(ofKind), [books, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // The search, as one types; again when the language or the kind changes.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setBooks([]); setSeries([]); setAuthors([]); setSearching(false); setError(null); return; }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      bookFinderService.search(q, language, kind, controller.signal)
        .then(found => { setBooks(found.books); setSeries(found.series); setAuthors(found.authors); setActive(0); setError(null); setSearching(false); })
        .catch(e => { if ((e as Error).name !== 'AbortError') { setError((e as Error).message); setSearching(false); } });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, language, kind]);

  const back = () => {
    if (buying) { onClose(); return; }
    setView(view === 'edition' ? cameFrom : 'search');
  };

  useEffect(() => {
    const titles: Record<View, string> = {
      search: mode === 'wish' ? 'Add a book to the wish list' : reading ? 'Add a reading' : initialKind === 'score' ? 'Add a score' : 'Add a book',
      series: serie?.name || '',
      author: author?.name || '',
      edition: buying ? 'Which edition did you buy?' : chosen.length > 1 ? `${chosen.length} volumes of ${serie?.name || ''}` : 'Which edition do you have?',
    };
    onHead({ title: titles[view], onBack: view === 'search' || buying ? undefined : back });
    if (view === 'search') setTimeout(() => searchRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, serie, author, chosen, mode]);

  useEffect(() => {
    (listRef.current?.querySelector('.finder__row--active') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  /* ---------- Acting ---------- */

  const editionFor = (book: FinderBook): BookEdition => ({
    bookType: kind !== 'all' ? kind : book.bookType,
    format: 'physical',
    language: book.language || (language !== 'any' ? language : 'fr'),
    // Whose it is: the owner last given here, rather than none (none is no one's, not one's own).
    owner: remembered('dv.bookOwner', ''), priceChf: '', purchasedAt: today(),
    ...(reading ? { readDate: today(), read: true } : {}),
  });

  const toggleWish = async (book: FinderBook) => {
    const key = keyOf(book);
    const had = haveOf(book);
    if (busy.has(key) || (had && had.status !== 'wish')) return;
    setBusy(prev => new Set(prev).add(key));
    try {
      if (had) {
        await bookService.deleteBook(had.id);
        setHave(prev => ({ ...prev, [key]: null }));
        onChanged(null);
      } else {
        const added = await bookFinderService.add(book, 'wish', editionFor(book));
        setHave(prev => ({ ...prev, [key]: { status: 'wish', id: added.id } }));
        onChanged(added);
        toast(`${book.title} is on the wish list`, {
          tone: 'success',
          action: { label: 'Undo', onClick: () => { bookService.deleteBook(added.id).then(() => { setHave(prev => ({ ...prev, [key]: null })); onChanged(null); }); } },
        });
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const choose = (book: FinderBook, from: View) => {
    if (wishMode) { toggleWish(book); return; }
    setChosen([book]);
    setForm(editionFor(book));
    setBorrowed(false);
    setCameFrom(from);
    setView('edition');
  };

  const openSeries = (s: FinderSeries) => {
    setSerie(s);
    setVolumes(null);
    setView('series');
    bookFinderService.series(s.name, s.authors[0] || null, language)
      .then(found => {
        setVolumes(found.volumes);
        setMissing(found.missingNumbers);
        // The volumes one has not are chosen: to wish them, or the ones one has just got.
        setPicked(new Set(found.volumes.filter(v => !v.have).map(keyOf)));
      })
      .catch(e => { setVolumes([]); toast((e as Error).message, { tone: 'danger' }); });
  };

  const openAuthor = (a: FinderAuthor) => {
    setAuthor(a);
    setAuthorBooks(null);
    setFilter('');
    setView('author');
    bookFinderService.author(a.name, language)
      .then(found => setAuthorBooks(found.books))
      .catch(e => { setAuthorBooks([]); toast((e as Error).message, { tone: 'danger' }); });
  };

  const pickedVolumes = (volumes || []).filter(v => picked.has(keyOf(v)));

  const wishVolumes = async () => {
    setSaving(true);
    try {
      const result = await bookFinderService.addMany(pickedVolumes, 'wish', editionFor(pickedVolumes[0]));
      onChanged(result.added);
      toast(`${result.added.length} volumes of ${serie?.name} on the wish list${result.errors.length ? `; ${result.errors.length} were already there` : ''}`, { tone: 'success' });
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally { setSaving(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      remember('dv.bookFormat', form.format);
      if (!borrowed) remember('dv.bookOwner', (form.owner || '').trim());
      if (buying) {
        const bought = await bookFinderService.buy(buying.books.map(b => b.id), form);
        onChanged(bought);
        toast(`${bought.length > 1 ? `${bought.length} books` : bought[0]?.title} in the library`, { tone: 'success' });
      } else if (chosen.length > 1) {
        const result = await bookFinderService.addMany(chosen, borrowed ? 'borrowed' : 'owned', borrowed ? { ...form, priceChf: undefined, purchasedAt: undefined } : form);
        onChanged(result.added);
        toast(`${result.added.length} volumes in the library${borrowed ? ', borrowed' : ''}${result.errors.length ? `; ${result.errors.map(e => e.error).join(', ')}` : ''}`, { tone: result.errors.length ? 'warning' : 'success' });
      } else {
        const book = blurb && (photos.back || photos.front) ? { ...chosen[0], description: blurb } : chosen[0];
        const added = await bookFinderService.add(book, borrowed ? 'borrowed' : 'owned', borrowed ? { ...form, priceChf: undefined, purchasedAt: undefined } : form);
        await keepPhotos(added as { id?: number });
        onChanged(added);
        toast(`${added.title} is in the library${borrowed ? ', borrowed' : ''}`, { tone: 'success' });
      }
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally { setSaving(false); }
  };

  /* ---------- Pieces ---------- */

  const haveTag = (book: FinderBook) => {
    const had = haveOf(book);
    if (!had) return null;
    const on = (mode === 'wish' && had.status === 'wish') || (mode === 'owned' && had.status !== 'wish');
    return <CoverTag variant={on ? 'on' : 'gold'}>{had.status === 'wish' ? 'Wished' : had.status === 'borrowed' ? 'Borrowed' : 'Owned'}</CoverTag>;
  };

  const rowAction = (book: FinderBook) => {
    if (!wishMode) return <BsChevronRight className="finder__go" aria-hidden="true" />;
    const had = haveOf(book);
    if (had && had.status !== 'wish') return null;
    const on = Boolean(had);
    return (
      <IconButton label={on ? 'Take it off the wish list' : 'Wish it'} size="sm" tone={on ? 'confirm' : undefined}
        loading={busy.has(keyOf(book))} onClick={event => { event.stopPropagation(); toggleWish(book); }}>
        {on ? <BsCheckLg /> : <BsPlusLg />}
      </IconButton>
    );
  };

  const set = (field: keyof BookEdition) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: event.target.value }));

  /* ---------- Views ---------- */

  const hidden = books.length - shown.length;
  const chooseKind = (value: BookKind) => { setKind(value); remember('dv.bookKind', value); setActive(0); };
  const chooseLanguage = (value: BookLanguage) => { setLanguage(value); remember('dv.bookLanguage', value); };

  const searchView = (
    <>
      <div className="finder__top finder__top--row">
        <TextField
          ref={searchRef}
          icon={<BsSearch />}
          placeholder="A title, an author, a series: sorceline, arleston, royaumes de feu…"
          value={query}
          autoFocus
          aria-label="Search for a book"
          suffix={searching ? '…' : shown.length ? `${shown.length} found` : undefined}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { setActive(i => Math.min(i + 1, shown.length - 1)); event.preventDefault(); }
            if (event.key === 'ArrowUp') { setActive(i => Math.max(i - 1, 0)); event.preventDefault(); }
            if (event.key === 'Enter' && shown[active]) { event.preventDefault(); choose(shown[active], 'search'); }
          }}
        />
        {narrow ? (
          // A phone: the kind and the language as two menus in one row, rather than two rows of buttons.
          <div className="finder__pills">
            <Menu label="Kind" trigger={(props, open) => (
              <button type="button" {...props} className="menu-pill"><span className="menu-pill__muted">Kind:</span> {kindLabel(kind)}<MenuChevron open={open} /></button>
            )}>
              {KINDS.map(option => (
                <Menu.Choice key={option.value} selected={option.value === kind} onSelect={() => chooseKind(option.value)}>{option.label}</Menu.Choice>
              ))}
            </Menu>
            <Menu label="Language" trigger={(props, open) => (
              <button type="button" {...props} className="menu-pill"><span className="menu-pill__muted">Language:</span> {LANGUAGES.find(l => l.value === language)?.label}<MenuChevron open={open} /></button>
            )}>
              {LANGUAGES.map(option => (
                <Menu.Choice key={option.value} selected={option.value === language} onSelect={() => chooseLanguage(option.value)}>{option.label}</Menu.Choice>
              ))}
            </Menu>
          </div>
        ) : (
          <>
            <Segmented label="Kind" value={kind} onChange={chooseKind} options={KINDS} />
            <Segmented label="Language" value={language} onChange={chooseLanguage} options={LANGUAGES} />
          </>
        )}
      </div>
      {(photos.back || readingPhoto) && (
        <div className="finder__photo">
          {(['back', 'front'] as const).map(side => photos[side] && (
            <button key={side} type="button" className="finder__photo-thumb" title={`Straighten ${side === 'back' ? 'its back' : 'its cover'}`}
              onClick={() => originals.current[side] && setStraightening(side)}>
              <img src={`data:${photos[side]!.mimeType};base64,${photos[side]!.base64}`} alt={side === 'back' ? 'Its back' : 'Its cover'} />
            </button>
          ))}
          <span>
            {readingPhoto === 'back' ? 'Reading its back…'
              : isbnRead === 'barcode' ? `ISBN off its barcode${readingPhoto === 'blurb' ? ', reading its blurb…' : blurb ? ', its blurb kept' : ''}`
              : isbnRead === 'model' ? `ISBN read on its back${blurb ? ', its blurb kept' : ''}`
              : 'Searched with what its back says.'}
            {photos.front && ' · its cover taken'}
          </span>
          {!readingPhoto && (
            <span className="finder__photo-actions">
              {!photos.front && <Button size="sm" icon={<BsCamera />} onClick={() => frontRef.current?.click()} title="Photograph its front: it becomes its cover, rather than the one found">Its cover</Button>}
              {onPhotos && <Button size="sm" variant="quiet" onClick={() => onPhotos(photos)} title="Not found: fill the form from the photos">From the photos</Button>}
            </span>
          )}
        </div>
      )}
      <div className="finder__results" ref={listRef}>
        {query.trim().length < 2 ? (
          <p className="finder__empty">Books appear as you type: a title, an author, a series.</p>
        ) : error ? (
          <p className="finder__empty">{error}</p>
        ) : (
          <>
            {series.length > 0 && (
              <>
                <div className="finder__label">Series</div>
                <div className="finder__artists">
                  {series.map(s => (
                    <button key={s.name} type="button" className="finder__artist" onClick={() => openSeries(s)} title={`The volumes of ${s.name}`}>
                      <span className="finder__faces" aria-hidden="true">{s.covers.map(c => <img key={c} className="finder__face--poster" src={c} alt="" />)}</span>
                      <span className="finder__artist-name">{s.name}</span>
                      <span className="finder__artist-note">{s.volumes}+ volumes{s.authors[0] ? ` · ${s.authors[0]}` : ''}</span>
                      <BsChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {authors.length > 0 && (
              <>
                <div className="finder__label">Authors</div>
                <div className="finder__artists">
                  {authors.map(a => (
                    <button key={a.name} type="button" className="finder__artist" onClick={() => openAuthor(a)} title={`All the books of ${a.name}`}>
                      <span className="finder__faces" aria-hidden="true">
                        {a.covers.length ? a.covers.map(c => <img key={c} className="finder__face--poster" src={c} alt="" />) : <BsPersonFill />}
                      </span>
                      <span className="finder__artist-name">{a.name}</span>
                      <span className="finder__artist-note">all their books</span>
                      <BsChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {shown.length > 0 ? (
              <>
                <div className="finder__label">Books{hidden > 0 && <span className="finder__label-note"> · {hidden} of another kind hidden</span>}</div>
                <div role="listbox" aria-label="Books">
                  {shown.map((book, i) => (
                    <div key={keyOf(book)} role="option" aria-selected={i === active}
                      className={`finder__row${i === active ? ' finder__row--active' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => choose(book, 'search')}>
                      {book.cover ? <img className="finder__thumb finder__thumb--poster" src={book.cover} alt="" loading="lazy" /> : <span className="finder__thumb finder__thumb--poster" />}
                      <span className="finder__text">
                        <span className="finder__title">{book.title}</span>
                        <span className="finder__meta">{[book.authors.join(', '), book.year, book.publisher, kindLabel(book.bookType)].filter(Boolean).join(' · ')}</span>
                      </span>
                      {haveTag(book)}
                      <kbd className="finder__key" aria-hidden="true">↵</kbd>
                      {rowAction(book)}
                    </div>
                  ))}
                </div>
              </>
            ) : searching ? (
              <Loading>Searching…</Loading>
            ) : (
              <div className="finder__empty">
                <p>{kind === 'all' ? 'No book found.' : `No ${kindLabel(kind)} found${hidden ? `: ${hidden} of another kind, shown with All` : ''}.`}</p>
                {/* Not found: its form, filled from its photos (those missing asked, the BnF completing), or by hand. */}
                {!wishMode && (photos.back || photos.front) && onPhotos && (
                  <Button icon={<BsCamera />} onClick={() => onPhotos(photos)}>Fill its form from its photos</Button>
                )}
                {!wishMode && !(photos.back || photos.front) && onManual && (
                  <Button icon={<BsPencil />} onClick={() => onManual(/^[\d\s-]+$/.test(query) ? undefined : query.trim())}>Fill it by hand</Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  const ownedNumbers = new Set((volumes || []).filter(v => v.have && v.have.status !== 'wish').map(v => v.seriesNumber));
  const next = (volumes || []).find(v => !v.have && (v.seriesNumber ?? 0) > Math.max(0, ...[...ownedNumbers].map(n => n ?? 0)));
  const seriesView = serie && (
    <div className="finder__results">
      {!volumes ? <Loading>Finding its volumes…</Loading>
        : !volumes.length ? <p className="finder__empty">No volume of {serie.name} found.</p>
          : (
            <>
              <p className="finder__hint">
                {volumes.length} volumes found{missing.length ? `, ${missing.map(n => `T${n}`).join(', ')} not found` : ''} · {ownedNumbers.size} owned{next ? ` · next: T${next.seriesNumber}` : ''}
                {' · '}{wishMode ? 'the ones you have not are chosen' : 'choose the ones you have just got'}
              </p>
              <div className="finder__grid finder__grid--posters">
                {[...volumes.map(v => ({ n: v.seriesNumber ?? 0, v })), ...missing.map(n => ({ n, v: null as FinderBook | null }))].sort((a, b) => a.n - b.n).map(({ n, v }) => {
                  if (!v) {
                    return (
                      <div key={`missing-${n}`} className="finder__card finder__card--missing">
                        <div className="finder__cover finder__cover--poster"><span><b>T{n}</b>not found</span></div>
                      </div>
                    );
                  }
                  const on = picked.has(keyOf(v));
                  const had = Boolean(v.have);
                  return (
                    <div key={keyOf(v)} className={`finder__card cover-host${!had && !on ? ' finder__card--out' : ''}${next === v ? ' finder__card--next' : ''}`}
                      onClick={() => { if (had) return; setPicked(prev => { const nextSet = new Set(prev); if (nextSet.has(keyOf(v))) nextSet.delete(keyOf(v)); else nextSet.add(keyOf(v)); return nextSet; }); }}>
                      <div className="finder__cover finder__cover--poster">
                        {v.cover ? <img src={cover(v.cover)} alt="" loading="lazy" /> : null}
                        <span className="finder__card-tag">{haveTag(v)}</span>
                        <span className="finder__card-number"><CoverTag>{`T${n}`}</CoverTag></span>
                        {!had && (
                          <CoverButton className="finder__card-button" size="small" reveal={on ? 'always' : 'hover'} active={on}
                            label={on ? 'Leave it' : 'Choose it'} onClick={event => { event.stopPropagation(); setPicked(prev => { const nextSet = new Set(prev); if (nextSet.has(keyOf(v))) nextSet.delete(keyOf(v)); else nextSet.add(keyOf(v)); return nextSet; }); }}>
                            {on ? <BsCheckLg /> : <BsPlusLg />}
                          </CoverButton>
                        )}
                      </div>
                      <div className="finder__card-title">{volumeTitle(v)}</div>
                      <div className="finder__card-meta">{v.googleId.startsWith('library:') ? 'from your library' : v.year}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
    </div>
  );

  const shownAuthorBooks = useMemo(() => {
    const words = plain(filter);
    return (authorBooks || []).filter(b => !words || plain(`${b.title} ${b.series || ''}`).includes(words) || (b.year || '').startsWith(words));
  }, [authorBooks, filter]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, FinderBook[]>();
    for (const book of shownAuthorBooks) {
      const name = book.series || 'Other books';
      byGroup.set(name, [...(byGroup.get(name) || []), book]);
    }
    return [...byGroup];
  }, [shownAuthorBooks]);

  const authorView = author && (
    <>
      <div className="finder__top">
        <TextField icon={<BsFilter />} placeholder={`Filter the books of ${author.name}: a title, a series, a year…`} value={filter} autoFocus
          aria-label={`Filter the books of ${author.name}`} onChange={event => setFilter(event.target.value)} />
      </div>
      <div className="finder__results">
        {!authorBooks ? <Loading>Finding their books…</Loading>
          : !shownAuthorBooks.length ? <p className="finder__empty">No book.</p>
            : groups.map(([name, list]) => (
              <React.Fragment key={name}>
                <div className="finder__label">{name} · {list.length}</div>
                <div className="finder__grid finder__grid--posters">
                  {list.map(book => {
                    const on = wishMode && haveOf(book)?.status === 'wish';
                    return (
                      <div key={keyOf(book)} className="finder__card cover-host" onClick={() => choose(book, 'author')}>
                        <div className="finder__cover finder__cover--poster">
                          {book.cover ? <img src={book.cover} alt="" loading="lazy" /> : null}
                          <span className="finder__card-tag">{haveTag(book)}</span>
                          {book.seriesNumber ? <span className="finder__card-number"><CoverTag>{`T${book.seriesNumber}`}</CoverTag></span> : null}
                          <CoverButton className="finder__card-button" size="small" reveal={on ? 'always' : 'hover'} active={on}
                            label={!wishMode ? 'Choose its edition' : on ? 'Take it off the wish list' : 'Wish it'}
                            onClick={event => { event.stopPropagation(); choose(book, 'author'); }}>
                            {!wishMode ? <BsChevronRight /> : on ? <BsCheckLg /> : <BsPlusLg />}
                          </CoverButton>
                        </div>
                        <div className="finder__card-title">{book.title}</div>
                        <div className="finder__card-meta">{book.year}</div>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            ))}
      </div>
    </>
  );

  const many = buying ? buying.books.length : chosen.length;
  const first = buying ? buying.books[0] : chosen[0];
  const total = parseFloat(String(form.priceChf || '').replace(',', '.'));
  const editionView = first && (
    <div className="finder__results">
      <div className="finder__album">
        {first.cover ? <img className="finder__poster" src={cover(first.cover)} alt="" /> : null}
        <div>
          <div className="finder__title">{many > 1 && !buying ? serie?.name : first.title}</div>
          <div className="finder__meta">
            {many > 1 ? (buying ? buying.books : chosen).map(b => (b.seriesNumber ? `T${b.seriesNumber}` : b.title)).join(', ')
              : [first.authors.join(', '), first.year].filter(Boolean).join(' · ')}
          </div>
          {many === 1 && first.series && <div className="finder__already">{first.series}{first.seriesNumber ? ` · volume ${first.seriesNumber}` : ''}</div>}
        </div>
      </div>
      <div className="finder__form">
        {!buying && (
          <div className="finder__field finder__field--wide"><span>Whose</span>
            <Segmented label="Whose" value={borrowed ? 'borrowed' : 'mine'} onChange={value => {
              // Borrowed from someone is not whose it would be: the field starts empty, and the owner comes back with Mine.
              const lent = value === 'borrowed';
              setBorrowed(lent);
              setForm(prev => ({ ...prev, owner: lent ? '' : remembered('dv.bookOwner', '') }));
            }}
              options={[{ value: 'mine', label: 'Mine' }, { value: 'borrowed', label: 'Borrowed' }]} />
          </div>
        )}
        <div className="finder__field"><span>Kind</span>
          <Segmented label="Kind" value={form.bookType} onChange={bookType => setForm(prev => ({ ...prev, bookType }))} options={KINDS.slice(1) as Array<{ value: BookEdition['bookType']; label: string }>} />
        </div>
        <div className="finder__field"><span>Format</span>
          <Segmented label="Format" value={form.format} onChange={format => setForm(prev => ({ ...prev, format }))} options={FORMATS} />
        </div>
        <div className="finder__field"><span>Language</span>
          <Segmented label="Language" value={form.language} onChange={value => setForm(prev => ({ ...prev, language: value }))} options={LANGUAGES.slice(0, 3)} />
        </div>
        <label className="finder__field">
          <span>{borrowed ? 'Borrowed from' : 'Belongs to'}</span>
          {borrowed
            ? <TextField value={form.owner} onChange={set('owner')} placeholder="A friend, the library…" />
            : <OwnerField value={form.owner || ''} onChange={owner => setForm(prev => ({ ...prev, owner }))} placeholder="Whose it is: no one if empty" />}
        </label>
        {reading && (
          <label className="finder__field">
            <span>Read <small>{form.readDate ? '' : 'not dated'}</small></span>
            <span className="finder__read">
              <TextField type="date" value={form.readDate || ''} onChange={set('readDate')} />
              {/* A date field cannot be emptied on an iPhone: read, one does not know when. */}
              {form.readDate
                ? <Button size="sm" variant="quiet" onClick={() => setForm(prev => ({ ...prev, readDate: '' }))}>No date</Button>
                : <Button size="sm" variant="quiet" onClick={() => setForm(prev => ({ ...prev, readDate: today() }))}>Today</Button>}
            </span>
          </label>
        )}
        {!borrowed && (
          <>
            <label className="finder__field">
              <span>{many > 1 ? 'Price of them all CHF' : 'Price CHF'}</span>
              <TextField inputMode="decimal" value={form.priceChf} onChange={set('priceChf')} placeholder="—" />
              {many > 1 && <small>{Number.isFinite(total) ? `${(total / many).toFixed(2)} CHF a volume` : 'Shared out among them'}</small>}
            </label>
            <label className="finder__field">
              <span>{buying ? 'Bought' : 'Acquired'}</span>
              <TextField type="date" value={form.purchasedAt} onChange={set('purchasedAt')} />
            </label>
          </>
        )}
      </div>
    </div>
  );

  /* ---------- Footer ---------- */

  const footer = (() => {
    if (view === 'edition') {
      return (
        <>
          <span className="finder__note" />
          <Button variant="quiet" onClick={back}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {buying ? 'I bought it' : borrowed ? (many > 1 ? `Add the ${many} volumes, borrowed` : 'Add it, borrowed') : many > 1 ? `Add the ${many} volumes` : 'Add this book'}
          </Button>
        </>
      );
    }
    if (view === 'series') {
      const n = picked.size;
      return (
        <>
          <span className="finder__note" />
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!n}
            onClick={() => { if (wishMode) wishVolumes(); else { setChosen(pickedVolumes); setForm(editionFor(pickedVolumes[0])); setBorrowed(false); setCameFrom('series'); setView('edition'); } }}>
            {wishMode ? `Wish ${n} volume${n > 1 ? 's' : ''}` : `I have these ${n}`}
          </Button>
        </>
      );
    }
    return (
      <>
        <span className="finder__note">
          {view === 'search' && (wishMode ? 'One click wishes the book; a series wishes its missing volumes.' : 'Choose the book, then its edition.')}
        </span>
        {!wishMode && <Button icon={<BsCamera />} onClick={() => backRef.current?.click()} loading={readingPhoto === 'back'} title="Photograph its back: its barcode is its ISBN, its edition">Photo</Button>}
        {!wishMode && onIsbn && <Button icon={<BsUpcScan />} onClick={onIsbn} title="Search by its ISBN, as before">ISBN</Button>}
        {onManual && <Button icon={<BsPencil />} onClick={() => onManual()} title="Type it all by hand">Manual</Button>}
        <Button variant="quiet" onClick={onClose}>{wishMode ? 'Done' : 'Cancel'}</Button>
      </>
    );
  })();

  return (
    <>
      {/* Always there: iOS opens the camera only from inside the tap. */}
      <CoverCropDialog
        show={Boolean(straightening)}
        file={straightening ? originals.current[straightening] || null : null}
        slot={straightening || 'back'}
        subject="book"
        onCancel={() => setStraightening(null)}
        onConfirm={async photo => {
          const side = straightening;
          setStraightening(null);
          if (side) { try { const kept = await downscaleImage(photo); setPhotos(prev => ({ ...prev, [side]: kept })); } catch { /* the photo as it was */ } }
        }}
      />
      <input ref={backRef} type="file" accept="image/*,.heic,.heif" capture="environment" style={{ display: 'none' }} onChange={photographedBack} data-testid="finder-photo" />
      <input ref={frontRef} type="file" accept="image/*,.heic,.heif" capture="environment" style={{ display: 'none' }} onChange={photographedFront} data-testid="finder-photo-front" />
      <Dialog.Body className="finder">
        {view === 'search' && searchView}
        {view === 'series' && seriesView}
        {view === 'author' && authorView}
        {view === 'edition' && editionView}
      </Dialog.Body>
      <Dialog.Footer className="finder__footer">{footer}</Dialog.Footer>
    </>
  );
};

export default BookFinder;
