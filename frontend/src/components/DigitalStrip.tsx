import React from 'react';
import { BsArrowClockwise, BsCartFill } from 'react-icons/bs';
import type { DigitalLibrary, EditionAdoption } from '../services/musicService';
import './DigitalStrip.css';
import { IconButton } from './shared/Button';
import Chip from './shared/Chip';

/**
 * The head of MusicDex with Digital on, laid in the collection's own head:
 * Buy after the Digital switch, the other filters being words of the search
 * (cd:, file:, ripped:); Refresh beside the count; below, only when there is one, what
 * DexVault did at the last sync and what needs doing.
 */

export type DigitalFilter = 'all' | 'buy';

/** What DexVault did with the editions Picard wrote into the rips; tracks and credits follow each time. */
const EDITION_NOTICES: Array<{ action: NonNullable<EditionAdoption['action']>; intro: string }> = [
  { action: 'added', intro: 'Ripped but not yet in DexVault, now added to your collection:' },
  { action: 'promoted', intro: 'Ripped from your wish list or your digital albums, now in your collection:' },
  { action: 'edition', intro: 'Edition taken from your rip, as Picard identified the disc:' },
];

interface DigitalChipsProps {
  filter: DigitalFilter;
  onFilter: (filter: DigitalFilter) => void;
  counts: Record<DigitalFilter, number>;
}

/** Buy, a pill that a second click lets go; left out with nothing to buy, unless it is shown. */
export const DigitalChips: React.FC<DigitalChipsProps> = ({ filter, onFilter, counts }) => (
  counts.buy > 0 || filter === 'buy' ? (
    <div className="digital-chips" role="group" aria-label="Show">
      <Chip active={filter === 'buy'} icon={<BsCartFill aria-hidden="true" />} count={counts.buy}
        className="digital-chip-buy" onClick={() => onFilter(filter === 'buy' ? 'all' : 'buy')}>
        Buy
      </Chip>
    </div>
  ) : null
);

interface DigitalRefreshProps {
  library: DigitalLibrary | null;
  syncing: boolean;
  onRefresh: () => void;
}

/** Reads Navidrome again: a round button beside the count, turning while it reads. */
export const DigitalRefresh: React.FC<DigitalRefreshProps> = ({ library, syncing, onRefresh }) => {
  const others = library?.plugin?.accounts ?? [];
  const title = syncing ? 'Reading Navidrome…'
    : `Read Navidrome again${others.length > 0 ? ` (plays and likes of ${others.join(', ')} counted too)` : ''}`;
  return (
    <IconButton label={title} size="sm" className="digital-refresh" onClick={onRefresh} disabled={syncing} title={title}><BsArrowClockwise aria-hidden="true" className={syncing ? 'digital-spinning' : undefined} /></IconButton>
  );
};

interface DigitalNoticesProps {
  library: DigitalLibrary | null;
  error: string | null;
  editions: EditionAdoption[];
}

/** What DexVault did at the last sync and what needs doing; nothing at all when all is well. */
export const DigitalNotices: React.FC<DigitalNoticesProps> = ({ library, error, editions }) => {
  const notices: React.ReactNode[] = [];
  if (library && !library.configured) {
    notices.push(
      <div key="configured" className="digital-notice">
        Navidrome is not configured: add <code>NAVIDROME_USER</code> and <code>NAVIDROME_PASSWORD</code> to the DexVault stack.
      </div>);
  }
  for (const { action, intro } of EDITION_NOTICES) {
    const done = editions.filter(edition => edition.action === action);
    if (done.length > 0) {
      notices.push(
        <div key={action} className="digital-notice digital-notice-done">
          {intro}
          <ul>{done.map(edition => <li key={edition.releaseId}>{edition.title}</li>)}</ul>
        </div>);
    }
  }
  if (library?.plugin?.stale) {
    notices.push(
      <div key="plugin" className="digital-notice digital-notice-error">
        The DexVault plugin in Navidrome has not reported for over three hours
        {library.plugin.lastReportAt ? ` (last ${new Date(library.plugin.lastReportAt * 1000).toLocaleString()})` : ''}:
        the plays and likes of other accounts are not counted. Check that it is enabled in Navidrome, and its token.
      </div>);
  }
  if (error || library?.error) {
    notices.push(<div key="error" className="digital-notice digital-notice-error">Could not read Navidrome: {error || library?.error}</div>);
  }
  if (library && library.oldCopies.length > 0) {
    notices.push(
      <div key="old" className="digital-notice">
        {library.oldCopies.length} old {library.oldCopies.length > 1 ? 'copies' : 'copy'} of CDs already in lossless, to delete
        from the library: {library.oldCopies.map(copy => `${copy.name} (${copy.formats.join('+')})`).join(', ')}
      </div>);
  }
  return notices.length > 0 ? <div className="digital-notices">{notices}</div> : null;
};
