import { getDatabase } from '../database';

export interface StorySection {
  heading: string;
  level: number;
  text: string;
}

/** The article about a work the album performs, when the album has none of its own. */
export interface WorkStory {
  workTitle: string;
  tracks: number;
  lang: string;
  title: string;
  url: string;
  intro: string;
  sections: StorySection[];
}

/** Why no story was found: the album is not linked to MusicBrainz, or MusicBrainz knows no article. */
export type NotFoundReason = 'no_musicbrainz' | 'no_article';

export interface AlbumStoryRow {
  album_id: number;
  found: number;
  reason: string | null;
  lang: string | null;
  title: string | null;
  url: string | null;
  wikidata_id: string | null;
  intro: string | null;
  sections: string | null;
  works: string | null;
  fetched_at: string;
}

export interface AlbumStoryInput {
  found: boolean;
  reason: NotFoundReason | null;
  lang: string | null;
  title: string | null;
  url: string | null;
  wikidataId: string | null;
  intro: string | null;
  sections: StorySection[];
  works: WorkStory[];
  fetchedAt: string;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) =>
    getDatabase().run(sql, params, (err: Error | null) => (err ? reject(err) : resolve())));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) =>
    getDatabase().get(sql, params, (err: Error | null, row: T | undefined) => (err ? reject(err) : resolve(row ?? null))));

/**
 * The story of an album as told by Wikipedia, kept so that opening an album
 * does not query three services every time. A row with found = 0 records that
 * nothing was found, so the lookup is not repeated on every visit either.
 */
const AlbumStory = {
  createTable: (): Promise<void> =>
    run(`
      CREATE TABLE IF NOT EXISTS album_stories (
        album_id    INTEGER PRIMARY KEY REFERENCES albums(id) ON DELETE CASCADE,
        found       INTEGER NOT NULL,
        reason      TEXT,
        lang        TEXT,
        title       TEXT,
        url         TEXT,
        wikidata_id TEXT,
        intro       TEXT,
        sections    TEXT,
        works       TEXT,
        fetched_at  TEXT NOT NULL
      )
    `).then(async () => {
      // Tables created before works were looked up lack the column.
      const columns = await all<{ name: string }>(`PRAGMA table_info(album_stories)`);
      if (!columns.some(column => column.name === 'works')) await run(`ALTER TABLE album_stories ADD COLUMN works TEXT`);
    }),

  get: (albumId: number): Promise<AlbumStoryRow | null> =>
    get<AlbumStoryRow>(`SELECT * FROM album_stories WHERE album_id = ?`, [albumId]),

  save: (albumId: number, story: AlbumStoryInput): Promise<void> =>
    run(
      `INSERT INTO album_stories (album_id, found, reason, lang, title, url, wikidata_id, intro, sections, works, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(album_id) DO UPDATE SET
         found = excluded.found, reason = excluded.reason, lang = excluded.lang, title = excluded.title, url = excluded.url,
         wikidata_id = excluded.wikidata_id, intro = excluded.intro, sections = excluded.sections, works = excluded.works,
         fetched_at = excluded.fetched_at`,
      [
        albumId, story.found ? 1 : 0, story.reason, story.lang, story.title, story.url, story.wikidataId,
        story.intro, JSON.stringify(story.sections), JSON.stringify(story.works), story.fetchedAt,
      ]
    ),
};

export default AlbumStory;
