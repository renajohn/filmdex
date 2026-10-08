import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, ProgressBar } from 'react-bootstrap';
import { BsArrowClockwise, BsTags } from 'react-icons/bs';
import MusicDetailCard from '../components/MusicDetailCard';
import musicService, { type DigitalAlbum, type EditionAdoption, type RipState, type RipStatus } from '../services/musicService';
import { canUsePicard, openInPicard } from '../utils/picard';
import './RipProgressPage.css';

type Filter = 'todo' | RipState | 'all' | 'digital';

const STATE_LABELS: Record<RipState, string> = {
  none: 'Not ripped',
  lossy: 'Not lossless',
  lossless: 'Lossless',
};

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'todo', label: 'To rip' },
  { key: 'none', label: STATE_LABELS.none },
  { key: 'lossy', label: STATE_LABELS.lossy },
  { key: 'lossless', label: STATE_LABELS.lossless },
  { key: 'all', label: 'All' },
  { key: 'digital', label: 'Digital only' },
];

/** What DexVault did with the editions Picard wrote into the rips; tracks and credits follow each time. */
const EDITION_NOTICES: Array<{ action: NonNullable<EditionAdoption['action']>; intro: string }> = [
  { action: 'added', intro: 'Ripped but not yet in DexVault, now added to your collection:' },
  { action: 'promoted', intro: 'Ripped from your wish list, now in your collection:' },
  { action: 'edition', intro: 'Edition taken from your rip, as Picard identified the disc:' },
];

const ORDER: Record<RipState, number> = { none: 0, lossy: 1, lossless: 2 };

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Every CD is to be ripped again to lossless, whatever Navidrome already has:
 * "Not lossless" stays on the list next to "Not ripped".
 */
const RipProgressPage: React.FC = () => {
  const [status, setStatus] = useState<RipStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todo');
  const [query, setQuery] = useState('');
  const [editions, setEditions] = useState<EditionAdoption[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [wishing, setWishing] = useState<Set<string>>(new Set());
  const picard = canUsePicard();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await musicService.getRipStatus());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Shows the status at once, then rereads Navidrome: CDs ripped since, and
   * the editions Picard identified them as, which DexVault takes over.
   */
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await musicService.syncRipStatus();
      setStatus(result.status);
      setEditions(result.editions.filter(edition => !edition.skipped));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => { load().then(sync); }, [load, sync]);

  const matchesQuery = useCallback((text: string) => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const haystack = normalize(text);
    return words.every(word => haystack.includes(word));
  }, [query]);

  const albums = useMemo(() => {
    if (filter === 'digital') return [];
    return (status?.albums || [])
      .filter(album => filter === 'all' || (filter === 'todo' ? album.state !== 'lossless' : album.state === filter))
      .filter(album => matchesQuery(`${album.title} ${album.artist.join(' ')}`))
      .sort((a, b) => ORDER[a.state] - ORDER[b.state]
        || a.artist.join(', ').localeCompare(b.artist.join(', '))
        || a.title.localeCompare(b.title));
  }, [status, filter, matchesQuery]);

  const digital = useMemo(() => filter !== 'digital' ? [] :
    (status?.digital || []).filter(album => matchesQuery(`${album.name} ${album.artist}`)), [status, filter, matchesQuery]);

  /** The CD's dialog, as on the collection page. */
  const openDetail = async (albumId: number) => {
    try {
      setDetail(await musicService.getAlbumById(albumId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteDetail = async () => {
    try {
      await musicService.deleteAlbum(detail.id);
      setDetail(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleWish = async (album: DigitalAlbum) => {
    setWishing(current => new Set(current).add(album.navidromeId));
    try {
      const updated = await musicService.setDigitalWished(album.navidromeId, album.wishAlbumId === null);
      setStatus(current => current && {
        ...current,
        digital: (current.digital || []).map(entry => entry.navidromeId === updated.navidromeId ? updated : entry),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWishing(current => { const next = new Set(current); next.delete(album.navidromeId); return next; });
    }
  };

  const counts = status?.counts || { none: 0, lossy: 0, lossless: 0 };
  const total = counts.none + counts.lossy + counts.lossless;
  const countOf = (key: Filter) =>
    key === 'digital' ? (status?.digital || []).length
      : key === 'all' ? total : key === 'todo' ? counts.none + counts.lossy : counts[key];

  return (
    <div className="rip-progress-page">
      <div className="rip-progress-header">
        <div>
          <h2>Ripping</h2>
          <p className="rip-progress-subtitle">
            Every CD, ripped again to lossless. Navidrome tells which ones are done.
          </p>
          <p className="rip-progress-subtitle">
            In Picard, <strong>Lookup CD</strong> with the disc still in the drive finds the exact pressing, and DexVault
            takes it from the tags. The Picard button loads the edition DexVault has, for when the disc is unknown.
          </p>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={sync} disabled={loading || syncing}>
          <BsArrowClockwise className="me-1" />
          {syncing ? 'Reading Navidrome…' : 'Refresh'}
        </Button>
      </div>

      {status && !status.configured && (
        <div className="rip-progress-notice">
          Navidrome is not configured: add <code>NAVIDROME_USER</code> and <code>NAVIDROME_PASSWORD</code> to the
          DexVault stack. Until then every CD shows as not ripped.
        </div>
      )}
      {EDITION_NOTICES.map(({ action, intro }) => {
        const done = editions.filter(edition => edition.action === action);
        return done.length > 0 && (
          <div key={action} className="rip-progress-notice rip-progress-editions">
            {intro}
            <ul>
              {done.map(edition => <li key={edition.releaseId}>{edition.title}</li>)}
            </ul>
          </div>
        );
      })}
      {(error || status?.error) && (
        <div className="rip-progress-notice rip-progress-error">Could not read Navidrome: {error || status?.error}</div>
      )}

      {total > 0 && (
        <div className="rip-progress-summary">
          <ProgressBar>
            <ProgressBar variant="success" now={(counts.lossless / total) * 100} key="lossless" />
            <ProgressBar variant="warning" now={(counts.lossy / total) * 100} key="lossy" />
          </ProgressBar>
          <div className="rip-progress-figures">
            <strong>{counts.lossless}</strong> of {total} CDs in lossless
          </div>
        </div>
      )}

      <div className="rip-progress-controls">
        <div className="rip-progress-filters" role="tablist">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={`rip-filter ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label} <span className="rip-filter-count">{countOf(key)}</span>
            </button>
          ))}
        </div>
        <Form.Control
          size="sm"
          type="search"
          placeholder={filter === 'digital' ? 'Find an album…' : 'Find a CD…'}
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="rip-progress-search"
        />
      </div>

      <ul className="rip-list">
        {albums.map(album => (
          <li
            key={album.id}
            className="rip-row rip-row-clickable"
            role="button"
            tabIndex={0}
            onClick={() => openDetail(album.id)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(album.id); } }}
          >
            <div className="rip-cover">
              {album.cover && <img src={musicService.getImageUrl(album.cover) || undefined} alt="" loading="lazy" />}
            </div>
            <div className="rip-info">
              <div className="rip-title">{album.title}</div>
              <div className="rip-artist">{album.artist.join(', ')}</div>
            </div>
            <div className="rip-formats">
              {album.formats.map(format => <span key={format} className="rip-format">{format}</span>)}
            </div>
            <span className={`rip-state rip-state-${album.state}`}>{STATE_LABELS[album.state]}</span>
            <div className="rip-action" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
              {picard && album.musicbrainzReleaseId ? (
                <Button size="sm" variant="outline-secondary" onClick={() => openInPicard(album.musicbrainzReleaseId!)}>
                  <BsTags className="me-1" />
                  Picard
                </Button>
              ) : !album.musicbrainzReleaseId ? (
                <span className="rip-no-edition" title="No MusicBrainz edition: Picard cannot be told which one it is">No edition</span>
              ) : null}
            </div>
          </li>
        ))}
        {digital.map(album => {
          const wished = album.wishAlbumId !== null;
          return (
            <li key={album.navidromeId} className="rip-row">
              <div className="rip-cover">
                <img src={musicService.navidromeCoverUrl(album.navidromeId)} alt="" loading="lazy" />
              </div>
              <div className="rip-info">
                <div className="rip-title">{album.name}</div>
                <div className="rip-artist">{album.artist}</div>
              </div>
              <div className="rip-formats">
                {album.formats.map(format => <span key={format} className="rip-format">{format}</span>)}
              </div>
              {wished && <span className="rip-state rip-state-wished">In wishlist</span>}
              <div className="rip-action">
                <Form.Check
                  type="switch"
                  id={`wish-${album.navidromeId}`}
                  label="Wishlist"
                  checked={wished}
                  disabled={wishing.has(album.navidromeId)}
                  onChange={() => toggleWish(album)}
                  className="rip-wish-toggle"
                />
              </div>
            </li>
          );
        })}
        {status && albums.length === 0 && digital.length === 0 && (
          <li className="rip-empty">
            {query ? (filter === 'digital' ? 'No album matches this search.' : 'No CD matches this search.') : 'Nothing here.'}
          </li>
        )}
      </ul>

      {detail && (
        <MusicDetailCard
          cd={detail}
          onClose={() => setDetail(null)}
          onDelete={deleteDetail}
        />
      )}
    </div>
  );
};

export default RipProgressPage;
