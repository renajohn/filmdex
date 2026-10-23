import bookSectionsService from '../../../../services/bookSectionsService';
import { norm } from '../query';
import { yesNo, type SearchKey, type SearchSchema, type SuggestedValue } from '../schema';

/**
 * The scores' keys, as utils/scoreSearch reads them in the browser: composer
 * and publisher by words of their names (none: no one), pdf, heard and contents
 * yes or no. Commas for either value, `-` for all but.
 */

/** Bach under B: a composer by the last word of their name. */
const surname = (name: string) => norm(name.split(' ').slice(-1)[0]);

/** The scores' composers or publishers, each once with how many, those containing the words typed. */
const fromScores = (field: 'composer' | 'publisher', none?: string) => async (typed: string): Promise<SuggestedValue[]> => {
  try {
    const scores = await bookSectionsService.scores();
    const want = norm(typed.replace(/"/g, ''));
    const counts = new Map<string, number>();
    let nobody = 0;
    for (const score of scores) {
      const name = score[field]?.trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
      else nobody++;
    }
    const byName = field === 'composer'
      ? (a: string, b: string) => surname(a).localeCompare(surname(b))
      : (a: string, b: string) => a.localeCompare(b);
    const found: SuggestedValue[] = [...counts.keys()]
      .filter(name => norm(name).includes(want))
      .sort(byName)
      .map(value => ({ value, count: counts.get(value) }));
    // The scores of no one last, as the page shows them.
    return none && nobody && 'none'.includes(want) ? [...found, { value: 'none', count: nobody, desc: none }] : found;
  } catch {
    return [];
  }
};

const keys: SearchKey[] = [
  { key: 'composer', group: 'Who', type: 'list', desc: 'Its composer; none for the anthologies and methods', example: 'composer:Bach', suggest: fromScores('composer', 'Anthologies and methods') },
  { key: 'publisher', group: 'Who', type: 'list', desc: 'Its publisher', example: 'publisher:Bärenreiter', suggest: fromScores('publisher', 'No publisher known') },
  { key: 'pdf', group: 'Yours', type: 'bool', desc: 'Its PDF is attached', values: yesNo('With a PDF to open', 'Without a PDF yet') },
  { key: 'heard', group: 'Yours', type: 'bool', desc: 'Its pieces are in your music', values: yesNo('Played in your music', 'Not in your music') },
  { key: 'contents', group: 'Yours', type: 'bool', desc: 'Its pieces are known', values: yesNo('Its pieces are known', 'Its pieces are not known yet') },
];

export const scoresSchema: SearchSchema = {
  section: 'scores',
  keys,
  placeholder: 'Search scores by composer, piece, publisher...',
  wordsHint: 'In titles, composers, editors and publishers',
};
