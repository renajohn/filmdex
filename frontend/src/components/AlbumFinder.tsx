import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BsCamera, BsCheckLg, BsChevronRight, BsFilter, BsPencil, BsPlusLg, BsSearch, BsThreeDots } from 'react-icons/bs';
import albumFinderService, { CdEdition, coverAt, FinderAlbum, FinderArtist } from '../services/albumFinderService';
import musicService from '../services/musicService';
import Button, { IconButton } from './shared/Button';
import CdEditionPicker from './CdEditionPicker';
import CoverButton from './shared/CoverButton';
import CoverTag from './shared/CoverTag';
import Dialog from './shared/Dialog';
import Menu from './shared/Menu';
import { Loading } from './shared/Spinner';
import { TextField } from './shared/TextField';
import toast from './shared/Toast';
import './finder.css';

export type AlbumFinderMode = 'wish' | 'cd';

export interface AlbumFinderHead {
  title: string;
  onBack?: () => void;
}

interface AlbumFinderProps {
  /** wish: an album, one click adds it; cd: an album, then which CD. */
  mode: AlbumFinderMode;
  /** What the dialog's head says, and its ← when there is somewhere to go back to. */
  onHead: (head: AlbumFinderHead) => void;
  /** An album added (a wish, at once; a CD, once its edition is chosen) or taken away. */
  onChanged: (album: any) => void;
  /** The CD of an edition: the caller adds it as before, from MusicBrainz. */
  onAddRelease: (releaseId: string) => Promise<void>;
  onClose: () => void;
  onPhoto?: () => void;
  onManual?: () => void;
  /** The searches of before, on MusicBrainz: by title (an album no store sells), catalog number or barcode. */
  onSearchBy?: (kind: 'title' | 'catalog' | 'barcode') => void;
}

type View = 'search' | 'artist' | 'edition';

const DEBOUNCE_MS = 220;
const keyOf = (album: FinderAlbum) => `${album.source}:${album.sourceId}`;

/**
 * An album as one finds a film: as one types, artist, title or both. The
 * albums come in as the words do, their editions as one; an artist the words
 * name gets a pill with their covers, which opens all their albums. On the
 * wish list a click adds the album, the window staying open for the next;
 * for the collection it asks which CD.
 */
const AlbumFinder: React.FC<AlbumFinderProps> = ({ mode, onHead, onChanged, onAddRelease, onClose, onPhoto, onManual, onSearchBy }) => {
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [albums, setAlbums] = useState<FinderAlbum[]>([]);
  const [artists, setArtists] = useState<FinderArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [artist, setArtist] = useState<FinderArtist | null>(null);
  const [discography, setDiscography] = useState<FinderAlbum[] | null>(null);
  const [discoFilter, setDiscoFilter] = useState('');
  const [album, setAlbum] = useState<FinderAlbum | null>(null);
  const [cameFrom, setCameFrom] = useState<View>('search');
  const [edition, setEdition] = useState<CdEdition | null>(null);
  const [releaseGroupId, setReleaseGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // What was added or taken away here, over what the search said it had.
  const [have, setHave] = useState<Record<string, FinderAlbum['have']>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const haveOf = (a: FinderAlbum) => (keyOf(a) in have ? have[keyOf(a)] : a.have);

  // The search, as one types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setAlbums([]); setArtists([]); setSearching(false); setError(null); return; }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      albumFinderService.search(q, controller.signal)
        .then(result => { setAlbums(result.albums); setArtists(result.artists); setActive(0); setError(null); setSearching(false); })
        .catch(e => { if ((e as Error).name !== 'AbortError') { setError((e as Error).message); setSearching(false); } });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const back = () => {
    if (view === 'edition') setView(cameFrom);
    else setView('search');
    setEdition(null);
  };

  useEffect(() => {
    if (view === 'search') onHead({ title: mode === 'wish' ? 'Add an album to the wish list' : 'Add a CD' });
    if (view === 'artist' && artist) onHead({ title: artist.name, onBack: back });
    if (view === 'edition') onHead({ title: 'Which CD do you have?', onBack: back });
    if (view === 'search') setTimeout(() => searchRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, artist, mode]);

  useEffect(() => {
    (listRef.current?.querySelector('.finder__row--active') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const openArtist = (chosen: FinderArtist) => {
    setArtist(chosen);
    setDiscography(null);
    setDiscoFilter('');
    setView('artist');
    albumFinderService.discography(chosen)
      .then(setDiscography)
      .catch(e => { setDiscography([]); toast((e as Error).message, { tone: 'danger' }); });
  };

  const toggleWish = async (a: FinderAlbum) => {
    const key = keyOf(a);
    const had = haveOf(a);
    if (busy.has(key) || had?.status === 'owned') return;
    setBusy(prev => new Set(prev).add(key));
    try {
      if (had?.status === 'wish') {
        await musicService.deleteAlbum(had.id);
        setHave(prev => ({ ...prev, [key]: null }));
        onChanged(null);
      } else {
        const added = await albumFinderService.addAlbum({ title: a.title, artist: a.artist, year: a.year, cover: a.cover, titleStatus: 'wish' });
        setHave(prev => ({ ...prev, [key]: { status: 'wish', id: added.id } }));
        onChanged(added);
        toast(`${a.title} · ${a.artist} is on the wish list`, {
          tone: 'success',
          action: {
            label: 'Undo',
            onClick: () => {
              musicService.deleteAlbum(added.id).then(() => { setHave(prev => ({ ...prev, [key]: null })); onChanged(null); });
            },
          },
        });
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const choose = (a: FinderAlbum, from: View) => {
    if (mode === 'wish') { toggleWish(a); return; }
    setAlbum(a);
    setEdition(null);
    setReleaseGroupId(null);
    setCameFrom(from);
    setView('edition');
  };

  const addCd = async (withEdition: boolean) => {
    if (!album) return;
    setSaving(true);
    try {
      if (withEdition && edition) {
        await onAddRelease(edition.id);
      } else {
        const added = await albumFinderService.addAlbum({
          title: album.title, artist: album.artist, year: album.year, cover: album.cover, titleStatus: 'owned', releaseGroupId,
        });
        onChanged(added);
        toast(`${album.title} is in the collection: its edition is to be told`, { tone: 'success' });
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const shownDiscography = useMemo(() => {
    const words = discoFilter.trim().toLowerCase();
    return (discography || []).filter(a => !words || a.title.toLowerCase().includes(words) || (a.year || '').startsWith(words));
  }, [discography, discoFilter]);

  const haveTag = (a: FinderAlbum) => {
    const had = haveOf(a);
    if (!had) return null;
    const on = (mode === 'wish' && had.status === 'wish') || (mode === 'cd' && had.status === 'owned');
    return <CoverTag variant={on ? 'on' : 'gold'}>{had.status === 'wish' ? 'Wished' : 'Owned'}</CoverTag>;
  };

  const rowAction = (a: FinderAlbum) => {
    if (mode === 'cd') return <BsChevronRight className="finder__go" aria-hidden="true" />;
    const had = haveOf(a);
    if (had?.status === 'owned') return null;
    const on = had?.status === 'wish';
    return (
      <IconButton label={on ? 'Take it off the wish list' : 'Add to the wish list'} size="sm" tone={on ? 'confirm' : undefined}
        loading={busy.has(keyOf(a))} onClick={event => { event.stopPropagation(); toggleWish(a); }}>
        {on ? <BsCheckLg /> : <BsPlusLg />}
      </IconButton>
    );
  };

  /* ---------- Views ---------- */

  const searchView = (
    <>
      <div className="finder__top">
        <TextField
          ref={searchRef}
          icon={<BsSearch />}
          placeholder="Artist, album, or both: amy macdonald, back in black…"
          value={query}
          autoFocus
          aria-label="Search for an album"
          suffix={searching ? '…' : albums.length ? `${albums.length} albums` : undefined}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { setActive(i => Math.min(i + 1, albums.length - 1)); event.preventDefault(); }
            if (event.key === 'ArrowUp') { setActive(i => Math.max(i - 1, 0)); event.preventDefault(); }
            if (event.key === 'Enter' && albums[active]) { event.preventDefault(); choose(albums[active], 'search'); }
          }}
        />
      </div>
      <div className="finder__results" ref={listRef}>
        {query.trim().length < 2 ? (
          <p className="finder__empty">Albums appear as you type.</p>
        ) : error ? (
          <p className="finder__empty">{error}</p>
        ) : (
          <>
            {artists.length > 0 && (
              <>
                <div className="finder__label">Artists</div>
                <div className="finder__artists">
                  {artists.map(a => (
                    <button key={`${a.source}:${a.id}`} type="button" className="finder__artist" onClick={() => openArtist(a)}
                      title={`All the albums of ${a.name}`}>
                      <span className="finder__faces" aria-hidden="true">
                        {a.covers.map(cover => <img key={cover} src={coverAt(cover, 60) || cover} alt="" />)}
                      </span>
                      <span className="finder__artist-name">{a.name}</span>
                      <span className="finder__artist-note">{[a.genre, 'all their albums'].filter(Boolean).join(' · ')}</span>
                      <BsChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {albums.length > 0 ? (
              <>
                <div className="finder__label">Albums</div>
                <div role="listbox" aria-label="Albums">
                  {albums.map((a, i) => (
                    <div key={keyOf(a)} role="option" aria-selected={i === active}
                      className={`finder__row${i === active ? ' finder__row--active' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => choose(a, 'search')}>
                      <img className="finder__thumb" src={coverAt(a.cover, 120) || '/placeholder-album.png'} alt="" loading="lazy" />
                      <span className="finder__text">
                        <span className="finder__title">{a.title}</span>
                        <span className="finder__meta">
                          {[a.artist, a.year, a.tracks ? `${a.tracks} tracks` : null, a.editions > 1 ? `${a.editions} editions` : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {haveTag(a)}
                      <kbd className="finder__key" aria-hidden="true">↵</kbd>
                      {rowAction(a)}
                    </div>
                  ))}
                </div>
              </>
            ) : searching ? (
              <Loading>Searching…</Loading>
            ) : (
              <p className="finder__empty">No album found.</p>
            )}
          </>
        )}
      </div>
    </>
  );

  const artistView = artist && (
    <>
      <div className="finder__top">
        <TextField
          icon={<BsFilter />}
          placeholder={`Filter the albums of ${artist.name}: a title, a year…`}
          value={discoFilter}
          autoFocus
          aria-label={`Filter the albums of ${artist.name}`}
          suffix={discography ? (discoFilter ? `${shownDiscography.length} of ${discography.length}` : `${discography.length} albums`) : undefined}
          onChange={event => setDiscoFilter(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && shownDiscography.length === 1) choose(shownDiscography[0], 'artist'); }}
        />
      </div>
      <div className="finder__results">
        {!discography ? (
          <Loading>Loading the albums…</Loading>
        ) : !shownDiscography.length ? (
          <p className="finder__empty">{discoFilter ? `No album of ${artist.name} with “${discoFilter}”.` : 'No album.'}</p>
        ) : (
          <>
            <p className="finder__hint">
              The oldest first · {mode === 'wish' ? 'click a cover to wish it' : 'click the one you have'}
            </p>
            <div className="finder__grid">
              {shownDiscography.map(a => {
                const had = haveOf(a);
                const on = mode === 'wish' && had?.status === 'wish';
                return (
                  <div key={keyOf(a)} className="finder__card cover-host" onClick={() => choose(a, 'artist')}>
                    <div className="finder__cover">
                      <img src={coverAt(a.cover, 300) || '/placeholder-album.png'} alt="" loading="lazy" />
                      <span className="finder__card-tag">{haveTag(a)}</span>
                      {(mode === 'cd' || had?.status !== 'owned') && (
                        <CoverButton className="finder__card-button" size="small" reveal={on ? 'always' : 'hover'} active={on}
                          label={mode === 'cd' ? 'Choose its CD' : on ? 'Take it off the wish list' : 'Add to the wish list'}
                          onClick={event => { event.stopPropagation(); choose(a, 'artist'); }}>
                          {mode === 'cd' ? <BsChevronRight /> : on ? <BsCheckLg /> : <BsPlusLg />}
                        </CoverButton>
                      )}
                    </div>
                    <div className="finder__card-title">{a.title}</div>
                    <div className="finder__card-meta">{[a.year, a.editions > 1 ? `${a.editions} editions` : null].filter(Boolean).join(' · ')}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );

  const editionView = album && (
    <div className="finder__results">
      <div className="finder__album">
        <img src={coverAt(album.cover, 200) || '/placeholder-album.png'} alt="" />
        <div>
          <div className="finder__title">{album.title}</div>
          <div className="finder__meta">{[album.artist, album.year].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <CdEditionPicker artist={album.artist} title={album.title} cover={album.cover} selected={edition?.id ?? null} autoFocus
        onSelect={setEdition} onLoaded={found => setReleaseGroupId(found.releaseGroup?.id ?? null)} />
    </div>
  );

  /* ---------- Footer ---------- */

  const footer = view === 'edition' ? (
    <>
      <span className="finder__note">{edition ? '' : 'Not sure which? It can be told later.'}</span>
      {!edition && <Button variant="quiet" onClick={() => addCd(false)} disabled={saving}>Add without the edition</Button>}
      <Button variant="primary" onClick={() => addCd(true)} disabled={!edition} loading={saving && Boolean(edition)}>Add this CD</Button>
    </>
  ) : (
    <>
      <span className="finder__note">
        {view === 'search' && (mode === 'wish' ? 'One click adds the album: its CD is chosen when you buy it.' : 'Choose the album, then its CD.')}
      </span>
      {mode === 'cd' && onPhoto && <Button icon={<BsCamera />} onClick={onPhoto} title="Photograph the CD, as before">Photo</Button>}
      {onManual && <Button icon={<BsPencil />} onClick={onManual} title="Type it all by hand">Manual</Button>}
      {onSearchBy && (
        <Menu align="end" drop="up" trigger={props => <IconButton {...props} label="Other searches" boxed><BsThreeDots /></IconButton>}>
          <Menu.Item onSelect={() => onSearchBy('title')}>Search MusicBrainz by title</Menu.Item>
          <Menu.Item onSelect={() => onSearchBy('catalog')}>Search by catalog number</Menu.Item>
          <Menu.Item onSelect={() => onSearchBy('barcode')}>Search by barcode</Menu.Item>
        </Menu>
      )}
      <Button variant="quiet" onClick={onClose}>{mode === 'wish' ? 'Done' : 'Cancel'}</Button>
    </>
  );

  return (
    <>
      <Dialog.Body className="finder">
        {view === 'search' && searchView}
        {view === 'artist' && artistView}
        {view === 'edition' && editionView}
      </Dialog.Body>
      <Dialog.Footer className="finder__footer">{footer}</Dialog.Footer>
    </>
  );
};

export default AlbumFinder;
