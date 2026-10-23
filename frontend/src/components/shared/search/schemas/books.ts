import bookService from '../../../../services/bookService';
import { suggestFrom, yesNo, type SearchKey, type SearchSchema, type SuggestedValue } from '../schema';

/**
 * BookDex's keys, as backend/src/models/book.ts reads them (Book._parseSearchQuery):
 * words in a column (LIKE, commas for either, `-` for all but, the books without
 * it kept), owner by exact names or none, type and title_status among their
 * values, has_ebook yes/no, year and rating numbers. The values come from the
 * books, through /api/books/autocomplete.
 */
const fromBooks = (field: string) => suggestFrom((f, typed) => bookService.getAutocompleteSuggestions(f, typed), field);

/** The owners of the books, and none for the books of no one, as the owner buttons. */
const owners = fromBooks('owner');
const suggestOwners = async (typed: string): Promise<SuggestedValue[]> => {
  const found = await owners(typed);
  return 'none'.includes(typed.toLowerCase().replace(/"/g, ''))
    ? [...found, { value: 'none', desc: 'The books of no one' }]
    : found;
};

const keys: SearchKey[] = [
  { key: 'author', group: 'Who', type: 'text', desc: 'One of its authors', example: 'author:Tolkien', suggest: fromBooks('author') },
  { key: 'artist', group: 'Who', type: 'text', desc: 'Its artist or illustrator', example: 'artist:Moebius', suggest: fromBooks('artist') },
  { key: 'owner', group: 'Who', type: 'list', desc: 'Whose it is, by exact name; none for no one’s', example: 'owner:Alice,Oriane', suggest: suggestOwners },
  { key: 'title', group: 'What', type: 'text', desc: 'Words of its title', example: 'title:dune', suggest: fromBooks('title'), valuesForWords: false },
  { key: 'subtitle', group: 'What', type: 'text', desc: 'Words of its subtitle', example: 'subtitle:tome', suggest: fromBooks('subtitle'), valuesForWords: false },
  { key: 'series', group: 'What', type: 'text', desc: 'Its series', example: 'series:Discworld', suggest: fromBooks('series') },
  { key: 'genre', group: 'What', type: 'text', desc: 'One of its genres', example: 'genre:Fantasy', suggest: fromBooks('genre') },
  { key: 'tag', group: 'What', type: 'text', desc: 'One of its tags', example: 'tag:favourite', suggest: fromBooks('tag') },
  { key: 'language', group: 'What', type: 'text', desc: 'Its language, as a code', example: 'language:fr', suggest: fromBooks('language'), valuesForWords: false },
  { key: 'isbn', group: 'What', type: 'text', desc: 'Digits of its ISBN, 10 or 13', example: 'isbn:9782070', suggest: fromBooks('isbn'), valuesForWords: false },
  { key: 'type', aliases: ['book_type'], group: 'Kind', type: 'enum', desc: 'A book, a graphic novel or a score', example: 'type:graphic-novel', values: [
    { value: 'book', desc: 'A book' },
    { value: 'graphic-novel', desc: 'A graphic novel' },
    { value: 'score', desc: 'A score, as in Scores' },
  ] },
  { key: 'format', group: 'Kind', type: 'enum', desc: 'On paper, an e-book or an audiobook', example: 'format:ebook', values: [
    { value: 'physical', desc: 'On paper' },
    { value: 'ebook', desc: 'An e-book' },
    { value: 'audiobook', desc: 'An audiobook' },
  ] },
  { key: 'has_ebook', group: 'Kind', type: 'bool', desc: 'Its e-book file is here', values: yesNo('With an e-book file', 'Without an e-book file') },
  { key: 'title_status', group: 'Kind', type: 'enum', desc: 'Owned, borrowed or wished', example: 'title_status:borrowed', values: [
    { value: 'owned', desc: 'Yours' },
    { value: 'borrowed', desc: 'Borrowed from someone' },
    { value: 'wish', desc: 'On the wish list' },
  ] },
  { key: 'year', group: 'When', type: 'number', desc: 'The year it was published, exactly or a range', example: 'year:>=2000', shortcuts: [
    { value: '>=2020', desc: 'Since 2020' },
    { value: '2000-2019', desc: '2000 to 2019' },
    { value: '1950-1999', desc: '1950 to 1999' },
    { value: '<1950', desc: 'Before 1950' },
  ] },
  { key: 'rating', group: 'Your stars', type: 'number', desc: 'Your stars, exactly or compared', example: 'rating:>=4', shortcuts: [
    { value: '5', desc: '★★★★★' },
    { value: '>=4', desc: '4 stars or more' },
    { value: '<3', desc: 'Under 3' },
  ] },
];

export const booksSchema: SearchSchema = {
  section: 'books',
  keys,
  placeholder: 'Search BookDex by title, author...',
  wordsHint: 'In titles, authors, series and ISBNs',
};
