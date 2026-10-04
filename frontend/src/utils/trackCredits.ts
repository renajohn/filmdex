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

/** "Ryan Tedder (drums, piano, bass guitar)" rather than one entry per instrument. */
export const formatPerformers = (performers: TrackPerformer[]): string => {
  const roles = new Map<string, string[]>();
  for (const performer of performers) {
    const list = roles.get(performer.name) || [];
    for (const role of performer.role.split(', ')) if (!list.includes(role)) list.push(role);
    roles.set(performer.name, list);
  }
  return [...roles.entries()].map(([name, list]) => `${name} (${list.join(', ')})`).join(', ');
};

/**
 * One line naming who wrote and who plays a track, as MusicBrainz credits it:
 * "Antonio Vivaldi — Paul Sacher (conductor), Mstislav Rostropovich (cello)".
 * The track artist only shows when there is no composer and it differs from
 * the album's, as on a compilation. Null when there is nothing to say.
 */
export const trackCredits = (track: CreditedTrack, albumArtists: string[]): string | null => {
  const composers = track.composers || [];
  const artists = (track.artist || []).filter(name => !albumArtists.some(albumArtist => same(albumArtist, name)));
  const authors = composers.length > 0 ? composers : artists;
  const parts = [authors.join(' / '), formatPerformers(track.performers || [])].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : null;
};

const performerKey = (performer: TrackPerformer) => `${performer.name}|${performer.role}`;

/** The roles a listener looks for: who conducts, which orchestra and choir, which voices. */
const FEATURED_ROLE = /^(conductor|orchestra|chorus master)$|choir|chorus|\b(soprano|mezzo-soprano|alto|contralto|countertenor|tenor|baritone|bass-baritone|bass) vocals\b/;
const CLASSICAL_VOICE = /\b(soprano|mezzo-soprano|alto|contralto|countertenor|tenor|baritone|bass-baritone|bass) vocals\b|choir|chorus/;

/**
 * Splits a track's performers into those worth a line and the session
 * musicians. A band's lead and backing vocals mark a pop track, whose
 * performers all go to the musicians, its gospel choir with them; elsewhere
 * up to three instrumentalists are the soloists of a concerto or a recital
 * and stay in the line.
 */
const splitPerformers = (performers: TrackPerformer[]): { featured: TrackPerformer[]; musicians: TrackPerformer[] } => {
  const featured = performers.filter(performer => FEATURED_ROLE.test(performer.role));
  const others = performers.filter(performer => !FEATURED_ROLE.test(performer.role));
  const pop = others.some(performer => /vocals/.test(performer.role) && !CLASSICAL_VOICE.test(performer.role));
  const players = new Set(others.map(performer => performer.name)).size;
  if (pop) return { featured: [], musicians: performers };
  return players <= 3 ? { featured: performers, musicians: [] } : { featured, musicians: others };
};

/**
 * What every credited track shares, in the first one's order. A track
 * MusicBrainz left without credits is a gap in its data, not another
 * composer: Aja's "Black Cow" has none, the six others are Becker / Fagen.
 */
const shared = <T>(lists: T[][], key: (item: T) => string): T[] => {
  const credited = lists.filter(list => list.length > 0);
  if (credited.length === 0) return [];
  return credited[0].filter(item => credited.every(list => list.some(other => key(other) === key(item))));
};

/** Keeps a line only where it differs from the track before. */
const onChange = (lines: Array<string | null>): Array<string | null> =>
  lines.map((line, index) => (index > 0 && line === lines[index - 1] ? null : line));

export interface DiscCredits {
  common: string | null;
  perTrack: Array<string | null>;
  musicians: Array<string | null>;
}

/**
 * The credits of a disc, printed once at its head for what all tracks share
 * (the composer of a recital, the conductor and orchestra of an opera), and
 * above a track only for the rest, and only where it changes: the movements
 * of one concerto share a line, a singer shows up where they start singing.
 * Session musicians come apart, for a page that shows them on demand.
 */
export const discCredits = (tracks: CreditedTrack[], albumArtists: string[]): DiscCredits => {
  const split = tracks.map(track => splitPerformers(track.performers || []));
  const composers = shared(tracks.map(track => track.composers || []), name => name);
  const performers = shared(split.map(parts => parts.featured), performerKey);
  const common = trackCredits({ composers, performers }, albumArtists);

  const perTrack = onChange(tracks.map((track, index) => trackCredits({
    // A classical track's artist is its composer, already named.
    artist: track.composers?.length ? [] : track.artist,
    composers: composers.length > 0 ? [] : track.composers,
    performers: split[index].featured.filter(performer => !performers.some(p => performerKey(p) === performerKey(performer))),
  }, albumArtists)));
  const musicians = onChange(split.map(parts => formatPerformers(parts.musicians) || null));

  return { common, perTrack, musicians };
};
