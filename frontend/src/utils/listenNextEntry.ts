/**
 * An entry of Listen Next: an album whole, or one of its discs, an album
 * having one entry per disc chosen. Its key is the album's id and its disc,
 * 0 for the whole album ("12:0", "12:2"), as the server names it too.
 */
export type EntryKey = string;

export interface ListenNextEntryLike {
  id: number;
  /** One disc of the album, null or absent for the whole album. */
  disc?: number | null;
}

export const entryKey = (albumId: number, disc?: number | null): EntryKey => `${albumId}:${disc || 0}`;

export const keyOf = (entry: ListenNextEntryLike): EntryKey => entryKey(entry.id, entry.disc);

/** "12:2" as album 12, disc 2; a bare id (an old session's) as the whole album. */
export const parseEntryKey = (key: EntryKey | number): { albumId: number; disc: number } => {
  const [album, disc = '0'] = String(key).split(':');
  return { albumId: Number(album), disc: Number(disc) || 0 };
};

/** What of an album Listen Next holds, from its entries there: 'all', the discs chosen in order, or nothing. */
export const heldOf = (entries: ListenNextEntryLike[], albumId: number): 'all' | number[] => {
  const mine = entries.filter(entry => entry.id === albumId);
  if (mine.some(entry => !entry.disc)) return 'all';
  return mine.map(entry => entry.disc as number).sort((a, b) => a - b);
};

/** The discs held, in words: "Disc 2", "Disc 1 & 3", "Disc 1, 2 & 4". */
export const discsInWords = (discs: number[]): string =>
  discs.length <= 1 ? `Disc ${discs[0] ?? ''}`.trim()
    : `Disc ${discs.slice(0, -1).join(', ')} & ${discs[discs.length - 1]}`;

/**
 * The tooltip of an album's Listen Next button on its cover, which takes the
 * whole album in or out: what of it the list holds, "all discs" for an album
 * of several held whole.
 */
export const listenNextTitle = (held: 'all' | number[], discCount = 0): string => {
  if (held === 'all') return discCount > 1 ? 'In Listen Next: all discs · take it out' : 'In Listen Next: take it out';
  if (held.length === 0) return 'Listen Next';
  return `In Listen Next: ${discsInWords(held)} · take it out`;
};
