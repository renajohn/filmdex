import axios from 'axios';
import musicbrainzService from './musicbrainzService';
import { plain } from './trackPopularityService';

/**
 * The cover of an album found by a search, before it is added: Cover Art
 * Archive's for its release group, and Deezer's beside it, asked at once.
 * Cover Art Archive keeps its images on archive.org, which at times answers
 * late or not at all; the dialog shows the first image that loads.
 */

/** Neither waits longer: past this, a result shows Deezer's cover, or none. */
const TIMEOUT_MS = 5000;
/** The same album is looked up again and again as searches are refined. */
const KEEP_MS = 60 * 60 * 1000;

interface DeezerAlbum { title: string; cover_medium?: string; cover_big?: string }

const known = new Map<string, { at: number; urls: Promise<string[]> }>();

const https = (url: string): string => url.replace(/^http:\/\//, 'https://');

const fromCoverArtArchive = async (releaseGroupId: string | null): Promise<string | null> => {
  if (!releaseGroupId) return null;
  const art = await musicbrainzService.getReleaseGroupCoverArt(releaseGroupId, TIMEOUT_MS);
  const image = art?.front || art?.back;
  const url = image ? image.thumbnails?.['500'] || image.thumbnails?.['250'] || image.url : null;
  return url ? https(url) : null;
};

/** Deezer's album of that title by that artist; none rather than another album's cover. */
const fromDeezer = async (artist: string, title: string): Promise<string | null> => {
  if (!artist || !title) return null;
  try {
    const q = encodeURIComponent(`artist:"${artist}" album:"${title}"`);
    const { data } = await axios.get(`https://api.deezer.com/search/album?q=${q}&limit=10`, { timeout: TIMEOUT_MS });
    const found: DeezerAlbum[] = Array.isArray(data?.data) ? data.data : [];
    const ours = plain(title);
    const album = found.find(candidate => plain(candidate.title) === ours)
      ?? found.find(candidate => ours && (plain(candidate.title).includes(ours) || ours.includes(plain(candidate.title))));
    return album?.cover_big || album?.cover_medium || null;
  } catch {
    return null;
  }
};

const searchCoverService = {
  /** The covers to try, best first: Cover Art Archive's, then Deezer's. */
  coversOf: (releaseGroupId: string | null, artist: string, title: string): Promise<string[]> => {
    const key = `${releaseGroupId ?? ''}|${artist}|${title}`;
    const kept = known.get(key);
    if (kept && Date.now() - kept.at < KEEP_MS) return kept.urls;
    const urls = Promise.all([fromCoverArtArchive(releaseGroupId), fromDeezer(artist, title)])
      .then(found => found.filter((url): url is string => Boolean(url)));
    known.set(key, { at: Date.now(), urls });
    // Nothing found may be archive.org down for a while: asked again, it is looked up again.
    urls.then(found => { if (found.length === 0) known.delete(key); });
    return urls;
  },
};

export default searchCoverService;
