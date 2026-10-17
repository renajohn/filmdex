import React from 'react';
import { BsArrowClockwise, BsCartFill, BsCloud } from 'react-icons/bs';
import type { DigitalLibrary, EditionAdoption } from '../services/musicService';
import { NotRippedIcon } from './shared/DigitalMarks';
import './DigitalStrip.css';

export type DigitalFilter = 'all' | 'buy' | 'digital' | 'lossy' | 'unripped';

/** What DexVault did with the editions Picard wrote into the rips; tracks and credits follow each time. */
const EDITION_NOTICES: Array<{ action: NonNullable<EditionAdoption['action']>; intro: string }> = [
  { action: 'added', intro: 'Ripped but not yet in DexVault, now added to your collection:' },
  { action: 'promoted', intro: 'Ripped from your wish list or your digital albums, now in your collection:' },
  { action: 'edition', intro: 'Edition taken from your rip, as Picard identified the disc:' },
];

interface DigitalStripProps {
  library: DigitalLibrary | null;
  error: string | null;
  editions: EditionAdoption[];
  syncing: boolean;
  onRefresh: () => void;
  filter: DigitalFilter;
  onFilter: (filter: DigitalFilter) => void;
  counts: Record<DigitalFilter, number>;
}

const CHIPS: Array<{ key: DigitalFilter; label: string; icon?: React.ReactNode; className?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'buy', label: 'Buy', icon: <BsCartFill aria-hidden="true" />, className: 'digital-chip-buy' },
  { key: 'digital', label: 'Digital only', icon: <BsCloud aria-hidden="true" /> },
  { key: 'lossy', label: 'Lossy', icon: <small className="digital-chip-format">MP3</small>, className: 'digital-chip-lossy' },
  { key: 'unripped', label: 'Not ripped', icon: <NotRippedIcon />, className: 'digital-chip-unripped' },
];

/**
 * The head of MusicDex with Digital on: what DexVault did at the last sync,
 * what needs doing, and the filters, each with the colour of the mark it
 * picks; Lossy says how many copies are to do again.
 */
const DigitalStrip: React.FC<DigitalStripProps> = ({ library, error, editions, syncing, onRefresh, filter, onFilter, counts }) => {
  return (
    <div className="digital-strip">
      {library && !library.configured && (
        <div className="digital-notice">
          Navidrome is not configured: add <code>NAVIDROME_USER</code> and <code>NAVIDROME_PASSWORD</code> to the DexVault stack.
        </div>
      )}
      {EDITION_NOTICES.map(({ action, intro }) => {
        const done = editions.filter(edition => edition.action === action);
        return done.length > 0 && (
          <div key={action} className="digital-notice digital-notice-done">
            {intro}
            <ul>{done.map(edition => <li key={edition.releaseId}>{edition.title}</li>)}</ul>
          </div>
        );
      })}
      {library?.plugin?.stale && (
        <div className="digital-notice digital-notice-error">
          The DexVault plugin in Navidrome has not reported for over three hours
          {library.plugin.lastReportAt ? ` (last ${new Date(library.plugin.lastReportAt * 1000).toLocaleString()})` : ''}:
          the plays and likes of other accounts are not counted. Check that it is enabled in Navidrome, and its token.
        </div>
      )}
      {(error || library?.error) && (
        <div className="digital-notice digital-notice-error">Could not read Navidrome: {error || library?.error}</div>
      )}
      {library && library.oldCopies.length > 0 && (
        <div className="digital-notice">
          {library.oldCopies.length} old {library.oldCopies.length > 1 ? 'copies' : 'copy'} of CDs already in lossless, to delete
          from the library: {library.oldCopies.map(copy => `${copy.name} (${copy.formats.join('+')})`).join(', ')}
        </div>
      )}

      <div className="digital-strip-row">
        <div className="digital-chips" role="tablist" aria-label="Show">
          {CHIPS.filter(({ key }) => key === 'all' || counts[key] > 0 || filter === key).map(({ key, label, icon, className }) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key}
              className={`digital-chip ${className || ''}${filter === key ? ' active' : ''}`} onClick={() => onFilter(key)}>
              {icon}
              {label}
              {key !== 'all' && <span className="digital-chip-count">{counts[key]}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary digital-refresh" onClick={onRefresh} disabled={syncing}
          title={library?.plugin && library.plugin.accounts.length > 0 ? `Plays and likes of ${library.plugin.accounts.join(', ')} counted too` : undefined}>
          <BsArrowClockwise className={`me-1${syncing ? ' digital-spinning' : ''}`} />
          {syncing ? 'Reading Navidrome…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
};

export default DigitalStrip;
