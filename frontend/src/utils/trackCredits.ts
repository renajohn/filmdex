export interface TrackPerformer {
  name: string;
  role: string;
}

export interface CreditedTrack {
  artist?: string[];
  composers?: string[];
  performers?: TrackPerformer[];
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/**
 * One line naming who wrote and who plays a track, as MusicBrainz credits it:
 * "Antonio Vivaldi — Paul Sacher (conductor), Mstislav Rostropovich (cello)".
 * The track artist only shows when there is no composer and it differs from
 * the album's, as on a compilation. Null when there is nothing to say.
 */
export const trackCredits = (track: CreditedTrack, albumArtists: string[]): string | null => {
  const composers = track.composers || [];
  const performers = (track.performers || []).map(p => `${p.name} (${p.role})`);
  const artists = (track.artist || []).filter(name => !albumArtists.some(albumArtist => same(albumArtist, name)));
  const authors = composers.length > 0 ? composers : artists;
  const parts = [authors.join(' / '), performers.join(', ')].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : null;
};

/**
 * The credits to print above each track: only where they change, so the
 * movements of one concerto share a single line instead of repeating it.
 */
export const creditHeadings = (tracks: CreditedTrack[], albumArtists: string[]): Array<string | null> => {
  let previous: string | null = null;
  return tracks.map(track => {
    const credits = trackCredits(track, albumArtists);
    const heading = credits !== previous ? credits : null;
    previous = credits;
    return heading;
  });
};
