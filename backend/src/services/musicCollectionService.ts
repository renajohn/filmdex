import Collection from '../models/collection';
import AlbumCollection from '../models/albumCollection';
import PlaylistHistory from '../models/playlistHistory';
import logger from '../logger';
import { getDatabase } from '../database';

interface CollectionAlbum {
  id: number;
  title: string;
  /** One disc of the album in Listen Next, null for the whole album. */
  disc?: number | null;
  /** How many discs the album has, from its tracks: 0 when they are not known. */
  discCount?: number;
  [key: string]: unknown;
}

interface CollectionRecord {
  id: number;
  name: string;
  type: string;
}

/** Listen Next's two lists: streamed, played here or in Amperfy, and CDs to put on the player. */
export type ListenNextMedium = 'digital' | 'cd';
export const MEDIUMS: ListenNextMedium[] = ['digital', 'cd'];

/** A row of Listen Next: an album, whole (disc 0) or one of its discs, in one of its two lists. */
export interface ListenNextEntry {
  albumId: number;
  disc: number;
  order: number | null;
  suggested: boolean;
  medium: ListenNextMedium;
}

/** What a click on Listen Next asks: the whole album in or out (none), the whole album ('all'), or one disc in or out. */
export type ListenNextChoice = undefined | 'all' | number;

export interface ListenNextToggleResult {
  id: number;
  action: 'added' | 'removed' | 'kept' | 'moved';
  /** The list it is in now, when it is in one. */
  medium?: ListenNextMedium;
}

/**
 * An entry of Listen Next as the page and the player name it: the album's id
 * and its disc, 0 for the whole album ("12:0", "12:2").
 */
export const entryKey = (albumId: number, disc: number | null | undefined): string => `${albumId}:${disc || 0}`;

/** "12:2" as album 12, disc 2; a bare id as the whole album. Null when it is neither. */
export const parseEntryKey = (key: string | number): { albumId: number; disc: number } | null => {
  const [album, disc = '0'] = String(key).split(':');
  const albumId = Number(album);
  const discNo = Number(disc);
  return Number.isInteger(albumId) && albumId > 0 && Number.isInteger(discNo) && discNo >= 0 ? { albumId, disc: discNo } : null;
};

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows || []))));

const listenNextCollectionId = async (): Promise<number | null> =>
  ((await Collection.findByType('listen_next')) as CollectionRecord | null)?.id ?? null;

/** Listen Next's rows in their order, both lists, one album's alone when `albumId` is given. */
const entriesOf = async (collectionId: number, albumId?: number): Promise<ListenNextEntry[]> =>
  (await all<{ album_id: number; disc: number; collection_order: number | null; suggested: number; medium: string | null }>(
    `SELECT album_id, disc, collection_order, suggested, medium FROM album_collections
     WHERE collection_id = ?${albumId == null ? '' : ' AND album_id = ?'}
     ORDER BY CASE WHEN collection_order IS NOT NULL THEN collection_order ELSE 999999 END, id`,
    albumId == null ? [collectionId] : [collectionId, albumId]))
    .map(row => ({
      albumId: row.album_id, disc: row.disc, order: row.collection_order, suggested: Boolean(row.suggested),
      medium: row.medium === 'cd' ? 'cd' : 'digital',
    }));

/** Put at the end of Listen Next, in one of its lists, and noted so that a draw does not offer it again for a while. */
const addAtEnd = async (collectionId: number, albumId: number, disc: number, medium: ListenNextMedium = 'digital'): Promise<void> => {
  const position = await AlbumCollection.getNextOrder(collectionId);
  await AlbumCollection.create({ album_id: albumId, collection_id: collectionId, collection_order: position, disc, medium });
  try {
    await PlaylistHistory.recordSuggestion(albumId);
  } catch (historyError) {
    // Don't fail the toggle if history recording fails
    logger.warn('Failed to record playlist history:', (historyError as Error).message);
  }
};

const musicCollectionService = {
  /** Listen Next's rows in their order: an album whole, or one disc of it; one list's alone when `medium` is given. */
  getListenNextEntries: async (medium?: ListenNextMedium): Promise<ListenNextEntry[]> => {
    const collectionId = await listenNextCollectionId();
    if (collectionId == null) return [];
    const entries = await entriesOf(collectionId);
    return medium ? entries.filter(entry => entry.medium === medium) : entries;
  },

  /**
   * Listen Next in its order, oldest additions first: each album with the
   * disc it is there for (null for the whole album), an album with two discs
   * chosen twice, and how many discs it has; `suggested` on those a draw put
   * there (Help me choose, the die), which offer the die, not on those put by hand;
   * `medium`, the list it is in. One list's alone when `medium` is given.
   */
  getListenNextAlbums: async (medium?: ListenNextMedium): Promise<CollectionAlbum[]> => {
    try {
      const collectionId = await listenNextCollectionId();
      if (collectionId == null) return [];
      const albums = new Map((await Collection.getAlbums(collectionId) as unknown as CollectionAlbum[]).map(album => [album.id, album]));
      const discCounts = new Map((await all<{ album_id: number; discs: number }>(
        `SELECT t.album_id, COUNT(DISTINCT t.disc_number) AS discs FROM tracks t
         JOIN album_collections ac ON ac.album_id = t.album_id WHERE ac.collection_id = ? GROUP BY t.album_id`, [collectionId]))
        .map(row => [row.album_id, row.discs]));
      return (await entriesOf(collectionId)).filter(entry => !medium || entry.medium === medium).flatMap(entry => {
        const album = albums.get(entry.albumId);
        return album ? [{ ...album, disc: entry.disc || null, discCount: discCounts.get(entry.albumId) ?? 0, suggested: entry.suggested, medium: entry.medium }] : [];
      });
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      throw error;
    }
  },

  /**
   * A click on Listen Next. With no disc, the whole album in, or the album out
   * whatever of it is there. 'all': the whole album, in place of the discs
   * chosen. A disc: in at the end, out if it is there, in place of the whole
   * album if that is there. `medium` names the list, each disc standing in its
   * own: what is asked for in the other list moves to this one rather than
   * leaving, a disc of an album held whole there going alone, the others
   * staying where the album was; new rows go to it, else to the list the album
   * is already in, else to the streamed one.
   */
  setListenNext: async (albumId: number, choice: ListenNextChoice = undefined, medium?: ListenNextMedium): Promise<ListenNextToggleResult> => {
    const collectionId = await listenNextCollectionId();
    if (collectionId == null) throw new Error('Listen Next collection not found');
    const rows = await entriesOf(collectionId, albumId);
    const whole = rows.some(row => row.disc === 0);
    const into: ListenNextMedium = medium ?? rows[0]?.medium ?? 'digital';

    if (choice === undefined) {
      if (rows.length > 0 && medium && rows.some(row => row.medium !== medium)) {
        // From the other list: at the end of this one.
        const position = await AlbumCollection.getNextOrder(collectionId);
        await run('UPDATE album_collections SET medium = ?, collection_order = ? WHERE collection_id = ? AND album_id = ?', [medium, position, collectionId, albumId]);
        return { id: albumId, action: 'moved', medium };
      }
      if (rows.length > 0) {
        await run('DELETE FROM album_collections WHERE collection_id = ? AND album_id = ?', [collectionId, albumId]);
        return { id: albumId, action: 'removed' };
      }
      await addAtEnd(collectionId, albumId, 0, into);
      return { id: albumId, action: 'added', medium: into };
    }

    if (choice === 'all') {
      if (whole) return { id: albumId, action: 'kept' };
      if (rows.length === 0) {
        await addAtEnd(collectionId, albumId, 0, into);
        return { id: albumId, action: 'added', medium: into };
      }
      // At the place of the first disc chosen, in the list asked or that disc's.
      await run('DELETE FROM album_collections WHERE collection_id = ? AND album_id = ? AND disc <> ?', [collectionId, albumId, rows[0].disc]);
      await run('UPDATE album_collections SET disc = 0, suggested = 0, medium = ? WHERE collection_id = ? AND album_id = ?', [into, collectionId, albumId]);
      return { id: albumId, action: 'added' };
    }

    const held = rows.find(row => row.disc === choice);
    if (held && medium && held.medium !== medium) {
      // From the other list: at the end of this one, the album's other discs where they are.
      const position = await AlbumCollection.getNextOrder(collectionId);
      await run('UPDATE album_collections SET medium = ?, collection_order = ? WHERE collection_id = ? AND album_id = ? AND disc = ?', [medium, position, collectionId, albumId, choice]);
      return { id: albumId, action: 'moved', medium };
    }
    if (held) {
      await run('DELETE FROM album_collections WHERE collection_id = ? AND album_id = ? AND disc = ?', [collectionId, albumId, choice]);
      return { id: albumId, action: 'removed' };
    }
    const wholeRow = rows.find(row => row.disc === 0);
    if (wholeRow && medium && wholeRow.medium !== medium) {
      // The album held whole in the other list: its other discs stay there, at its place, this one comes to this list.
      const discs = (await all<{ disc: number }>('SELECT DISTINCT COALESCE(disc_number, 1) AS disc FROM tracks WHERE album_id = ? ORDER BY disc', [albumId]))
        .map(row => row.disc).filter(disc => disc !== choice);
      await run('DELETE FROM album_collections WHERE collection_id = ? AND album_id = ? AND disc = 0', [collectionId, albumId]);
      for (const disc of discs) {
        await AlbumCollection.create({ album_id: albumId, collection_id: collectionId, collection_order: wholeRow.order, disc, medium: wholeRow.medium });
      }
      await addAtEnd(collectionId, albumId, choice, medium);
      return { id: albumId, action: 'moved', medium };
    }
    if (whole) {
      // The whole album gives its place to the disc.
      await run('UPDATE album_collections SET disc = ?, suggested = 0 WHERE collection_id = ? AND album_id = ? AND disc = 0', [choice, collectionId, albumId]);
      return { id: albumId, action: 'added' };
    }
    await addAtEnd(collectionId, albumId, choice, into);
    return { id: albumId, action: 'added', medium: into };
  },

  /**
   * An entry dragged to the other list, or within it: before the entry
   * `before` (where it was dropped), else at the 'start' or the 'end' of the
   * list it goes to. The album's other discs in the same list go with it,
   * those in the other list stay. False when it is not in Listen Next.
   */
  moveListenNext: async (key: string, medium: ListenNextMedium, at: 'start' | 'end' = 'end', before?: string): Promise<boolean> => {
    const collectionId = await listenNextCollectionId();
    const entry = parseEntryKey(key);
    if (collectionId == null || !entry) return false;
    const entries = await entriesOf(collectionId);
    const dragged = entries.find(one => one.albumId === entry.albumId && one.disc === entry.disc)
      ?? entries.find(one => one.albumId === entry.albumId);
    if (!dragged) return false;
    const goes = (one: ListenNextEntry) => one.albumId === dragged.albumId && one.medium === dragged.medium;
    await run('UPDATE album_collections SET medium = ? WHERE collection_id = ? AND album_id = ? AND medium = ?', [medium, collectionId, dragged.albumId, dragged.medium]);
    const moving = entries.filter(goes);
    const rest = entries.filter(one => !goes(one));
    const next = before ? parseEntryKey(before) : null;
    const place = next ? rest.findIndex(one => one.albumId === next.albumId && one.disc === next.disc) : -1;
    const order = place >= 0 ? [...rest.slice(0, place), ...moving, ...rest.slice(place)]
      : at === 'start' ? [...moving, ...rest] : [...rest, ...moving];
    for (const [index, one] of order.entries()) await AlbumCollection.updateOrder(one.albumId, collectionId, index + 1, one.disc);
    return true;
  },

  /** A CD come into the collection: at the end of the CD list, to be put on the player, unless Listen Next has it already. */
  addNewCd: async (albumId: number): Promise<boolean> => {
    const collectionId = await listenNextCollectionId();
    if (collectionId == null || (await entriesOf(collectionId, albumId)).length > 0) return false;
    await addAtEnd(collectionId, albumId, 0, 'cd');
    return true;
  },

  /**
   * The CDs come in since `since` (bought or added), the classical ones left
   * out, put in the CD list: how Listen Next's CD list starts. Those already
   * in Listen Next stay where they are. How many were put.
   */
  seedCdList: async (since: string): Promise<number> => {
    const collectionId = await listenNextCollectionId();
    if (collectionId == null) return 0;
    const { default: Album } = await import('../models/album');
    const listed = new Set((await entriesOf(collectionId)).map(entry => entry.albumId));
    const lately = (await Album.search('classical:no'))
      .filter(album => !listed.has(album.id))
      .filter(album => [album.ownership?.purchasedAt || '', String(album.createdAt || '').slice(0, 10)].some(day => day >= since))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const album of lately) {
      const position = await AlbumCollection.getNextOrder(collectionId);
      await AlbumCollection.create({ album_id: album.id, collection_id: collectionId, collection_order: position, disc: 0, medium: 'cd' });
    }
    return lately.length;
  },

  /**
   * Listen Next in the order given, dragged on its banner, as entry keys
   * ("12:0", "12:2"; a bare album id is the whole album). An entry the order
   * leaves out (added meanwhile) keeps its turn after those given; one no
   * longer in the list is passed over.
   */
  reorderListenNext: async (keys: Array<string | number>): Promise<CollectionAlbum[]> => {
    const collectionId = await listenNextCollectionId();
    if (collectionId == null) return [];
    const current = (await entriesOf(collectionId)).map(entry => entryKey(entry.albumId, entry.disc));
    const asked = keys.map(parseEntryKey).flatMap(entry => (entry ? [entryKey(entry.albumId, entry.disc)] : []));
    const given = [...new Set(asked)].filter(key => current.includes(key));
    const order = [...given, ...current.filter(key => !given.includes(key))];
    for (const [index, key] of order.entries()) {
      const { albumId, disc } = parseEntryKey(key)!;
      await AlbumCollection.updateOrder(albumId, collectionId, index + 1, disc);
    }
    return musicCollectionService.getListenNextAlbums();
  }
};

export default musicCollectionService;
