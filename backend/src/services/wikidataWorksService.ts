import axios from 'axios';
import musicbrainzService from './musicbrainzService';

/**
 * Musical works as Wikidata knows them: found by a title in any language
 * among a composer's works ("Inventionen und Sinfonien", "Lettre à Élise"),
 * with their parts, their MusicBrainz work, their catalogue numbers and their
 * IMSLP page. What MusicBrainz lacks: it has no "Inventions and Sinfonias",
 * only its thirty pieces one by one.
 */

const API = 'https://www.wikidata.org/w/api.php';

export interface WikidataWork {
  qid: string;
  title: string;
  /** Its labels in English, French and German, to tell it from a score's title. */
  labels: string[];
  mbWorkId: string | null;
  /** Its page on IMSLP: "Inventions_and_Sinfonias,_BWV_772-801_(Bach,_Johann_Sebastian)". */
  imslp: string | null;
  catalogue: string[];
  partQids: string[];
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } }; qualifiers?: Record<string, Array<{ datavalue?: { value?: unknown } }>> };
type Entity = { id: string; labels?: Record<string, { value: string }>; claims?: Record<string, Claim[]> };

const get = async <T>(params: Record<string, string>): Promise<T> => (await axios.get(API, {
  params: { format: 'json', ...params },
  headers: { 'User-Agent': musicbrainzService.userAgent },
  timeout: 15000,
})).data as T;

const values = (entity: Entity, property: string): unknown[] =>
  (entity.claims?.[property] || []).map(claim => claim.mainsnak?.datavalue?.value).filter(value => value != null);
const ids = (entity: Entity, property: string): string[] =>
  values(entity, property).map(value => (value as { id?: string }).id).filter((id): id is string => !!id);
const texts = (entity: Entity, property: string): string[] => values(entity, property).filter((value): value is string => typeof value === 'string');

/** The parts in their order: by their ordinal when Wikidata gives one, else as listed. */
const orderedParts = (entity: Entity): string[] => (entity.claims?.P527 || [])
  .map((claim, index) => ({
    id: (claim.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id,
    order: Number((claim.qualifiers?.P1545?.[0]?.datavalue?.value as string | undefined) ?? NaN),
    index,
  }))
  .filter((part): part is { id: string; order: number; index: number } => !!part.id)
  .sort((a, b) => (Number.isFinite(a.order) && Number.isFinite(b.order) ? a.order - b.order : a.index - b.index))
  .map(part => part.id);

const workOf = (entity: Entity): WikidataWork => {
  const labels = ['en', 'fr', 'de'].map(lang => entity.labels?.[lang]?.value).filter((label): label is string => !!label);
  return {
    qid: entity.id,
    title: labels[0] || entity.id,
    labels,
    mbWorkId: texts(entity, 'P435')[0] || null,
    imslp: texts(entity, 'P839')[0] || null,
    catalogue: texts(entity, 'P528'),
    partQids: orderedParts(entity),
  };
};

const cache = new Map<string, WikidataWork>();

/** Works by their ids, fifty at a time, each read once. */
const works = async (qids: string[]): Promise<WikidataWork[]> => {
  const missing = [...new Set(qids)].filter(qid => !cache.has(qid));
  for (let i = 0; i < missing.length; i += 50) {
    const data = await get<{ entities?: Record<string, Entity> }>({
      action: 'wbgetentities', ids: missing.slice(i, i + 50).join('|'), props: 'labels|claims', languages: 'en|fr|de',
    });
    for (const entity of Object.values(data.entities || {})) if (entity.id) cache.set(entity.id, workOf(entity));
  }
  return qids.map(qid => cache.get(qid)).filter((work): work is WikidataWork => !!work);
};

const composers = new Map<string, string | null>();

/** A composer's item: the first human of that name. */
const composerQid = async (name: string): Promise<string | null> => {
  if (composers.has(name)) return composers.get(name)!;
  const found = await get<{ search?: Array<{ id: string }> }>({ action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '7' });
  const candidates = (found.search || []).map(hit => hit.id);
  let qid: string | null = null;
  if (candidates.length) {
    const data = await get<{ entities?: Record<string, Entity> }>({ action: 'wbgetentities', ids: candidates.join('|'), props: 'claims' });
    qid = candidates.find(id => ids(data.entities?.[id] || { id }, 'P31').includes('Q5')) || null;
  }
  composers.set(name, qid);
  return qid;
};

/** A composer's works whose labels, in any language, hold these words. */
const searchWorks = async (words: string, composer: string): Promise<WikidataWork[]> => {
  const qid = await composerQid(composer);
  if (!qid || !words.trim()) return [];
  const data = await get<{ query?: { search?: Array<{ title: string }> } }>({
    action: 'query', list: 'search', srlimit: '6', srsearch: `${words} haswbstatement:P86=${qid}`,
  });
  return works((data.query?.search || []).map(hit => hit.title));
};

/** The item standing for a MusicBrainz work, for its IMSLP page and those of its parts. */
const byMusicBrainz = async (mbWorkId: string): Promise<WikidataWork | null> => {
  const data = await get<{ query?: { search?: Array<{ title: string }> } }>({
    action: 'query', list: 'search', srlimit: '1', srsearch: `haswbstatement:P435=${mbWorkId}`,
  });
  const qid = data.query?.search?.[0]?.title;
  return qid ? (await works([qid]))[0] || null : null;
};

export const imslpPageUrl = (page: string): string => `https://imslp.org/wiki/${encodeURIComponent(page.replace(/ /g, '_')).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')')}`;

export default { works, searchWorks, byMusicBrainz, composerQid };
