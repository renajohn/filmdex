import bookSectionsService from '../../../../services/bookSectionsService';
import { norm } from '../query';
import { yesNo, type SearchKey, type SearchSchema, type SuggestedValue } from '../schema';

/**
 * The scores' keys, as ScoresPage reads them in the browser: composer,
 * publisher, pdf, heard, contents. A first version.
 */

/** The scores' composers or publishers, each once, those containing the words typed. */
const fromScores = (field: 'composer' | 'publisher') => async (typed: string): Promise<SuggestedValue[]> => {
  try {
    const scores = await bookSectionsService.scores();
    const want = norm(typed);
    const names = [...new Set(scores.map(s => s[field]).filter((v): v is string => !!v && !!v.trim()))];
    return names.filter(name => norm(name).includes(want)).sort((a, b) => a.localeCompare(b)).map(value => ({ value }));
  } catch {
    return [];
  }
};

const keys: SearchKey[] = [
  { key: 'composer', group: 'Who', type: 'list', desc: 'Its composer', example: 'composer:Bach', values: [{ value: 'none', desc: 'Anthologies and methods' }], suggest: fromScores('composer') },
  { key: 'publisher', group: 'Who', type: 'list', desc: 'Its publisher', example: 'publisher:Bärenreiter', suggest: fromScores('publisher') },
  { key: 'pdf', group: 'Yours', type: 'bool', desc: 'Its PDF is here', values: yesNo('With a PDF', 'Without a PDF') },
  { key: 'heard', group: 'Yours', type: 'bool', desc: 'Its pieces are in your music', values: yesNo('Played in your music', 'Not in your music') },
  { key: 'contents', group: 'Yours', type: 'bool', desc: 'Its pieces are known', values: yesNo('Contents known', 'Contents unknown') },
];

export const scoresSchema: SearchSchema = {
  section: 'scores',
  keys,
  placeholder: 'Search scores by composer, piece, publisher...',
  wordsHint: 'In titles, composers, editors and publishers',
};
