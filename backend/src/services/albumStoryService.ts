import axios from 'axios';
import Album from '../models/album';
import AlbumStory, { AlbumStoryRow, NotFoundReason, StorySection, WorkStory } from '../models/albumStory';
import musicbrainzService from './musicbrainzService';
import musicbrainzLinkService from './musicbrainzLinkService';
import logger from '../logger';

export interface AlbumStoryResult {
  albumId: number;
  found: boolean;
  reason: NotFoundReason | null;
  lang: string | null;
  title: string | null;
  url: string | null;
  intro: string | null;
  sections: StorySection[];
  /** Only when the album has no article of its own. */
  works: WorkStory[];
  fetchedAt: string;
}

interface Article {
  lang: string;
  title: string;
}

/** English first, where album articles are the most complete; French next. */
const PREFERRED_WIKIS = ['enwiki', 'frwiki'];

/** A story found stays until refreshed by hand; a miss is retried after a month, articles get written. */
const RETRY_MISS_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sections that list or reference rather than tell: credits, track listings,
 * charts. A subsection inherits the decision of its section, so the band
 * members listed under "Personnel" go with it.
 */
const SKIPPED_SECTIONS = new Set([
  // English
  'track listing', 'tracklisting', 'personnel', 'credits', 'musicians', 'technical', 'artwork',
  'charts', 'weekly charts', 'year-end charts', 'certifications', 'certifications and sales', 'sales',
  'release history', 'sample credits', 'accolades', 'references', 'notes', 'citations', 'sources',
  'external links', 'see also', 'bibliography', 'further reading', 'footnotes', 'notes and references',
  // Works: casts, numbers and recordings are lists too
  'roles', 'musical numbers', 'instrumentation', 'scoring', 'recordings', 'discography',
  'selected recordings', 'available editions and recordings',
  // French
  'liste des titres', 'liste des pistes', 'titres', 'musiciens', 'crédits', 'classements',
  'classements hebdomadaires', 'notes et références', 'références', 'liens externes', 'voir aussi',
  'rôles', 'distribution', 'discographie', 'bibliographie', 'enregistrements',
]);

const userAgent = (): string => musicbrainzService.userAgent;

const articleUrl = ({ lang, title }: Article): string =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** "https://en.wikipedia.org/wiki/Invisible_Touch" → { lang: 'en', title: 'Invisible Touch' } */
const parseArticleUrl = (url: string): Article | null => {
  const match = url.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/);
  if (!match) return null;
  return { lang: match[1], title: decodeURIComponent(match[2]).replace(/_/g, ' ') };
};

/** Splits a plain-text extract on its "== Heading ==" lines and keeps the narrative sections. */
const parseExtract = (extract: string): { intro: string; sections: StorySection[] } => {
  const clean = (text: string) => text.replace(/\n{3,}/g, '\n\n').trim();
  const parts: StorySection[] = [];
  let intro = '';
  let current: StorySection | null = null;

  for (const line of extract.split('\n')) {
    const heading = line.match(/^(={2,})\s*(.+?)\s*\1\s*$/);
    if (heading) {
      current = { heading: heading[2], level: heading[1].length, text: '' };
      parts.push(current);
    } else if (current) {
      current.text += line + '\n';
    } else {
      intro += line + '\n';
    }
  }

  let skipBelow: number | null = null;
  const kept = parts.filter(section => {
    if (skipBelow !== null && section.level > skipBelow) return false;
    skipBelow = null;
    if (SKIPPED_SECTIONS.has(section.heading.toLowerCase())) {
      skipBelow = section.level;
      return false;
    }
    section.text = clean(section.text);
    return true;
  });

  // An empty heading is only worth keeping as the parent of a kept subsection.
  const sections = kept.filter((section, i) => section.text !== '' || (kept[i + 1]?.level ?? 0) > section.level);
  return { intro: clean(intro), sections };
};

/** The preferred Wikipedia article of a Wikidata item, if it has one. */
const articleOfWikidata = async (wikidataId: string): Promise<Article | null> => {
  const response = await axios.get('https://www.wikidata.org/w/api.php', {
    params: { action: 'wbgetentities', ids: wikidataId, props: 'sitelinks', sitefilter: PREFERRED_WIKIS.join('|'), format: 'json' },
    headers: { 'User-Agent': userAgent() },
    timeout: 10000,
  });
  const sitelinks: Record<string, { title: string }> = response.data?.entities?.[wikidataId]?.sitelinks ?? {};
  const wiki = PREFERRED_WIKIS.find(name => sitelinks[name]);
  return wiki ? { lang: wiki.replace(/wiki$/, ''), title: sitelinks[wiki].title } : null;
};

const findArticle = async (releaseGroupId: string): Promise<{ article: Article; wikidataId: string | null } | null> => {
  const links = await musicbrainzService.getReleaseGroupWikiLinks(releaseGroupId);

  if (links.wikidata) {
    const article = await articleOfWikidata(links.wikidata);
    if (article) return { article, wikidataId: links.wikidata };
  }

  // Older entries link the article directly, in whatever language it was written.
  const direct = links.wikipedia.map(parseArticleUrl).find((article): article is Article => article !== null);
  return direct ? { article: direct, wikidataId: links.wikidata } : null;
};

const fetchExtract = async ({ lang, title }: Article): Promise<{ title: string; extract: string } | null> => {
  const response = await axios.get(`https://${lang}.wikipedia.org/w/api.php`, {
    params: { action: 'query', prop: 'extracts', explaintext: 1, redirects: 1, titles: title, format: 'json' },
    headers: { 'User-Agent': userAgent() },
    timeout: 15000,
  });
  const pages: Record<string, { title: string; extract?: string; missing?: string }> = response.data?.query?.pages ?? {};
  const page = Object.values(pages)[0];
  return page?.extract ? { title: page.title, extract: page.extract } : null;
};

/** At most this many works get a story: a recital of twenty arias is not twenty stories. */
const MAX_WORKS = 4;
/** Work lookups cost a second each; past this many distinct works the album is a song collection. */
const MAX_WORKS_TO_CLIMB = 10;
/** Parts nest: an aria in an act in an opera, a movement in a suite in a set. */
const MAX_DEPTH = 4;

type TopWork = { id: string; title: string; wikidata: string | null; tracks: number };

/**
 * The works an album performs, climbed up to the whole work ("Madama
 * Butterfly", not its arias), with the number of tracks each one covers.
 * Each work is looked up once however many tracks lead to it.
 */
const findTopWorks = async (releaseId: string): Promise<TopWork[]> => {
  const trackWorks = await musicbrainzService.getReleaseTrackWorks(releaseId);

  // Start from the parents the release lookup already gave, to save a level.
  const startsByTrack = trackWorks.map(works => new Set(works.flatMap(work => work.parentIds.length ? work.parentIds : [work.id])));
  const tracksByStart = new Map<string, Set<number>>();
  startsByTrack.forEach((starts, track) => starts.forEach(id => {
    if (!tracksByStart.has(id)) tracksByStart.set(id, new Set());
    tracksByStart.get(id)!.add(track);
  }));
  const anyParts = trackWorks.some(works => works.some(work => work.parentIds.length > 0));
  if (tracksByStart.size === 0 || (!anyParts && tracksByStart.size > MAX_WORKS_TO_CLIMB)) return [];

  const climbed = new Map<string, Promise<{ id: string; title: string; wikidata: string | null }>>();
  const climb = (id: string, depth = 0): Promise<{ id: string; title: string; wikidata: string | null }> => {
    if (!climbed.has(id)) {
      climbed.set(id, musicbrainzService.getWork(id).then(work =>
        work.parentIds.length && depth < MAX_DEPTH ? climb(work.parentIds[0], depth + 1) : work));
    }
    return climbed.get(id)!;
  };

  const starts = [...tracksByStart.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, MAX_WORKS_TO_CLIMB);
  const tops = new Map<string, { work: { id: string; title: string; wikidata: string | null }; tracks: Set<number> }>();
  for (const [startId, tracks] of starts) {
    // One after the other: MusicBrainz allows a request a second, and climbs share their steps.
    const work = await climb(startId);
    const top = tops.get(work.id) ?? { work, tracks: new Set<number>() };
    tracks.forEach(track => top.tracks.add(track));
    tops.set(work.id, top);
  }

  return [...tops.values()]
    .map(({ work, tracks }) => ({ id: work.id, title: work.title, wikidata: work.wikidata, tracks: tracks.size }))
    .sort((a, b) => b.tracks - a.tracks);
};

const findWorkStories = async (releaseId: string): Promise<WorkStory[]> => {
  const stories: WorkStory[] = [];
  for (const work of await findTopWorks(releaseId)) {
    if (stories.length === MAX_WORKS) break;
    if (!work.wikidata) continue;
    const article = await articleOfWikidata(work.wikidata);
    const page = article && await fetchExtract(article);
    if (!article || !page) continue;
    const { intro, sections } = parseExtract(page.extract);
    const found = { lang: article.lang, title: page.title };
    stories.push({ workTitle: work.title, tracks: work.tracks, ...found, url: articleUrl(found), intro, sections });
  }
  return stories;
};

/**
 * The release group comes with the album, or is looked up from its MusicBrainz
 * release, or else found from Discogs, the barcode or the title. Kept either way.
 */
const resolveReleaseGroupId = async (albumId: number): Promise<string | null> => {
  const album = await Album.findById(albumId);
  if (!album) return null;
  if (album.musicbrainzReleaseGroupId) return album.musicbrainzReleaseGroupId;

  if (album.musicbrainzReleaseId) {
    const release = await musicbrainzService.getReleaseDetails(album.musicbrainzReleaseId);
    const releaseGroupId = release['release-group']?.id ?? null;
    if (releaseGroupId) {
      await Album.setReleaseGroupId(albumId, releaseGroupId);
      return releaseGroupId;
    }
  }
  return (await musicbrainzLinkService.linkAlbum(albumId))?.releaseGroupId ?? null;
};

const toResult = (albumId: number, row: AlbumStoryRow): AlbumStoryResult => ({
  albumId,
  found: row.found === 1,
  reason: row.reason as NotFoundReason | null,
  lang: row.lang,
  title: row.title,
  url: row.url,
  intro: row.intro,
  sections: row.sections ? JSON.parse(row.sections) : [],
  works: row.works ? JSON.parse(row.works) : [],
  fetchedAt: row.fetched_at,
});

const fetchAndSave = async (albumId: number): Promise<void> => {
  const fetchedAt = new Date().toISOString();
  const empty = { lang: null, title: null, url: null, wikidataId: null, intro: null, sections: [], works: [], fetchedAt };
  const miss = (reason: NotFoundReason) => AlbumStory.save(albumId, { ...empty, found: false, reason });

  const releaseGroupId = await resolveReleaseGroupId(albumId);
  if (!releaseGroupId) return miss('no_musicbrainz');

  const match = await findArticle(releaseGroupId);
  const page = match && await fetchExtract(match.article);
  if (match && page) {
    const { intro, sections } = parseExtract(page.extract);
    const article = { lang: match.article.lang, title: page.title };
    return AlbumStory.save(albumId, {
      ...empty, found: true, reason: null, lang: article.lang, title: article.title, url: articleUrl(article),
      wikidataId: match.wikidataId, intro, sections,
    });
  }

  // No article about the album: classical records rarely have one, but the works they play do.
  const album = await Album.findById(albumId);
  const releaseId = album?.musicbrainzReleaseId || await musicbrainzService.getFirstReleaseOfGroup(releaseGroupId);
  const works = releaseId ? await findWorkStories(releaseId) : [];
  if (works.length === 0) return miss('no_article');
  await AlbumStory.save(albumId, { ...empty, found: true, reason: null, works });
};

/** A miss is retried once old, or as soon as the album has been linked to MusicBrainz since. */
const isStale = async (row: AlbumStoryRow): Promise<boolean> => {
  if (row.found === 1) return false;
  if (Date.now() - new Date(row.fetched_at).getTime() > RETRY_MISS_AFTER_MS) return true;
  return row.reason === 'no_musicbrainz' && Boolean((await Album.findById(row.album_id))?.musicbrainzReleaseGroupId);
};

const albumStoryService = {
  parseExtract,
  parseArticleUrl,

  /** Answers from the cache, fetching first when the album was never looked up or the miss is old. */
  getStory: async (albumId: number, { refresh = false } = {}): Promise<AlbumStoryResult> => {
    const cached = await AlbumStory.get(albumId);
    if (cached && !refresh && !(await isStale(cached))) return toResult(albumId, cached);

    try {
      await fetchAndSave(albumId);
    } catch (error) {
      // A service that does not answer is not a missing article: keep what we had and let it surface.
      logger.warn(`Album story not fetched for album ${albumId}: ${(error as Error).message}`);
      if (cached && !refresh) return toResult(albumId, cached);
      throw error;
    }
    return toResult(albumId, (await AlbumStory.get(albumId))!);
  },
};

export default albumStoryService;
