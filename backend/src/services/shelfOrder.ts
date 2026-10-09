/**
 * The order things stand on the shelves, worked out from their data: the
 * name an object is filed under and the key it sorts by. Nothing here reads
 * the database, so the rules can be checked on their own.
 */

/** Articles a name or title is not filed under: "The Beatles" stands at B, "Le Parrain" at P. */
const ARTICLES = /^(the|a|an|le|la|les|l['’]|un|une|des|el|los|las|il|lo|gli)(\s+|(?<=['’]))/i;

/** Particles that follow the surname a person is filed under: "Karajan, Herbert von", "Beethoven, Ludwig van". */
const PARTICLES = new Set(['von', 'van', 'de', 'di', 'da', 'du', 'del', 'della', 'der', 'den', 'ter', 'zu', 'le', 'la', 'dos', 'das']);

const ENSEMBLE = /orchest|philharmon|symphon|sinfoni|chor|choir|chorus|ensemble|academy|akademie|quartet|quartett|quintet|trio\b|consort|singverein|konzertvereinigung|staatsoper|camerata|players|soloists|solisten|virtuos|collegium|musici|kammer|chamber|band\b|opera\b|oper\b|capella|cappella|kapelle|singers|filharmon|staatskapelle/i;

/** Genres that make an album classical, and those that tell a rock album borrowing the word from one. */
const CLASSICAL_GENRES = ['classical', 'baroque', 'romantic', 'opera', 'chamber', 'choral', 'renaissance', 'orchestral', 'concerto', 'symphony'];
const POPULAR_GENRES = /rock|pop|jazz|metal|electronic|soul|folk|blues|hip hop|r&b|disco|funk|chanson|punk/i;

const VARIOUS = /^(various artists|various|divers|compilation|artistes divers)$/i;

/** The articles off the front: "The Beatles" → "Beatles". */
export const withoutArticle = (name: string): string => {
  const trimmed = name.trim();
  const stripped = trimmed.replace(ARTICLES, '');
  return stripped.length > 0 ? stripped : trimmed;
};

/**
 * The key two names compare by: no accents, no case, no punctuation, so
 * "Édith Piaf" sorts with the E's and "AC/DC" beside "Adams".
 */
export const collationKey = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** A name as the cover credits it, without the dates, roles and titles around it: "MATT HAIMOVITZ, Violoncello" → "Matt Haimovitz". */
export const cleanCredit = (credit: string): string => {
  let name = credit.replace(/\([^)]*\)/g, '').split(',')[0].replace(/^sir\s+/i, '').replace(/\s+/g, ' ').trim();
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) {
    name = name.toLowerCase().replace(/(^|[\s\-‐'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
  }
  return name;
};

/**
 * The name a person is filed under, surname first: "Herbert von Karajan" →
 * "Karajan, Herbert von". A single name stays as it is.
 */
export const personSortName = (credit: string): string => {
  const words = cleanCredit(credit).split(' ').filter(Boolean);
  if (words.length < 2) return words.join(' ');
  let start = words.length - 1;
  while (start > 1 && PARTICLES.has(words[start - 1].toLowerCase())) start -= 1;
  // The particles go after the given names, the surname leads.
  const particles = words.slice(start, words.length - 1).filter(word => PARTICLES.has(word.toLowerCase()));
  const surname = words.slice(start).filter(word => !particles.includes(word)).join(' ');
  return `${surname}, ${[...words.slice(0, start), ...particles].join(' ')}`;
};

export const isEnsemble = (name: string): boolean => ENSEMBLE.test(name);

export const isVarious = (name: string | null | undefined): boolean => VARIOUS.test((name || '').trim());

export interface Performer { name: string; role?: string | null }

const lastName = (name: string): string => collationKey(cleanCredit(name)).split(' ').pop() || '';

/** The roles of a classical recording's credits: a CD whose every credit plays one of these is classical. */
const CLASSICAL_ROLE = /^(conductor|orchestra|chorus master|continuo|(piano|fortepiano|harpsichord|organ|violin|viola|violoncello|cello|double bass|harp|flute|oboe|clarinet|bassoon|horn|trumpet|trombone|recorder|lute)|((soprano|mezzo-soprano|alto|contralto|countertenor|tenor|baritone|bass-baritone|bass|choir) vocals))$/i;

/**
 * Whether a CD belongs with the classical ones. MusicBrainz tags rock albums
 * like The Wall "classical" too, so a popular genre beside it rules it out.
 * A CD without genres is classical when its tracks credit only an orchestra,
 * a conductor, classical instruments and voices: a guitar or drums rule it out.
 */
export const isClassicalAlbum = (genres: string[], performers: Performer[] = []): boolean => {
  const lower = genres.map(genre => genre.toLowerCase());
  if (lower.length === 0) {
    return performers.length > 0 && performers.every(performer => CLASSICAL_ROLE.test((performer.role || '').trim()));
  }
  if (!lower.some(genre => CLASSICAL_GENRES.some(word => genre.includes(word)))) return false;
  return !lower.some(genre => POPULAR_GENRES.test(genre));
};

/**
 * Who a classical CD is filed under: the conductor or the soloist whose name
 * heads the cover, never the composer. Of the people the cover credits, apart
 * from composers and orchestras, one is that name; two or three, the first
 * (the soloist before the conductor of a concerto); more, an opera's cast,
 * and the conductor leads. A cover crediting only composers falls back on
 * the conductor of the tracks, then on the composer.
 */
export const classicalHeadline = (artists: string[], composers: string[], performers: Performer[]): string | null => {
  const performerNames = new Set(performers.map(performer => lastName(performer.name)));
  // A soloist who wrote a cadenza is among the composers too, but plays.
  const composerNames = new Set(composers.map(lastName).filter(name => !performerNames.has(name)));
  const isComposer = (credit: string) => /\(\d{4}\s*[–-]\s*\d{4}\)/.test(credit) || composerNames.has(lastName(credit));
  const credited = artists.filter(credit => !isComposer(credit) && !isEnsemble(credit) && !isVarious(credit));
  // The tracks say who plays: a cover crediting a composer the tracks do not name ("Mendelssohn Bartholdy") is not a performer.
  const playing = credited.filter(credit => performerNames.has(lastName(credit)));
  const people = playing.length > 0 ? playing : credited;
  const conductors = new Set(performers.filter(performer => performer.role === 'conductor').map(performer => lastName(performer.name)));

  // The tracks give the full name a cover may shorten: "Karajan" is "Herbert von Karajan".
  const fullName = (credit: string) => performers.find(performer => lastName(performer.name) === lastName(credit))?.name || credit;
  if (people.length >= 1 && people.length <= 3) return fullName(people[0]);
  if (people.length > 3) return fullName(people.find(person => conductors.has(lastName(person))) || people[people.length - 1]);

  const conductor = performers.find(performer => performer.role === 'conductor');
  if (conductor) return conductor.name;
  const soloist = performers.find(performer => performer.role && performer.role !== 'orchestra' && !isEnsemble(performer.name));
  if (soloist) return soloist.name;
  return artists.find(credit => !isVarious(credit)) || null;
};

/** A box set's own name, without the "Coffret trilogie," before it: what is printed large on its spine. */
export const boxSetName = (name: string): string => {
  const match = name.match(/^(coffret|box set|boxset|intégrale)[^,]*,\s*(.+)$/i);
  return match ? match[2] : name;
};

/** A film's title as filed: no article and no "[fr]" note after it. */
export const filmTitle = (title: string): string => withoutArticle(title.replace(/\s*\[[^\]]*\]\s*$/, ''));
