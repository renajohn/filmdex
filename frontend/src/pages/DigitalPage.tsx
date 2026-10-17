import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Form, ProgressBar } from 'react-bootstrap';
import { BsArrowClockwise, BsBoxArrowUpRight, BsChevronDown, BsChevronRight, BsHeartFill, BsPauseFill, BsPlayFill, BsSearch, BsStarFill, BsXLg } from 'react-icons/bs';
import MusicDetailCard from '../components/MusicDetailCard';
import musicService, {
  type DigitalAlbum, type DigitalLibrary, type DigitalTrack, type EditionAdoption,
} from '../services/musicService';
import { useDetailSteps } from '../utils/detailSteps';
import { albumImages } from '../utils/detailImages';
import { isAppleMobile, openListen } from '../utils/navidrome';
import { readStored, writeStored } from '../utils/safeStorage';
import { player, usePlayer } from '../services/player';
import { playNavidromeAlbum } from '../utils/playAlbum';
import NowPlayingBars from '../components/shared/NowPlayingBars';
import './DigitalPage.css';

type Tab = 'buy' | 'lossless' | 'near' | 'lossy' | 'nocd' | 'physical';

const TABS: Array<{ key: Tab; label: string; hiddenWhenEmpty?: boolean }> = [
  { key: 'buy', label: 'Buy' },
  { key: 'lossless', label: 'Lossless' },
  { key: 'near', label: 'Near-lossless', hiddenWhenEmpty: true },
  { key: 'lossy', label: 'Lossy' },
  { key: 'nocd', label: 'No CD' },
  { key: 'physical', label: 'Physical only', hiddenWhenEmpty: true },
];

/** What DexVault did with the editions Picard wrote into the rips; tracks and credits follow each time. */
const EDITION_NOTICES: Array<{ action: NonNullable<EditionAdoption['action']>; intro: string }> = [
  { action: 'added', intro: 'Ripped but not yet in DexVault, now added to your collection:' },
  { action: 'promoted', intro: 'Ripped from your wish list, now in your collection:' },
  { action: 'edition', intro: 'Edition taken from your rip, as Picard identified the disc:' },
];

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const byName = (a: DigitalAlbum, b: DigitalAlbum) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name);

/** "12.10": the day of a play, as the page says it. */
const shortDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });
};

const duration = (seconds: number | null): string =>
  seconds == null ? '' : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** A search for the CD on ricardo.ch, without what a digital title adds: "(Remastered)", "[Disc 1]". */
export const ricardoUrl = (album: Pick<DigitalAlbum, 'artist' | 'name'>): string => {
  const words = `${album.artist} ${album.name.replace(/[([][^)\]]*[)\]]/g, ' ')}`.replace(/\s+/g, ' ').trim();
  return `https://www.ricardo.ch/fr/s/${encodeURIComponent(words)}/`;
};

const qualityLabel = (album: DigitalAlbum): string => {
  if (album.quality === 'lossless') return album.hiRes ? 'Hi-res' : 'Lossless';
  const format = album.formats.filter(format => !['FLAC', 'ALAC', 'WAV', 'AIFF', 'APE', 'WV'].includes(format)).join('+') || 'Lossy';
  return album.bitRate ? `${format} ${album.bitRate}` : format;
};

/** Buy: what one listens to, the most recent plays first, then what is only wished. */
const buyOrder = (a: DigitalAlbum, b: DigitalAlbum) => {
  const heard = (album: DigitalAlbum) => Number(Boolean(album.buy?.listened || album.buy?.rated));
  return heard(b) - heard(a) || b.listening.score - a.listening.score || byName(a, b);
};

/** Why an album is in the Buy tab, in a few words. */
const BuyReasons: React.FC<{ album: DigitalAlbum }> = ({ album }) => {
  const { listening } = album;
  const last = shortDate(listening.lastPlayed);
  return (
    <span className="digital-reasons">
      {album.buy?.listened && (
        <span className="digital-reason">
          {listening.favourites} tracks ×2+{last ? ` · ${last}` : ''}
        </span>
      )}
      {album.rating >= 4 && <span className="digital-reason"><BsStarFill /> {album.rating}</span>}
      {album.starred && <span className="digital-reason"><BsHeartFill /></span>}
      {album.favouriteTracks > 0 && !album.starred && album.rating < 4 && (
        <span className="digital-reason"><BsStarFill /> {album.favouriteTracks} track{album.favouriteTracks > 1 ? 's' : ''}</span>
      )}
      {album.buy?.wished && <span className="digital-reason digital-reason-wished">Wishlist</span>}
    </span>
  );
};

interface TrackListProps {
  tracks: DigitalTrack[] | undefined | null;
  /** Plays the album from a track; none on an iPhone, which plays in Amperfy. */
  onPlay?: (songId: string) => void;
}

const TrackList: React.FC<TrackListProps> = ({ tracks, onPlay }) => {
  // The track DexVault plays: its bars where its number was, its title in gold. Under the pointer,
  // a track's number turns to ▶, which plays the album from it, and the one playing to ❚❚.
  const nowSongId = usePlayer(state => state.tracks[state.index]?.songId ?? null);
  const nowPlaying = usePlayer(state => state.playing);
  if (tracks === undefined) return <div className="digital-tracks-empty">Reading Navidrome…</div>;
  if (tracks === null) return <div className="digital-tracks-empty">Could not read the tracks.</div>;
  const discs = new Set(tracks.map(track => track.discNumber)).size > 1;
  return (
    <ol className="digital-tracks">
      {tracks.map(track => (
        <li key={track.id ?? `${track.discNumber}-${track.track}`}
          className={`${track.plays >= 2 ? 'digital-track-favourite' : ''}${track.id && track.id === nowSongId ? ' digital-track-current' : ''}`}>
          <span className={`digital-track-number${onPlay && track.id ? ' digital-track-playable' : ''}`}>
            <span className="digital-track-number-text">
              {track.id && track.id === nowSongId ? <NowPlayingBars playing={nowPlaying} /> : `${discs ? `${track.discNumber}-` : ''}${track.track}`}
            </span>
            {onPlay && track.id && (
              <button type="button" className="digital-track-play"
                onClick={() => (track.id === nowSongId ? player.toggle() : onPlay(track.id!))}
                aria-label={`${track.id === nowSongId && nowPlaying ? 'Pause' : 'Play'} ${track.title}`}
                title={track.id === nowSongId && nowPlaying ? 'Pause' : 'Play'}>
                {track.id === nowSongId && nowPlaying ? <BsPauseFill aria-hidden="true" /> : <BsPlayFill aria-hidden="true" />}
              </button>
            )}
          </span>
          <span className="digital-track-title">{track.title}</span>
          <span className="digital-track-meta">
            {track.rating > 0 && <span><BsStarFill /> {track.rating}</span>}
            {track.starred && <BsHeartFill />}
            {track.plays > 0 && <span className="digital-track-plays">×{track.plays}</span>}
            {track.bitRate && <span>{track.bitRate} kbps</span>}
            <span>{duration(track.durationSec)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
};

/**
 * The music as files, in Navidrome: how good they are, which CD of the
 * collection each album is, and which CDs to buy, from what one listens to.
 */
/** A full sync rereads Navidrome and takes editions from the rips: on coming back, at most this often. */
const SYNC_EVERY_MS = 5 * 60 * 1000;

/** The last library and when it was synced, kept in the browser: a reload shows them at once too. */
const STORED_KEY = 'dexvault.digital';

const readStoredLibrary = (): { library: DigitalLibrary | null; syncedAt: number } => {
  try {
    const value = JSON.parse(readStored(STORED_KEY) || 'null');
    return value && Array.isArray(value.library?.albums) ? { library: value.library, syncedAt: Number(value.syncedAt) || 0 } : { library: null, syncedAt: 0 };
  } catch {
    return { library: null, syncedAt: 0 };
  }
};

/**
 * The page as it was left: coming back shows it at once, the library brought
 * up to date behind it. The tab and what is unfolded last while the app is
 * open; the library itself, across a reload.
 */
let remembered: {
  library: DigitalLibrary | null;
  tab: Tab;
  expanded: string | null;
  tracks: Record<string, DigitalTrack[] | null>;
  syncedAt: number;
} = { tab: 'buy', expanded: null, tracks: {}, ...readStoredLibrary() };

/** For tests: a page never seen. */
export const forgetDigitalPage = () => {
  remembered = { library: null, tab: 'buy', expanded: null, tracks: {}, syncedAt: 0 };
};

const DigitalPage: React.FC = () => {
  const [library, setLibrary] = useState<DigitalLibrary | null>(remembered.library);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(remembered.tab);
  const [query, setQuery] = useState('');
  const [editions, setEditions] = useState<EditionAdoption[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(remembered.expanded);
  const [tracks, setTracks] = useState<Record<string, DigitalTrack[] | null>>(remembered.tracks);
  const [showDismissed, setShowDismissed] = useState(false);
  const appleMobile = isAppleMobile();
  // What DexVault plays, by its album in Navidrome, and the album being fetched to play.
  const nowNavidromeId = usePlayer(state => state.album?.navidromeId ?? null);
  const nowPlaying = usePlayer(state => state.playing);
  const [starting, setStarting] = useState<string | null>(null);

  /**
   * ▶ on a row: pauses or plays on the album playing, plays another from the
   * start; ▶ on one of its tracks plays it from there. Navidrome when it has no file.
   */
  const play = async (album: DigitalAlbum, fromSongId?: string) => {
    if (nowNavidromeId === album.navidromeId && !fromSongId) {
      player.toggle();
      return;
    }
    setStarting(album.navidromeId);
    try {
      // The bar leads back here, to this tab and this album.
      const from = `/musicdex/digital?tab=${tab}&album=${encodeURIComponent(album.navidromeId)}`;
      if (!(await playNavidromeAlbum(album, fromSongId, from))) openListen({ id: album.navidromeId, url: album.url });
    } catch {
      openListen({ id: album.navidromeId, url: album.url });
    } finally {
      setStarting(null);
    }
  };

  const load = useCallback(async () => {
    // A page already seen stays on screen while it is brought up to date.
    if (!remembered.library) setLoading(true);
    setError(null);
    try {
      setLibrary(await musicService.getDigitalLibrary());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Shows the library at once, then rereads Navidrome: the plays since, CDs
   * ripped since, and the editions Picard identified them as.
   */
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await musicService.syncDigitalLibrary();
      remembered.syncedAt = Date.now();
      setLibrary(result.library);
      setEditions(result.editions.filter(edition => !edition.skipped));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, []);

  // The library at once, then a full sync unless one ran a few minutes ago.
  useEffect(() => {
    load().then(() => { if (Date.now() - remembered.syncedAt > SYNC_EVERY_MS) sync(); });
  }, [load, sync]);

  useEffect(() => {
    remembered = { ...remembered, library, tab, expanded, tracks };
  }, [library, tab, expanded, tracks]);

  useEffect(() => {
    if (library?.configured) writeStored(STORED_KEY, JSON.stringify({ library, syncedAt: remembered.syncedAt }));
  }, [library]);

  const matchesQuery = useCallback((text: string) => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const haystack = normalize(text);
    return words.every(word => haystack.includes(word));
  }, [query]);

  const all = useMemo(() => library?.albums || [], [library]);

  const lists = useMemo(() => {
    const buy = all.filter(album => album.buy && (album.buy.wished || !album.dismissed));
    return {
      buy: buy.sort(buyOrder),
      dismissed: all.filter(album => album.buy && album.dismissed && !album.buy.wished).sort(byName),
      lossless: all.filter(album => album.quality === 'lossless').sort(byName),
      near: all.filter(album => album.quality === 'near').sort(byName),
      // The worst first: those are the CDs that bring the most.
      lossy: all.filter(album => album.quality === 'lossy').sort((a, b) => (a.bitRate ?? 0) - (b.bitRate ?? 0) || byName(a, b)),
      nocd: all.filter(album => !album.cd).sort(byName),
    };
  }, [all]);

  const physical = useMemo(() => (library?.physicalOnly || [])
    .filter(album => matchesQuery(`${album.title} ${album.artist.join(' ')}`)), [library, matchesQuery]);

  const shown = useMemo(() => {
    if (tab === 'physical') return [];
    return lists[tab].filter(album => matchesQuery(`${album.name} ${album.artist} ${album.cd?.title ?? ''}`));
  }, [lists, tab, matchesQuery]);

  /** The Buy tab in two: what listening suggests, boxed so the wish list does not drown it, then the wish list. */
  const suggested = useMemo(() => shown.filter(album => album.buy?.listened || album.buy?.rated), [shown]);
  const wishedOnly = useMemo(() => shown.filter(album => !(album.buy?.listened || album.buy?.rated)), [shown]);
  // A wished album one plays shows once, in the box: the wish list below says where the others are.
  const wishedSuggested = suggested.filter(album => album.buy?.wished).length;

  const dismissedShown = useMemo(() => tab !== 'buy' ? [] :
    lists.dismissed.filter(album => matchesQuery(`${album.name} ${album.artist}`)), [lists, tab, matchesQuery]);

  const countOf = (key: Tab) => (key === 'physical' ? library?.physicalOnly.length ?? 0 : lists[key].length);

  /** The CD's dialog, as on the collection page. */
  const openDetail = async (albumId: number) => {
    try {
      setDetail(await musicService.getAlbumById(albumId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cdIds = tab === 'physical' ? physical.map(album => album.id)
    : shown.flatMap(album => (album.cd ? [album.cd.id] : []));
  const albumSteps = useDetailSteps(cdIds, detail?.id, id => musicService.getAlbumById(id), setDetail, { imagesOf: albumImages });

  const deleteDetail = async () => {
    try {
      await musicService.deleteAlbum(detail.id);
      setDetail(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Runs a change on one album and puts the album the server answers with in its place. */
  const change = async (album: DigitalAlbum, action: () => Promise<DigitalAlbum>) => {
    setBusy(current => new Set(current).add(album.navidromeId));
    try {
      const updated = await action();
      setLibrary(current => current && {
        ...current,
        albums: current.albums.map(entry => (entry.navidromeId === updated.navidromeId ? updated : entry)),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(current => { const next = new Set(current); next.delete(album.navidromeId); return next; });
    }
  };

  const toggleWish = (album: DigitalAlbum) =>
    change(album, () => musicService.setDigitalWished(album.navidromeId, album.wishAlbumId === null));

  const setDismissed = (album: DigitalAlbum, dismissed: boolean) =>
    change(album, () => musicService.setDigitalDismissed(album.navidromeId, dismissed));

  /** An album with no CD opens in place, its tracks with their plays: why it is to buy. */
  const toggleTracks = async (album: DigitalAlbum, keepOpen = false) => {
    if (expanded === album.navidromeId && !keepOpen) { setExpanded(null); return; }
    setExpanded(album.navidromeId);
    if (tracks[album.navidromeId]) return;
    try {
      const list = await musicService.getDigitalTracks(album.navidromeId);
      setTracks(current => ({ ...current, [album.navidromeId]: list }));
    } catch {
      setTracks(current => ({ ...current, [album.navidromeId]: null }));
    }
  };

  const activate = (album: DigitalAlbum) => (album.cd ? openDetail(album.cd.id) : toggleTracks(album));

  // ?tab=buy&album=… brings back the album the player's bar was started from, unfolded and in sight: in
  // that tab while it is still there, else where it went since (off the wish list, into No CD, say).
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const wanted = params.get('album');
    if (!wanted || all.length === 0) return;
    navigate({ search: '' }, { replace: true });
    const album = all.find(entry => entry.navidromeId === wanted);
    if (!album) return;
    const holds = (key: Tab) => key !== 'physical' && lists[key].some(entry => entry.navidromeId === wanted);
    const asked = params.get('tab') as Tab | null;
    const dismissedHere = lists.dismissed.some(entry => entry.navidromeId === wanted);
    const target: Tab = asked && holds(asked) ? asked
      : asked === 'buy' && dismissedHere ? 'buy'
        : !album.cd ? 'nocd' : album.quality;
    setTab(target);
    setQuery('');
    if (target === 'buy' && dismissedHere) setShowDismissed(true);
    if (!album.cd) toggleTracks(album, true);
    window.setTimeout(() => document.getElementById(`digital-${wanted}`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, all]);

  const total = all.length;
  const fromCds = all.filter(album => album.cd).length;
  const qualityCounts = {
    lossless: lists.lossless.length,
    near: lists.near.length,
    lossy: lists.lossy.length,
  };
  // The lossy albums by bitrate: 128, 160, 192…
  const bitRates = useMemo(() => {
    const counts = new Map<number, number>();
    for (const album of lists.lossy) {
      const rate = album.bitRate ? Math.round(album.bitRate / 32) * 32 : 0;
      counts.set(rate, (counts.get(rate) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [lists.lossy]);

  const row = (album: DigitalAlbum, dismissedRow = false) => {
    const isBusy = busy.has(album.navidromeId);
    const open = expanded === album.navidromeId;
    const cover = album.cd?.cover ? musicService.getImageUrl(album.cd.cover) || undefined : musicService.navidromeCoverUrl(album.navidromeId);
    const showWish = !album.cd && (tab === 'buy' || tab === 'nocd');
    const canDismiss = tab === 'buy' && !album.buy?.wished && !dismissedRow;
    return (
      <li key={album.navidromeId} id={`digital-${album.navidromeId}`} className={`digital-item ${open ? 'open' : ''}`}>
        <div
          className="digital-row"
          role="button"
          tabIndex={0}
          aria-expanded={album.cd ? undefined : open}
          onClick={() => activate(album)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(album); } }}
        >
          <span className="digital-chevron" aria-hidden>
            {!album.cd && (open ? <BsChevronDown /> : <BsChevronRight />)}
          </span>
          <div className="digital-cover">
            {cover && <img src={cover} alt="" loading="lazy" />}
          </div>
          <div className="digital-info">
            <div className="digital-title">
              {nowNavidromeId === album.navidromeId && <span className="digital-now"><NowPlayingBars playing={nowPlaying} /></span>}
              {album.name}
            </div>
            <div className="digital-artist">{album.artist}</div>
            {tab === 'buy' && (album.buy?.listened || album.buy?.rated) && <BuyReasons album={album} />}
          </div>
          <div className="digital-badges">
            {album.cd && <span className="digital-badge digital-badge-cd" title={album.cd.title}>CD</span>}
            {album.oldCopy && <span className="digital-badge digital-badge-old" title="An old compressed copy is still in Navidrome">+ MP3</span>}
            {!album.buy?.wished && album.wishAlbumId !== null && <span className="digital-badge digital-badge-wished">Wishlist</span>}
            <span className={`digital-badge digital-quality-${album.quality}`}>{qualityLabel(album)}</span>
          </div>
          <div className="digital-actions" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
            {appleMobile ? (
              <Button size="sm" variant="outline-secondary" title="Play in Amperfy" aria-label="Amperfy"
                onClick={() => openListen({ id: album.navidromeId, url: album.url })}>
                <BsPlayFill />
              </Button>
            ) : (
              <>
                {/* ▶ plays the album in DexVault; Navidrome stays a click away beside it. */}
                <Button size="sm" variant={nowNavidromeId === album.navidromeId ? 'warning' : 'outline-secondary'}
                  disabled={starting === album.navidromeId} onClick={() => play(album)}
                  aria-label={nowNavidromeId === album.navidromeId && nowPlaying ? `Pause ${album.name}` : `Play ${album.name}`}
                  title={nowNavidromeId === album.navidromeId && nowPlaying ? 'Pause' : 'Play'}>
                  {starting === album.navidromeId ? <span className="spinner-border spinner-border-sm" />
                    : nowNavidromeId === album.navidromeId && nowPlaying ? <BsPauseFill /> : <BsPlayFill />}
                </Button>
                <Button size="sm" variant="outline-secondary" title="Open in Navidrome" aria-label={`Open ${album.name} in Navidrome`}
                  onClick={() => openListen({ id: album.navidromeId, url: album.url })}>
                  <BsBoxArrowUpRight />
                </Button>
              </>
            )}
            {tab === 'buy' && !album.cd && (
              <a
                className="btn btn-sm btn-outline-secondary"
                href={ricardoUrl(album)}
                target="_blank"
                rel="noopener noreferrer"
                title="Search the CD on Ricardo"
              >
                <BsSearch className="me-1" />Ricardo
              </a>
            )}
            {showWish && (
              <Form.Check
                type="switch"
                id={`wish-${album.navidromeId}`}
                label="Wishlist"
                checked={album.wishAlbumId !== null}
                disabled={isBusy}
                onChange={() => toggleWish(album)}
                className="digital-wish-toggle"
              />
            )}
            {canDismiss ? (
              <Button size="sm" variant="link" className="digital-dismiss" title="Not interested" aria-label="Not interested"
                disabled={isBusy} onClick={() => setDismissed(album, true)}>
                <BsXLg />
              </Button>
            ) : tab === 'buy' && !dismissedRow && <span className="digital-dismiss" aria-hidden />}
            {dismissedRow && (
              <Button size="sm" variant="outline-secondary" disabled={isBusy} onClick={() => setDismissed(album, false)}>
                Restore
              </Button>
            )}
          </div>
        </div>
        {open && <TrackList tracks={tracks[album.navidromeId]} onPlay={appleMobile ? undefined : songId => play(album, songId)} />}
      </li>
    );
  };

  return (
    <div className="digital-page">
      <div className="digital-header">
        <div>
          <h2>Digital</h2>
          {total > 0 && (
            <p className="digital-subtitle">
              {total} albums in Navidrome · {fromCds} from your CDs · {total - fromCds} with no CD
            </p>
          )}
        </div>
        <Button variant="outline-secondary" size="sm" onClick={sync} disabled={loading || syncing}>
          <BsArrowClockwise className="me-1" />
          {syncing ? 'Reading Navidrome…' : 'Refresh'}
        </Button>
      </div>

      {library && !library.configured && (
        <div className="digital-notice">
          Navidrome is not configured: add <code>NAVIDROME_USER</code> and <code>NAVIDROME_PASSWORD</code> to the
          DexVault stack.
        </div>
      )}
      {EDITION_NOTICES.map(({ action, intro }) => {
        const done = editions.filter(edition => edition.action === action);
        return done.length > 0 && (
          <div key={action} className="digital-notice digital-notice-done">
            {intro}
            <ul>
              {done.map(edition => <li key={edition.releaseId}>{edition.title}</li>)}
            </ul>
          </div>
        );
      })}
      {(error || library?.error) && (
        <div className="digital-notice digital-notice-error">Could not read Navidrome: {error || library?.error}</div>
      )}

      {total > 0 && (
        <div className="digital-summary">
          <ProgressBar>
            <ProgressBar className="digital-bar-lossless" now={(qualityCounts.lossless / total) * 100} key="lossless" />
            <ProgressBar className="digital-bar-near" now={(qualityCounts.near / total) * 100} key="near" />
            <ProgressBar className="digital-bar-lossy" now={(qualityCounts.lossy / total) * 100} key="lossy" />
          </ProgressBar>
          <div className="digital-figures">
            <span><span className="digital-dot digital-dot-lossless" /><strong>{qualityCounts.lossless}</strong> lossless</span>
            {qualityCounts.near > 0 && <span><span className="digital-dot digital-dot-near" /><strong>{qualityCounts.near}</strong> near-lossless</span>}
            {qualityCounts.lossy > 0 && (
              <span>
                <span className="digital-dot digital-dot-lossy" /><strong>{qualityCounts.lossy}</strong> lossy
                {' '}({bitRates.map(([rate, count]) => `${rate || '?'} kbps ${count}`).join(' · ')})
              </span>
            )}
          </div>
        </div>
      )}

      {library && library.oldCopies.length > 0 && (
        <div className="digital-notice">
          {library.oldCopies.length} old {library.oldCopies.length > 1 ? 'copies' : 'copy'} of CDs already in lossless, to delete
          from the library: {library.oldCopies.map(copy => `${copy.name} (${copy.formats.join('+')})`).join(', ')}
        </div>
      )}

      <div className="digital-controls">
        <div className="digital-tabs" role="tablist">
          {TABS.filter(({ key, hiddenWhenEmpty }) => !hiddenWhenEmpty || countOf(key) > 0 || tab === key).map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`digital-tab ${tab === key ? 'active' : ''}`}
              onClick={() => { setTab(key); setExpanded(null); }}
            >
              {label} <span className="digital-tab-count">{countOf(key)}</span>
            </button>
          ))}
        </div>
        <Form.Control
          size="sm"
          type="search"
          placeholder="Find an album…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="digital-search"
        />
      </div>

      {tab === 'buy' && (
        <section className="digital-suggestions" aria-labelledby="digital-suggestions-title">
          <h3 id="digital-suggestions-title">Suggested from your listening <span className="digital-tab-count">{suggested.length}</span></h3>
          <p className="digital-hint">
            Albums with no CD that you play: three of their tracks twice or more over the last 90 days, or rated 4–5 stars,
            or hearted. The most recently played first.
          </p>
          {suggested.length > 0 ? (
            <ul className="digital-list">{suggested.map(album => row(album))}</ul>
          ) : (
            <p className="digital-suggestions-empty">
              {query ? 'No suggestion matches this search.' : 'No suggestion yet: they come as you play albums you have no CD of.'}
            </p>
          )}
        </section>
      )}
      {tab === 'buy' && (
        <h3 className="digital-section-title">
          Wishlist <span className="digital-tab-count">{wishedOnly.length}</span>
          {wishedSuggested > 0 && (
            <span className="digital-section-note"> · {wishedSuggested} more in the suggestions above</span>
          )}
        </h3>
      )}

      <ul className="digital-list">
        {(tab === 'buy' ? wishedOnly : shown).map(album => row(album))}
        {tab === 'physical' && physical.map(album => (
          <li key={album.id} className="digital-item">
            <div
              className="digital-row"
              role="button"
              tabIndex={0}
              onClick={() => openDetail(album.id)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(album.id); } }}
            >
              <span className="digital-chevron" aria-hidden />
              <div className="digital-cover">
                {album.cover && <img src={musicService.getImageUrl(album.cover) || undefined} alt="" loading="lazy" />}
              </div>
              <div className="digital-info">
                <div className="digital-title">{album.title}</div>
                <div className="digital-artist">{album.artist.join(', ')}</div>
              </div>
              <div className="digital-badges"><span className="digital-badge digital-badge-cd">CD</span></div>
            </div>
          </li>
        ))}
        {library && (tab === 'buy' ? wishedOnly.length === 0 : shown.length === 0) && (tab !== 'physical' || physical.length === 0) && (
          <li className="digital-empty">
            {query ? 'No album matches this search.' : tab === 'buy' ? 'Your wish list has no album from Navidrome.' : 'Nothing here.'}
          </li>
        )}
      </ul>

      {dismissedShown.length > 0 && (
        <div className="digital-dismissed">
          <button type="button" className="digital-dismissed-toggle" onClick={() => setShowDismissed(open => !open)} aria-expanded={showDismissed}>
            {showDismissed ? <BsChevronDown /> : <BsChevronRight />} Not interested ({dismissedShown.length})
          </button>
          {showDismissed && <ul className="digital-list">{dismissedShown.map(album => row(album, true))}</ul>}
        </div>
      )}

      {detail && (
        <MusicDetailCard
          cd={detail}
          onClose={() => setDetail(null)}
          onDelete={deleteDetail}
          onPrevious={albumSteps.onPrevious}
          onNext={albumSteps.onNext}
        />
      )}
    </div>
  );
};

export default DigitalPage;
