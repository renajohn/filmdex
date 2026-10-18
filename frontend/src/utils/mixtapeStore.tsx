import { useEffect, useSyncExternalStore } from 'react';
import musicService, { type MixtapeDetails, type MixtapeSummary } from '../services/musicService';
import { toast } from '../components/shared/Toast';

/**
 * The mixtapes as MusicDex, a CD's dialog and a mixtape's dialog share them:
 * read from the server (which lists Navidrome's playlists again), and kept in
 * step with every change made here.
 */
interface MixtapesState {
  loaded: boolean;
  configured: boolean;
  mixtapes: MixtapeSummary[];
}

let state: MixtapesState = { loaded: false, configured: false, mixtapes: [] };
const listeners = new Set<() => void>();
let reading: Promise<void> | null = null;

const set = (next: MixtapesState) => {
  state = next;
  listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Reads the mixtapes again, once at a time however many ask. */
export const reloadMixtapes = (): Promise<void> => {
  reading = reading ?? Promise.resolve()
    .then(() => musicService.getMixtapes())
    .then(({ configured, mixtapes }) => set({ loaded: true, configured, mixtapes }))
    .catch(error => console.warn('Mixtapes not read:', error))
    .finally(() => { reading = null; });
  return reading;
};

/** The mixtapes, read once as the first component asking for them shows. */
export const useMixtapes = (): MixtapesState => {
  const current = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (!state.loaded) reloadMixtapes();
  }, []);
  return current;
};

/** The most recently changed first, as the menus list them. */
export const byLastChange = (mixtapes: MixtapeSummary[]): MixtapeSummary[] =>
  [...mixtapes].sort((a, b) => String(b.album.updatedAt ?? '').localeCompare(String(a.album.updatedAt ?? '')));

/** A mixtape as the server has it now, after a change made here. */
export const noteMixtape = (details: MixtapeDetails) => {
  const summary: MixtapeSummary = { album: details.album, playlistId: details.playlistId, songIds: details.songs.map(song => song.songId) };
  const known = state.mixtapes.some(one => one.album.id === details.album.id);
  set({ ...state, mixtapes: known ? state.mixtapes.map(one => (one.album.id === details.album.id ? summary : one)) : [...state.mixtapes, summary] });
};

export const forgetMixtape = (albumId: number) => {
  set({ ...state, mixtapes: state.mixtapes.filter(one => one.album.id !== albumId) });
};

/** How many of `songIds` the mixtape holds. */
export const heldIn = (mixtape: MixtapeSummary, songIds: string[]): number =>
  new Set(songIds.filter(id => mixtape.songIds.includes(id))).size;

const what = (count: number, title?: string) => (count === 1 && title ? <b>{title}</b> : `${count} tracks`);

/**
 * The toggle of a mixtape's menu: when it holds every one of `songIds`, they
 * are taken out, every copy; otherwise those missing go at the end, those
 * there staying where they are. The toast offers to undo it.
 */
export const toggleInMixtape = async (mixtape: MixtapeSummary, songIds: string[], title?: string): Promise<void> => {
  const unique = [...new Set(songIds)];
  const before = mixtape.songIds;
  const held = heldIn(mixtape, unique);
  const removing = held === unique.length;
  try {
    const details = await musicService.updateMixtape(mixtape.album.id, removing ? { remove: unique } : { add: unique });
    noteMixtape(details);
    const undo = {
      label: 'Undo',
      onClick: () => {
        musicService.updateMixtape(mixtape.album.id, { songs: before }).then(noteMixtape)
          .catch(() => toast(`${mixtape.album.title} not put back`, { tone: 'danger' }));
      },
    };
    if (removing) {
      toast(<>{what(unique.length, title)} taken out of <b>{mixtape.album.title}</b></>, { tone: 'success', action: undo });
    } else {
      const added = unique.length - held;
      toast(<>{what(added, title)} added to <b>{mixtape.album.title}</b>{held > 0 ? `, the ${held === 1 ? 'other was' : `${held} others were`} there` : ''}</>,
        { tone: 'success', action: undo });
    }
  } catch {
    toast(`${mixtape.album.title} not changed: Navidrome did not answer`, { tone: 'danger' });
    reloadMixtapes();
  }
};

/** A new mixtape with these songs; its album id, null when Navidrome made none. */
export const createMixtape = async (name: string, songIds: string[]): Promise<number | null> => {
  try {
    const album = await musicService.createMixtape(name, songIds);
    await reloadMixtapes();
    toast(<><b>{album.title}</b> made, {songIds.length === 1 ? '1 track' : `${new Set(songIds).size} tracks`}</>, { tone: 'success' });
    return album.id;
  } catch {
    toast(`${name} not made: Navidrome did not answer`, { tone: 'danger' });
    return null;
  }
};

/** For tests: nothing read yet. */
export const resetMixtapes = () => set({ loaded: false, configured: false, mixtapes: [] });
