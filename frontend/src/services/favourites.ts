import { useSyncExternalStore } from 'react';

/**
 * The songs' hearts, kept in Navidrome (its "star"): the album's card and the
 * player bar read them here, so a heart given in one shows at once in the
 * other. What Navidrome said comes in with the tracks (`seedFavourite`); a
 * click changes it here first and in Navidrome after, put back if it refuses.
 */
const hearts = new Map<string, boolean>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

/** What Navidrome said of a song as its tracks were read; `ifUnknown` leaves a heart already known alone. */
export const seedFavourite = (songId: string | null | undefined, starred: boolean | undefined, ifUnknown = false): void => {
  if (!songId || starred === undefined || hearts.get(songId) === starred) return;
  if (ifUnknown && hearts.has(songId)) return;
  hearts.set(songId, starred);
  changed();
};

export const isFavourite = (songId: string | null | undefined): boolean => Boolean(songId && hearts.get(songId));

/** Hearts a song or takes its heart away, in Navidrome too; throws, the heart put back, when Navidrome refuses. */
export const setFavourite = async (songId: string, starred: boolean): Promise<void> => {
  const before = hearts.get(songId);
  hearts.set(songId, starred);
  changed();
  try {
    const response = await fetch(`/api/music/navidrome/star/${encodeURIComponent(songId)}`, { method: starred ? 'PUT' : 'DELETE' });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP error! status: ${response.status}`);
  } catch (error) {
    if (before === undefined) hearts.delete(songId);
    else hearts.set(songId, before);
    changed();
    throw error;
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Whether a song is hearted; re-renders when its heart changes. */
export const useFavourite = (songId: string | null | undefined): boolean =>
  useSyncExternalStore(subscribe, () => isFavourite(songId));

/** For tests: no hearts known. */
export const resetFavourites = (): void => {
  hearts.clear();
  changed();
};
