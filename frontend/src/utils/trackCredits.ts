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

const performerKey = (performer: TrackPerformer) => `${performer.name}|${performer.role}`;

/** What every track shares: kept when present on all of them, in the first track's order. */
const shared = <T>(lists: T[][], key: (item: T) => string): T[] => {
  if (lists.length === 0) return [];
  return lists[0].filter(item => lists.every(list => list.some(other => key(other) === key(item))));
};

/**
 * The credits of a disc, printed once at its head for what all tracks share
 * (the composer of a recital, the conductor and orchestra of an opera), and
 * above a track only for the rest, and only where it changes: the movements
 * of one concerto share a line, a singer shows up where they start singing.
 */
export const discCredits = (tracks: CreditedTrack[], albumArtists: string[]): { common: string | null; perTrack: Array<string | null> } => {
  const composers = shared(tracks.map(track => track.composers || []), name => name);
  const performers = shared(tracks.map(track => track.performers || []), performerKey);
  const common = trackCredits({ composers, performers }, albumArtists);

  let previous: string | null = null;
  const perTrack = tracks.map(track => {
    const credits = trackCredits({
      // A classical track's artist is its composer, already named.
      artist: track.composers?.length ? [] : track.artist,
      composers: composers.length > 0 ? [] : track.composers,
      performers: (track.performers || []).filter(performer => !performers.some(p => performerKey(p) === performerKey(performer))),
    }, albumArtists);
    const heading = credits !== previous ? credits : null;
    previous = credits;
    return heading;
  });
  return { common, perTrack };
};
