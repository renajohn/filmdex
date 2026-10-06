import React from 'react';
import type { RipTracks } from '../services/musicService';
import type { TrackPerformer } from '../utils/trackCredits';
import { performersByPerson, ripFileFor, ripFormat, ripSize } from '../utils/trackDetail';
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
  /** The album's artists: a track artist is only worth a line when it differs, as on a compilation. */
  albumArtists?: string[];
  id?: string;
  /** Undefined while Navidrome is being read. */
  rip?: RipTracks | null;
  ripError?: string | null;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </>
);

/**
 * Everything DexVault knows of one track, opened under its row in the track
 * list: one surface whatever the screen, and never a doubt about which track
 * it speaks of.
 */
const TrackDetails: React.FC<TrackDetailsProps> = ({ track, albumArtists = [], id, rip, ripError }) => {
  const people = performersByPerson(track.performers || []);
  const composers = track.composers || [];
  const key = (names: string[]) => names.map(name => name.toLocaleLowerCase()).sort().join('|');
  const artists = key(track.artist || []) === key(albumArtists) ? [] : track.artist || [];
  const file = rip?.found ? ripFileFor(rip.tracks, track.disc, Number(track.no)) : null;
  const credited = Boolean(track.work || composers.length || people.length);

  let ripText: React.ReactNode = null;
  if (ripError) ripText = <span className="track-details-muted">Could not read Navidrome: {ripError}</span>;
  else if (rip === undefined) ripText = <span className="track-details-muted">Reading Navidrome…</span>;
  else if (!rip?.found) ripText = <span className="track-details-muted">Not in Navidrome yet.</span>;
  else if (!file) ripText = <span className="track-details-muted">No file at this position in the rip.</span>;
  else ripText = (
    <>
      {ripFormat(file)}
      {ripSize(file) && <span className="track-details-muted"> · {ripSize(file)}</span>}
      {file.path && <span className="track-details-path">{file.path}</span>}
    </>
  );

  return (
    <div className="track-details" id={id}>
      <dl>
        {track.work && track.work !== track.title && <Field label="Work">{track.work}</Field>}
        {composers.length > 0 && <Field label={composers.length > 1 ? 'Composers' : 'Composer'}>{composers.join(', ')}</Field>}
        {artists.length > 0 && <Field label="Track artist">{artists.join(', ')}</Field>}
        {people.length > 0 && (
          <Field label="Performers">
            <ul className="track-details-people">
              {people.map(person => (
                <li key={person.name}>
                  {person.name} <span className="track-details-muted">{person.roles.join(', ')}</span>
                </li>
              ))}
            </ul>
          </Field>
        )}
        {track.isrc && <Field label="ISRC"><code>{track.isrc}</code></Field>}
        {track.musicbrainzRecordingId && (
          <Field label="MusicBrainz">
            <a href={`https://musicbrainz.org/recording/${track.musicbrainzRecordingId}`} target="_blank" rel="noopener noreferrer">
              Recording
            </a>
          </Field>
        )}
        {rip?.configured !== false && <Field label="Rip">{ripText}</Field>}
      </dl>
      {!credited && <p className="track-details-muted track-details-empty">No credits for this track. Edit the album to add them.</p>}
    </div>
  );
};

export default TrackDetails;
