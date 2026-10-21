import { plain } from '../services/trackPopularityService';

/**
 * The composer of a score, which the books do not say: Google's "author" of a
 * score is most often its editor (Ashkenazy for Bach's French Suites, Mária
 * Eckhardt for Liszt's Consolations) or a publisher. Read from its title
 * ("BRAHMS - Valses Op.39"), from its authors when one is a composer, else
 * from a well-known work ("Deux Arabesques", Debussy). A suggestion: the
 * owner confirms it.
 */

/** Composers by the word they are known by, which a title or a name contains. */
const COMPOSERS: Record<string, string> = {
  albeniz: 'Isaac Albéniz', bach: 'Johann Sebastian Bach', bartok: 'Béla Bartók', beethoven: 'Ludwig van Beethoven',
  bertini: 'Henri Bertini', bizet: 'Georges Bizet', brahms: 'Johannes Brahms', burgmuller: 'Friedrich Burgmüller',
  chopin: 'Frédéric Chopin', clementi: 'Muzio Clementi', couperin: 'François Couperin', czerny: 'Carl Czerny',
  debussy: 'Claude Debussy', dvorak: 'Antonín Dvořák', faure: 'Gabriel Fauré', gershwin: 'George Gershwin',
  glass: 'Philip Glass', granados: 'Enrique Granados', grieg: 'Edvard Grieg', handel: 'George Frideric Handel',
  haendel: 'George Frideric Handel', haydn: 'Joseph Haydn', joplin: 'Scott Joplin', kabalevsky: 'Dmitry Kabalevsky',
  liszt: 'Franz Liszt', mendelssohn: 'Felix Mendelssohn', mozart: 'Wolfgang Amadeus Mozart', mussorgsky: 'Modest Mussorgsky',
  poulenc: 'Francis Poulenc', prokofiev: 'Sergei Prokofiev', rachmaninoff: 'Sergei Rachmaninoff', rachmaninov: 'Sergei Rachmaninoff',
  rameau: 'Jean-Philippe Rameau', ravel: 'Maurice Ravel', satie: 'Erik Satie', scarlatti: 'Domenico Scarlatti',
  schubert: 'Franz Schubert', schumann: 'Robert Schumann', scriabin: 'Alexander Scriabin', tchaikovsky: 'Pyotr Ilyich Tchaikovsky',
  tiersen: 'Yann Tiersen', vivaldi: 'Antonio Vivaldi', williams: 'John Williams', einaudi: 'Ludovico Einaudi',
};

/** Works whose title does not name their composer. */
const WORKS: Array<[RegExp, string]> = [
  [/arabesques?|clair de lune|suite bergamasque|children.?s corner|pr[ée]ludes|cath[ée]drale engloutie|golliwog|reverie|little negro/i, 'debussy'],
  [/invention|suites? fran[cç]aises|suites? anglaises|well.?tempered|wohltemperierte|clavier bien temp|goldberg|anna magdalena/i, 'bach'],
  [/lettre [àa] [ée]lise|f[üu]r elise|woo 59|moonlight|clair de lune sonata|path[ée]tique|appassionata/i, 'beethoven'],
  [/consolations|liebestr[äa]um|rhapsodies? hongroises?/i, 'liszt'],
  [/kinderszenen|album (f[üu]r die jugend|[àa] la jeunesse)|carnaval|papillons|blumenst[üu]ck/i, 'schumann'],
  [/lieder ohne worte|romances sans paroles|songs without words/i, 'mendelssohn'],
  [/gymnop[ée]dies?|gnossiennes?/i, 'satie'],
  [/nocturnes?|ballades?|polonaises?|mazurkas?|berceuse|marche fun[èe]bre/i, 'chopin'],
  [/impromptus?|moments? musicaux/i, 'schubert'],
  [/op\.?\s*100.*petites mains/i, 'bertini'],
  [/harry potter/i, 'williams'],
];

const composerIn = (text: string): string | null => {
  const words = plain(text).split(' ');
  const found = Object.keys(COMPOSERS).find(word => words.includes(word));
  return found ? COMPOSERS[found] : null;
};

/** The composer a score's title, authors or work suggests; null when none does (an anthology, a method). */
export const suggestComposer = (title: string, authors: string[] = []): string | null => {
  const work = WORKS.find(([pattern]) => pattern.test(title));
  return composerIn(title) ?? composerIn(authors.join(' ')) ?? (work ? COMPOSERS[work[1]] : null);
};
