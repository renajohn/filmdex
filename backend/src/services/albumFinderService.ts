import axios from 'axios';
import { getDatabase } from '../database';
import musicbrainzService from './musicbrainzService';
import musicService, { downloadCover, isTrustedCoverUrl } from './musicService';
import { plain } from './trackPopularityService';
import type { AlbumFormatted } from '../types';
import logger from '../logger';

/**
 * Finding an album as one finds a film: as one types, in a store's catalogue
 * (iTunes, ranked by what people listen to, with the years; Deezer when
 * iTunes says no, which it does past twenty searches a minute). An album is
 * the work: its editions (Deluxe, Remastered…) are one, its singles left out.
 * Its CD, the edition in the hand, comes from MusicBrainz, and only when a CD
 * is added or bought.
 */

export type FinderSource = 'itunes' | 'deezer';

export interface FinderAlbum {
  source: FinderSource;
  sourceId: string;
  title: string;
  artist: string;
  artistId: string;
  year: string | null;
  tracks: number | null;
  cover: string | null;
  /** How many of the catalogue's albums this one stands for (Deluxe, Remastered…). */
  editions: number;
  /** Already in DexVault: wished, or a CD of the collection. */
  have: { status: 'wish' | 'owned'; id: number } | null;
}

export interface FinderArtist {
  source: FinderSource;
  id: string;
  name: string;
  genre: string | null;
  /** The covers of their albums among the results, to tell homonyms apart. */
  covers: string[];
  albums: number;
}

export interface CdEdition {
  id: string;
  date: string | null;
  country: string | null;
  barcode: string | null;
  labels: string[];
  catalogNumbers: string[];
  packaging: string | null;
  disambiguation: string | null;
  status: string | null;
  formats: string[];
  discs: number;
  front: boolean;
}

export class FinderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FinderError';
  }
}

const KEEP_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 6000;
const kept = new Map<string, { at: number; value: Promise<unknown> }>();

/** One answer per question for an hour: a search is typed again and again as it is refined. */
const remember = <T>(key: string, fetch: () => Promise<T>): Promise<T> => {
  const known = kept.get(key);
  if (known && Date.now() - known.at < KEEP_MS) return known.value as Promise<T>;
  const value = fetch();
  kept.set(key, { at: Date.now(), value });
  value.catch(() => kept.delete(key));
  return value;
};

/** For tests: forget every answer. */
export const forgetFinderAnswers = (): void => kept.clear();

/** An edition's words in a title, not another album's: "(Live in Berlin)" stays, "(Deluxe Edition)" goes. */
const EDITION = /\s*[([][^)\]]*\b(deluxe|edition|édition|remaster(ed)?|version|anniversary|expanded|bonus|special|explicit|reissue)\b[^)\]]*[)\]]/gi;
const SINGLE = /\s+-\s+(single|ep)$/i;

export const workTitle = (title: string): string => title.replace(SINGLE, '').replace(EDITION, '').trim();
const workKey = (artist: string, title: string): string =>
  `${plain(artist).replace(/^the /, '')}|${plain(workTitle(title).replace(/[()[\]]/g, ' '))}`;

/** The editions of one album in the catalogue are one: its shortest title, its first year. */
const merge = (albums: Omit<FinderAlbum, 'editions' | 'have'>[]): Omit<FinderAlbum, 'have'>[] => {
  const byWork = new Map<string, Omit<FinderAlbum, 'have'>>();
  for (const album of albums) {
    const key = workKey(album.artist, album.title);
    const had = byWork.get(key);
    if (!had) {
      byWork.set(key, { ...album, title: workTitle(album.title) || album.title, editions: 1 });
      continue;
    }
    had.editions++;
    if (album.year && (!had.year || album.year < had.year)) had.year = album.year;
    if (!had.cover && album.cover) had.cover = album.cover;
  }
  return [...byWork.values()];
};

/* ---------- iTunes ---------- */

interface ItunesCollection {
  wrapperType?: string; collectionId: number; collectionName: string; artistId: number; artistName: string;
  releaseDate?: string; trackCount?: number; artworkUrl100?: string; primaryGenreName?: string;
}

/** iTunes' artwork at another size: its URLs carry it ("…/100x100bb.jpg"). */
export const artworkAt = (url: string | undefined | null, size: number): string | null =>
  url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : null;

const fromItunes = (row: ItunesCollection) => ({
  source: 'itunes' as const,
  sourceId: String(row.collectionId),
  title: row.collectionName,
  artist: row.artistName,
  artistId: String(row.artistId),
  year: row.releaseDate ? row.releaseDate.slice(0, 4) : null,
  tracks: row.trackCount ?? null,
  cover: artworkAt(row.artworkUrl100, 600),
  single: SINGLE.test(row.collectionName) || (row.trackCount ?? 99) < 5,
  genre: row.primaryGenreName ?? null,
});

const itunes = async (path: string, params: Record<string, string | number>): Promise<ItunesCollection[]> => {
  const { data } = await axios.get(`https://itunes.apple.com/${path}`, { params: { ...params, country: 'CH' }, timeout: TIMEOUT_MS });
  return Array.isArray(data?.results) ? data.results : [];
};

/* ---------- Deezer ---------- */

interface DeezerAlbum {
  id: number; title: string; nb_tracks?: number; record_type?: string; release_date?: string;
  cover_big?: string; cover_xl?: string; cover_medium?: string;
  artist?: { id: number; name: string };
}

const fromDeezer = (row: DeezerAlbum, artist?: { id: number; name: string }) => ({
  source: 'deezer' as const,
  sourceId: String(row.id),
  title: row.title,
  artist: (row.artist || artist)?.name || '',
  artistId: String((row.artist || artist)?.id ?? ''),
  year: row.release_date ? row.release_date.slice(0, 4) : null,
  tracks: row.nb_tracks ?? null,
  cover: (row.cover_big || row.cover_xl || row.cover_medium || null)?.replace(/^http:\/\//, 'https://') ?? null,
  single: row.record_type === 'single' || row.record_type === 'ep',
  genre: null,
});

const deezer = async (path: string): Promise<{ data?: DeezerAlbum[] }> => {
  const { data } = await axios.get(`https://api.deezer.com/${path}`, { timeout: TIMEOUT_MS });
  if (data?.error) throw new Error(`Deezer: ${data.error.message || 'error'}`);
  return data;
};

/* ---------- What DexVault already has ---------- */

const haveIndex = (): Promise<Map<string, { status: 'wish' | 'owned'; id: number }>> => new Promise((resolve, reject) => {
  getDatabase().all(
    `SELECT id, title, artist, title_status FROM albums WHERE title_status IN ('wish', 'owned', 'to_sell')`,
    (err: Error | null, rows: Array<{ id: number; title: string; artist: string; title_status: string }>) => {
      if (err) { reject(err); return; }
      const index = new Map<string, { status: 'wish' | 'owned'; id: number }>();
      for (const row of rows) {
        let artists: string[] = [];
        try { artists = JSON.parse(row.artist || '[]'); } catch { artists = [row.artist]; }
        const status = row.title_status === 'wish' ? 'wish' : 'owned';
        for (const artist of [artists.join(', '), ...artists]) {
          const key = workKey(artist, row.title);
          // A CD of the collection says more than a wish of the same album.
          if (!index.has(key) || status === 'owned') index.set(key, { status, id: row.id });
        }
      }
      resolve(index);
    });
});

const withHave = async (albums: Omit<FinderAlbum, 'have'>[]): Promise<FinderAlbum[]> => {
  const index = await haveIndex();
  return albums.map(album => ({ ...album, have: index.get(workKey(album.artist, album.title)) ?? null }));
};

/* ---------- An artist named by a search ---------- */

/** One letter apart at most: a letter more, less or other ("edit" for "edith"). */
const nearlyEqual = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** A word typed is a word of the name: the same, its start (or the name's word the start of it), or one letter apart. */
const wordMatches = (typed: string, word: string): boolean =>
  typed === word
  || (typed.length >= 3 && word.startsWith(typed))
  || (word.length >= 3 && typed.startsWith(word))
  || (typed.length >= 4 && word.length >= 4 && nearlyEqual(typed, word));

/**
 * Whether a search names this artist, without its accents or its exact
 * spelling: "edit piaf" and "piaf" name Édith Piaf, at least half the words
 * of a name being typed ("black" does not name The Black Eyed Peas).
 */
export const namesArtist = (query: string, name: string): boolean => {
  const typed = plain(query).split(' ').filter(Boolean);
  const words = plain(name).split(' ').filter(word => word.length >= 2 && word !== 'the');
  if (!words.length || !typed.length) return false;
  const found = words.filter(word => typed.some(t => wordMatches(t, word))).length;
  return found * 2 >= words.length;
};

/* ---------- The service ---------- */

type Found = ReturnType<typeof fromItunes> | ReturnType<typeof fromDeezer>;
const strip = ({ single: _single, genre: _genre, ...album }: Found) => album;

const albumFinderService = {
  /**
   * The albums a search finds, and the artists it names: only an artist with
   * albums among them, the one with most first (iTunes knows a dozen Muse,
   * most with a single), with their covers to tell homonyms apart.
   */
  search: async (query: string): Promise<{ albums: FinderAlbum[]; artists: FinderArtist[]; source: FinderSource }> => {
    const q = query.trim();
    if (q.length < 2) return { albums: [], artists: [], source: 'itunes' };
    const { found, source } = await remember(`search|${q.toLowerCase()}`, async () => {
      try {
        const rows = await itunes('search', { term: q, entity: 'album', limit: 50 });
        return { found: rows.map(fromItunes) as Found[], source: 'itunes' as FinderSource };
      } catch (error) {
        logger.warn(`Album finder: iTunes failed (${(error as Error).message}), asking Deezer`);
        const data = await deezer(`search/album?q=${encodeURIComponent(q)}&limit=50`);
        return { found: (data.data || []).map(row => fromDeezer(row)) as Found[], source: 'deezer' as FinderSource };
      }
    });

    const albums = await withHave(merge(found.filter(album => !album.single).map(strip)));

    const byArtist = new Map<string, FinderArtist>();
    for (const album of found.filter(candidate => !candidate.single)) {
      if (!namesArtist(q, album.artist)) continue;
      const artist = byArtist.get(album.artistId)
        ?? { source, id: album.artistId, name: album.artist, genre: album.genre, covers: [], albums: 0 };
      artist.albums++;
      if (album.cover && artist.covers.length < 3) artist.covers.push(album.cover);
      byArtist.set(album.artistId, artist);
    }
    const artists = [...byArtist.values()].sort((a, b) => b.albums - a.albums).slice(0, 4);

    return { albums, artists, source };
  },

  /** An artist's albums, the oldest first, their editions as one and without singles. */
  discography: async (source: FinderSource, artistId: string): Promise<FinderAlbum[]> => {
    if (!/^\d+$/.test(artistId)) throw new FinderError('Unknown artist', 400);
    const found = await remember(`artist|${source}|${artistId}`, async (): Promise<Found[]> => {
      if (source === 'deezer') {
        const data = await deezer(`artist/${artistId}/albums?limit=200`);
        const artist = await deezer(`artist/${artistId}`) as unknown as { id: number; name: string };
        return (data.data || []).map(row => fromDeezer(row, artist));
      }
      const rows = await itunes('lookup', { id: artistId, entity: 'album', limit: 200 });
      return rows.filter(row => row.wrapperType === 'collection').map(fromItunes);
    });
    const own = found.filter(album => album.artistId === artistId && !album.single).map(strip);
    const albums = await withHave(merge(own));
    return albums.sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'));
  },

  /**
   * The CD editions of an album on MusicBrainz, Switzerland then Europe first,
   * the oldest first: the album its title and artist name, as MusicBrainz
   * knows it.
   */
  editions: async (artist: string, title: string): Promise<{
    releaseGroup: { id: string; title: string; artist: string; firstReleaseDate: string | null } | null;
    editions: CdEdition[];
  }> => {
    const work = workTitle(title);
    if (!artist.trim() || !work) throw new FinderError('An artist and a title are needed', 400);
    return remember(`editions|${plain(artist)}|${plain(work)}`, async () => {
      const groups = await musicbrainzService.searchReleaseGroups(artist, work, 8);
      const wanted = plain(work);
      const group = groups.find(candidate => plain(candidate.title) === wanted && candidate.primaryType === 'Album')
        ?? groups.find(candidate => plain(candidate.title) === wanted)
        ?? groups.find(candidate => candidate.score >= 90)
        ?? null;
      if (!group) return { releaseGroup: null, editions: [] };
      const all = await musicbrainzService.getEditionsOfGroup(group.id);
      const editions = all
        .filter(edition => edition.formats.some(format => /CD/i.test(format)))
        .map(({ title: _title, ...edition }) => edition)
        .sort((a, b) => rank(a.country) - rank(b.country) || (a.date || '9999').localeCompare(b.date || '9999'));
      return {
        releaseGroup: { id: group.id, title: group.title, artist: group.artist, firstReleaseDate: group.firstReleaseDate },
        editions,
      };
    });
  },

  /**
   * An album as the finder found it, without an edition: a wish (its CD is
   * chosen when it is bought), or a CD whose edition is to be told later.
   */
  addAlbum: async (input: {
    title?: string; artist?: string; year?: string | number | null; cover?: string | null;
    titleStatus?: string; releaseGroupId?: string | null;
  }): Promise<AlbumFormatted> => {
    const title = (input.title || '').trim();
    const artist = (input.artist || '').trim();
    if (!title || !artist) throw new FinderError('An artist and a title are needed', 400);
    const titleStatus = input.titleStatus === 'owned' ? 'owned' : 'wish';

    const have = (await haveIndex()).get(workKey(artist, title));
    if (have && (have.status === titleStatus || have.status === 'owned')) {
      throw new FinderError(have.status === 'owned' ? 'This album is already in the collection' : 'This album is already on the wish list', 409);
    }

    const year = Number(String(input.year ?? '').slice(0, 4));
    let cover: string | null = null;
    if (input.cover && isTrustedCoverUrl(input.cover)) {
      cover = await downloadCover(artworkAt(input.cover, 1200) || input.cover, `finder_${Date.now()}`, 'front');
    }
    return musicService.addAlbum({
      title,
      artist: [artist],
      releaseYear: Number.isFinite(year) && year > 0 ? year : undefined,
      format: 'CD',
      titleStatus,
      cover: cover || undefined,
      musicbrainzReleaseGroupId: input.releaseGroupId || undefined,
    } as Parameters<typeof musicService.addAlbum>[0]);
  },
};

const EUROPE = new Set(['XE', 'DE', 'FR', 'GB', 'NL', 'IT', 'AT', 'BE', 'ES', 'SE', 'DK', 'NO', 'FI', 'PT', 'IE', 'PL', 'CZ', 'GR', 'LU', 'EU']);
/** Switzerland first, then Europe, then the world, then the rest. */
const rank = (country: string | null): number =>
  country === 'CH' ? 0 : country && EUROPE.has(country) ? 1 : country === 'XW' ? 2 : 3;

export default albumFinderService;
