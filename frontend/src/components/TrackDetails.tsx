import React, { useEffect, useState } from 'react';
import { BsBoxArrowUpRight } from 'react-icons/bs';
import musicService, { type RipTracks, type TrackLyrics } from '../services/musicService';
import type { TrackPerformer } from '../utils/trackCredits';
import { peopleByRoles, performersByPerson, ripFileFor, ripFormat, ripSize } from '../utils/trackDetail';
import { isAppleMobile, trackListenUrl } from '../utils/navidrome';
import { layOutLyrics } from '../utils/lyricsLayout';
import './TrackDetails.css';

export interface DetailedTrack {
  disc: number;
  no?: number | string;
  title: string;
  isrc?: string | null;
  musicbrainzRecordingId?: string | null;
  work?: string | null;
  artist?: string[];
  composers?: string[];
  performers?: TrackPerformer[];
}

interface TrackDetailsProps {
  track: DetailedTrack;
  /** The CD the track is on: its words are asked for by album, disc and track. Without it, no words. */
  albumId?: number;
  /** The album's artists: a track artist is only worth a line when it differs, as on a compilation. */
  albumArtists?: string[];
  id?: string;
  /** Undefined while Navidrome is being read. */
  rip?: RipTracks | null;
  ripError?: string | null;
  /** Lists the CDs that credit a name too, from a search such as `conductor:"Neville Marriner"`. */
  onSearch?: (predicate: string) => void;
  /** What the details show: who made the track and its rip, or its words. */
  view?: 'credits' | 'lyrics';
}

/** A filter on one value, quoted so a name with spaces stays whole. */
const predicate = (field: string, value: string) => `${field}:"${value.replace(/"/g, '')}"`;

/** The words to read: the plain text, else the timed lines without their times. */
export const lyricsText = (lyrics: Pick<TrackLyrics, 'plain' | 'synced'>): string =>
  (lyrics.plain?.trim() || (lyrics.synced || '').split('\n').map(line => line.replace(/^(\[[^\]]*\])+\s?/, '')).join('\n').trim());

/** The words of a track, asked for when they are shown: the song as it is sung, stanza by stanza. */
const Lyrics: React.FC<{ albumId: number; disc: number; track: number }> = ({ albumId, disc, track }) => {
  const [lyrics, setLyrics] = useState<TrackLyrics | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let current = true;
    setLyrics(undefined);
    setError(null);
    musicService.getLyrics(albumId, disc, track)
      .then(result => { if (current) setLyrics(result); })
      .catch((e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [albumId, disc, track]);

  const askAgain = () => {
    setAsking(true);
    setError(null);
    musicService.getLyrics(albumId, disc, track, true)
      .then(setLyrics)
      .catch((e: Error) => setError(e.message))
      .finally(() => setAsking(false));
  };
  const again = (
    <button type="button" className="track-details-search track-details-lyrics-again" onClick={askAgain} disabled={asking}>
      {asking ? 'Looking…' : 'Look again'}
    </button>
  );

  const text = lyrics?.status === 'found' ? lyricsText(lyrics) : '';
  let body: React.ReactNode;
  if (error) body = <p className="track-details-muted">{error} {again}</p>;
  else if (lyrics === undefined) body = <p className="track-details-muted">Looking up the lyrics…</p>;
  else if (lyrics?.status === 'instrumental') body = <p className="track-details-muted">Instrumental.</p>;
  else if (!text) body = <p className="track-details-muted">No lyrics found. {again}</p>;
  else body = (
    <>
      <div className="track-details-lyrics-text">
        {layOutLyrics(lyrics!).map((stanza, index) => (
          <p key={index}>{stanza.map((line, at) => <React.Fragment key={at}>{at > 0 && <br />}{line}</React.Fragment>)}</p>
        ))}
      </div>
      <p className="track-details-muted track-details-lyrics-source">From LRCLIB{lyrics!.synced ? ', synced' : ''}.</p>
    </>
  );

  return <section className="track-details-lyrics" aria-label="Lyrics">{body}</section>;
};

/**
 * Everything DexVault knows of one track, opened under its row in the track
 * list: one surface whatever the screen, and never a doubt about which track
 * it speaks of. Who made it reads as a row of roles, each over the names that
 * hold it; how to hear it, a strip at the foot. Or, asked from its row, its words.
 */
const TrackDetails: React.FC<TrackDetailsProps> = ({ track, albumId, albumArtists = [], id, rip, ripError, onSearch, view = 'credits' }) => {
  // A credited name or role opens the CDs that credit it as well.
  const link = (field: string, value: string, { label = value, title = `CDs with ${value}`, className = '' } = {}) => (onSearch
    ? <button type="button" className={`track-details-search ${className}`} title={title}
        onClick={() => onSearch(predicate(field, value))}>{label}</button>
    : <span className={className}>{label}</span>);
  const names = (field: string, values: string[]) => values.map((value, index) => (
    <React.Fragment key={value}>{index > 0 && ', '}{link(field, value, { className: 'track-details-person' })}</React.Fragment>
  ));
  const groups = peopleByRoles(performersByPerson(track.performers || []));
  const composers = track.composers || [];
  const key = (list: string[]) => list.map(name => name.toLocaleLowerCase()).sort().join('|');
  const artists = key(track.artist || []) === key(albumArtists) ? [] : track.artist || [];
  const work = track.work && track.work !== track.title ? track.work : null;
  const file = rip?.found ? ripFileFor(rip.tracks, track.disc, Number(track.no)) : null;
  const appleMobile = isAppleMobile();
  const listenUrl = file ? trackListenUrl(file, appleMobile) : null;
  const credited = Boolean(work || composers.length || groups.length);

  // A credit: what it is, small, over who.
  const credit = (label: React.ReactNode, who: React.ReactNode, keyed: string) => (
    <div className="track-details-credit" key={keyed}>
      <span className="track-details-role">{label}</span>
      <span>{who}</span>
    </div>
  );

  let ripText: React.ReactNode = null;
  if (ripError) ripText = <span>Could not read Navidrome: {ripError}</span>;
  else if (rip === undefined) ripText = <span>Reading Navidrome…</span>;
  else if (!rip?.found) ripText = <span>Not in Navidrome yet.</span>;
  else if (!file) ripText = <span>No file at this position in the rip.</span>;
  else ripText = (
    <>
      <span className="track-details-format">{ripFormat(file)}</span>
      {ripSize(file) && <span className="track-details-size">{ripSize(file)}</span>}
    </>
  );

  if (view === 'lyrics' && albumId !== undefined && Number.isInteger(Number(track.no))) {
    return (
      <div className="track-details" id={id}>
        <Lyrics albumId={albumId} disc={track.disc} track={Number(track.no)} />
      </div>
    );
  }

  return (
    <div className="track-details" id={id}>
      {credited || artists.length > 0 ? (
        <div className="track-details-credits">
          {work && credit('work', link('work', work, { title: 'CDs with this work', className: 'track-details-person' }), 'work')}
          {composers.length > 0 && credit(composers.length > 1 ? 'composers' : 'composer', names('composer', composers), 'composer')}
          {artists.length > 0 && credit('track artist', names('artist', artists), 'artist')}
          {groups.map(group => credit(
            group.roles.map((role, index) => (
              <React.Fragment key={role}>
                {index > 0 && ', '}
                {/conduct/i.test(role)
                  ? link('conductor', group.names[0], { label: role, title: `CDs ${group.names[0]} conducts`, className: 'track-details-role-link' })
                  : link('instrument', role, { title: `CDs with ${role}`, className: 'track-details-role-link' })}
              </React.Fragment>
            )),
            names('performer', group.names),
            group.roles.join('|'),
          ))}
        </div>
      ) : (
        <p className="track-details-muted track-details-empty">No credits for this track. Edit the album to add them.</p>
      )}
      <div className="track-details-strip">
        {listenUrl && (
          <a
            className="track-details-link"
            href={listenUrl}
            {...(appleMobile ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {appleMobile ? 'Amperfy' : 'Navidrome'}
            <BsBoxArrowUpRight aria-hidden="true" />
          </a>
        )}
        {rip?.configured !== false && ripText}
        {track.isrc && <span>ISRC <code className="track-details-isrc">{track.isrc}</code></span>}
      </div>
      {file?.path && <span className="track-details-path">{file.path}</span>}
    </div>
  );
};

export default TrackDetails;
