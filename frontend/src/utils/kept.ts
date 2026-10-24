import { useCallback, useEffect, useState } from 'react';

/**
 * What a section last read, kept for the session: come back to FilmDex,
 * MusicDex or BookDex and its grid is drawn at once from it, its covers with
 * it, while the section reads again behind; no empty page, no "Loading", no
 * covers drawn twice.
 */
const kept = new Map<string, unknown>();

/** Whether `key` holds something read before. */
export const isKept = (key: string): boolean => kept.has(key);

/**
 * A `useState` whose value outlives the page: a page mounted again starts from it.
 * A value read again and found the same keeps the one shown, so that the grid is
 * not drawn again for nothing.
 */
export function useKeptState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (kept.has(key) ? kept.get(key) as T : initial));
  // The first value is only kept once read: the empty one a page starts from is not.
  const [first] = useState(value);
  useEffect(() => { if (value !== first || kept.has(key)) kept.set(key, value); }, [key, value, first]);
  const set = useCallback((next: T | ((previous: T) => T)) => setValue(previous => {
    const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
    return value !== previous && JSON.stringify(value) === JSON.stringify(previous) ? previous : value;
  }), []);
  return [value, set] as const;
}
