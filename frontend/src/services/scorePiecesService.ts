/** A score's pieces, as MusicBrainz works, and the recordings of the music that play them. */

export interface PieceRecording { trackId: number; albumId: number; disc: number; no: number; title: string; durationSec: number | null }

export interface PieceAlbum {
  albumId: number;
  title: string;
  artist: string[];
  /** Who plays: its tracks' performers, its artists without the composer otherwise. */
  performers: string[];
  year: number | null;
  cover: string | null;
  rating: number | null;
  titleStatus: string;
  /** How many of the piece's parts it plays. */
  covered: number;
}

export interface ScorePiece {
  id: number;
  workId: string | null;
  title: string;
  /** Its page on IMSLP, when Wikidata knows it. */
  imslp: string | null;
  /** A piece of one movement: no parts of its own. */
  single: boolean;
  parts: Array<{ workId: string; title: string; name: string; sub: string | null; imslp: string | null; recordings: PieceRecording[] }>;
  /** Every part of its work, the score's checked: to choose those it holds. */
  choices: Array<{ workId: string; name: string; sub: string | null; kept: boolean }>;
  /** Tracks playing the piece whole, in one track. */
  whole: PieceRecording[];
  /** The albums playing it, the one played first first. */
  albums: PieceAlbum[];
  preferredAlbumId: number | null;
}

export interface PieceSuggestion {
  workId: string;
  title: string;
  composers: string[];
  parts: number;
  inYourMusic: number;
  why: 'number' | 'your music' | 'wikidata' | 'imslp' | 'title' | 'photo' | 'search';
  read?: string;
  /** Checked from the start: a sure one. */
  likely?: boolean;
}

export interface ScoreEdition {
  title: string;
  composer: string | null;
  publisher: string | null;
  number: string | null;
  code: string | null;
  cover: string | null;
  level: number | null;
  description?: string | null;
  url: string | null;
}

export interface ScoreLookup { edition: ScoreEdition; works: PieceSuggestion[]; from: 'henle' | 'code' | 'words' }

export interface NewScore {
  title: string;
  composer: string | null;
  publisher: string | null;
  number: string | null;
  code: string | null;
  cover: string | null;
  level: number | null;
  description?: string | null;
  url: string | null;
  priceChf: string | null;
  purchasedAt: string | null;
  titleStatus: 'owned' | 'borrowed';
  owner: string | null;
  workIds: string[];
}

export interface AlbumScore { id: number; title: string; composer: string | null; publisher: string | null; cover: string | null }

const json = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `HTTP error! status: ${response.status}`);
  return data as T;
};
const send = <T>(method: string, url: string, body?: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(response => json<T>(response));

const scorePiecesService = {
  pieces: (scoreId: number) => fetch(`/api/scores/${scoreId}/pieces`).then(response => json<ScorePiece[]>(response)),
  addPieces: (scoreId: number, input: { workIds?: string[]; title?: string }) => send<ScorePiece[]>('POST', `/api/scores/${scoreId}/pieces`, input),
  removePiece: (scoreId: number, pieceId: number) => send<void>('DELETE', `/api/scores/${scoreId}/pieces/${pieceId}`),
  keepParts: (scoreId: number, pieceId: number, workIds: string[]) => send<ScorePiece[]>('PUT', `/api/scores/${scoreId}/pieces/${pieceId}/parts`, { workIds }),
  choose: (scoreId: number, pieceId: number, preferredAlbumId: number | null) => send<void>('PUT', `/api/scores/${scoreId}/pieces/${pieceId}`, { preferredAlbumId }),
  suggestions: (scoreId: number) => fetch(`/api/scores/${scoreId}/suggestions`).then(response => json<PieceSuggestion[]>(response)),
  search: (query: string) => fetch(`/api/scores/works/search?q=${encodeURIComponent(query)}`).then(response => json<PieceSuggestion[]>(response)),
  contentsPhoto: (scoreId: number, image: string, mimeType: string) =>
    send<{ suggestions: PieceSuggestion[]; truncated: boolean }>('POST', `/api/scores/${scoreId}/contents-photo`, { image, mimeType }),
  lookup: (query: string) => fetch(`/api/scores/lookup?q=${encodeURIComponent(query)}`).then(response => json<ScoreLookup>(response)),
  create: (score: NewScore) => send<{ id: number }>('POST', '/api/scores', score),
  henle: (scoreId: number) => fetch(`/api/scores/${scoreId}/henle`).then(response => json<{ url: string | null; level: number | null; changed?: boolean }>(response)),
  imslpPage: (scoreId: number) => fetch(`/api/scores/${scoreId}/imslp`).then(response => json<{ page: string | null }>(response)),
  ofAlbum: (albumId: number) => fetch(`/api/music/albums/${albumId}/scores`).then(response => json<AlbumScore[]>(response)),
};

/** A search on YouTube for a piece: its composer, its work, the part. */
export const youtubeUrl = (...words: Array<string | null | undefined>) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim())}`;

/** A piece on IMSLP: its own page when Wikidata names it, a search by its composer and title otherwise. */
export const imslpPieceUrl = (page: string | null, ...words: Array<string | null | undefined>) => (page
  ? `https://imslp.org/wiki/${encodeURI(page.replace(/ /g, '_'))}`
  : `https://imslp.org/index.php?search=${encodeURIComponent(words.filter(Boolean).join(' '))}`);

export default scorePiecesService;
