import React, { useEffect, useMemo, useState } from 'react';
import { BsUpcScan } from 'react-icons/bs';
import albumFinderService, { CdEdition, CdEditions } from '../services/albumFinderService';
import Chip from './shared/Chip';
import CoverTag from './shared/CoverTag';
import { Loading } from './shared/Spinner';
import { TextField } from './shared/TextField';
import './CdEditionPicker.css';

const COUNTRY: Record<string, string> = {
  CH: 'Switzerland', XE: 'Europe', EU: 'Europe', DE: 'Germany', FR: 'France', GB: 'UK', NL: 'Netherlands', IT: 'Italy',
  AT: 'Austria', BE: 'Belgium', ES: 'Spain', SE: 'Sweden', US: 'USA', JP: 'Japan', AU: 'Australia', CA: 'Canada',
  XW: 'Worldwide', ZA: 'South Africa', BR: 'Brazil', KR: 'South Korea', TW: 'Taiwan', MX: 'Mexico', AR: 'Argentina',
};
const EUROPE = new Set(['XE', 'EU', 'DE', 'FR', 'GB', 'NL', 'IT', 'AT', 'BE', 'ES', 'SE', 'DK', 'NO', 'FI', 'PT', 'IE', 'PL', 'CZ', 'GR', 'LU']);
const REGIONS = ['Switzerland', 'Europe', 'North America', 'Japan', 'Elsewhere'] as const;
const regionOf = (country: string | null): string =>
  country === 'CH' ? 'Switzerland' : country && EUROPE.has(country) ? 'Europe'
    : country === 'US' || country === 'CA' ? 'North America' : country === 'JP' ? 'Japan' : 'Elsewhere';

/** What one types from the back of a CD, without its spaces and dashes. */
const bare = (value: string | null | undefined): string => (value || '').replace(/[\s\-./]/g, '').toLowerCase();

interface CdEditionPickerProps {
  artist: string;
  title: string;
  /** The album's cover, shown faint beside an edition MusicBrainz has no photo of. */
  cover?: string | null;
  selected: string | null;
  onSelect: (edition: CdEdition | null) => void;
  /** What is typed in the field: the caller may take a barcode or a MusicBrainz link no edition matches. */
  onFilterChange?: (filter: string) => void;
  /** Once read, the album as MusicBrainz knows it and its CD editions. */
  onLoaded?: (editions: CdEditions) => void;
  initialFilter?: string;
  autoFocus?: boolean;
}

/**
 * Which CD it is: the CD editions of an album on MusicBrainz, Switzerland
 * and Europe first, each with what tells it apart in the hand (its labels,
 * catalog numbers, barcode, its packaging, the comment MusicBrainz gives
 * it). The field narrows them by what is on the back of the CD, or by a
 * sign (remaster, digipak); one left is chosen.
 */
const CdEditionPicker: React.FC<CdEditionPickerProps> = ({
  artist, title, cover, selected, onSelect, onFilterChange, onLoaded, initialFilter = '', autoFocus,
}) => {
  const [found, setFound] = useState<CdEditions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(initialFilter);
  const [region, setRegion] = useState<string>('All');

  useEffect(() => {
    let live = true;
    setFound(null);
    setError(null);
    albumFinderService.editions(artist, title)
      .then(result => { if (live) { setFound(result); onLoaded?.(result); } })
      .catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist, title]);

  const typed = bare(filter);
  const hit = (value: string | null | undefined) => Boolean(typed) && bare(value).includes(typed);
  const shown = useMemo(() => (found?.editions || []).filter(edition =>
    (region === 'All' || regionOf(edition.country) === region)
    && (!typed || hit(edition.barcode) || edition.catalogNumbers.some(hit) || hit(edition.disambiguation) || hit(edition.packaging))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [found, region, typed]);

  // One edition left by what was typed: it is the one.
  useEffect(() => {
    if (typed && shown.length === 1 && shown[0].id !== selected) onSelect(shown[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, shown]);

  const mark = (value: string) => hit(value) ? <mark>{value}</mark> : value;

  if (error) return <p className="cd-editions__empty">{error}</p>;
  if (!found) return <Loading>Finding its CD editions on MusicBrainz…</Loading>;

  const editions = found.editions;
  const regions = REGIONS.filter(name => editions.some(edition => regionOf(edition.country) === name));

  return (
    <div className="cd-editions">
      <TextField
        icon={<BsUpcScan />}
        placeholder="Barcode, catalog number, or a sign: remaster, digipak…"
        value={filter}
        autoFocus={autoFocus}
        inputMode="search"
        aria-label="Filter the editions"
        onChange={event => { setFilter(event.target.value); onFilterChange?.(event.target.value); }}
      />
      {regions.length > 1 && (
        <div className="cd-editions__regions">
          <Chip active={region === 'All'} count={editions.length} onClick={() => setRegion('All')}>All</Chip>
          {regions.map(name => (
            <Chip key={name} active={region === name} count={editions.filter(edition => regionOf(edition.country) === name).length}
              onClick={() => setRegion(name)}>{name}</Chip>
          ))}
        </div>
      )}
      {!editions.length ? (
        <p className="cd-editions__empty">MusicBrainz knows no CD of this album.</p>
      ) : !shown.length ? (
        <p className="cd-editions__empty">No edition with “{filter}”.</p>
      ) : (
        <div className="cd-editions__list" role="radiogroup" aria-label="CD editions">
          {shown.map(edition => {
            const on = edition.id === selected;
            return (
              <button key={edition.id} type="button" role="radio" aria-checked={on}
                className={`cd-edition${on ? ' cd-edition--on' : ''}`} onClick={() => onSelect(on ? null : edition)}>
                <span className="cd-edition__dot" aria-hidden="true" />
                <img className={`cd-edition__pic${edition.front ? '' : ' cd-edition__pic--album'}`} loading="lazy" alt=""
                  src={edition.front ? `https://coverartarchive.org/release/${edition.id}/front-250` : cover || '/placeholder-album.png'}
                  title={edition.front ? undefined : 'No photo of this edition'} />
                <span className="cd-edition__text">
                  <span className="cd-edition__label">
                    {edition.labels.join(', ') || 'Unknown label'}
                    <span className="cd-edition__where"> · {COUNTRY[edition.country || ''] || edition.country || '?'}{edition.date ? ` · ${edition.date.slice(0, 4)}` : ''}</span>
                  </span>
                  <span className="cd-edition__numbers">
                    {[...edition.catalogNumbers, edition.barcode].filter((n): n is string => Boolean(n)).map((n, i) => (
                      <React.Fragment key={n}>{i > 0 && ' · '}{mark(n)}</React.Fragment>
                    ))}
                    {!edition.catalogNumbers.length && !edition.barcode && 'No catalog number'}
                  </span>
                  {(edition.disambiguation || edition.packaging || (edition.status && edition.status !== 'Official') || edition.discs > 1 || edition.formats.some(f => f !== 'CD')) && (
                    <span className="cd-edition__signs">
                      {edition.disambiguation && <span className="cd-edition__comment">{mark(edition.disambiguation)}</span>}
                      {edition.packaging && <CoverTag variant="muted">{edition.packaging}</CoverTag>}
                      {edition.discs > 1 && <CoverTag>{edition.discs} discs</CoverTag>}
                      {edition.formats.filter(f => f !== 'CD').map(f => <CoverTag key={f} variant="gold">{f}</CoverTag>)}
                      {edition.status && edition.status !== 'Official' && <CoverTag variant="orange">{edition.status}</CoverTag>}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CdEditionPicker;
