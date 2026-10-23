import bookService from '../../../../services/bookService';
import { suggestFrom, type SearchKey, type SearchSchema } from '../schema';

/**
 * BookDex's keys, as backend/src/models/book.ts reads them. A first version,
 * the keys and words the field had before its pills.
 */
const fromBooks = (field: string) => suggestFrom((f, typed) => bookService.getAutocompleteSuggestions(f, typed), field);

const keys: SearchKey[] = [
  { key: 'author', group: 'Who', type: 'text', desc: 'One of its authors', example: 'author:Tolkien', suggest: fromBooks('author') },
  { key: 'artist', group: 'Who', type: 'text', desc: 'Its artist or illustrator', example: 'artist:Moebius', suggest: fromBooks('artist') },
  { key: 'owner', group: 'Who', type: 'list', desc: 'Who it belongs to', example: 'owner:Alice', suggest: fromBooks('owner') },
  { key: 'title', group: 'What', type: 'text', desc: 'Words of its title', example: 'title:dune', suggest: fromBooks('title'), valuesForWords: false },
  { key: 'series', group: 'What', type: 'text', desc: 'Its series', example: 'series:Discworld', suggest: fromBooks('series') },
  { key: 'genre', group: 'What', type: 'text', desc: 'One of its genres', example: 'genre:Fantasy', suggest: fromBooks('genre') },
  { key: 'tag', group: 'What', type: 'text', desc: 'One of its tags', example: 'tag:favourite', suggest: fromBooks('tag') },
  { key: 'language', group: 'What', type: 'text', desc: 'Its language', example: 'language:fr', suggest: fromBooks('language') },
  { key: 'isbn', group: 'What', type: 'text', desc: 'Its ISBN', example: 'isbn:978…', valuesForWords: false },
  { key: 'type', group: 'Kind', type: 'enum', desc: 'A book, a graphic novel or a score', values: [
    { value: 'book', desc: 'Book' }, { value: 'graphic-novel', desc: 'Graphic novel' }, { value: 'score', desc: 'Score' },
  ] },
  { key: 'format', group: 'Kind', type: 'text', desc: 'Its format', example: 'format:ebook', values: [
    { value: 'physical', desc: 'Physical' }, { value: 'ebook', desc: 'E-book' }, { value: 'audiobook', desc: 'Audiobook' },
  ], suggest: fromBooks('format') },
  { key: 'title_status', group: 'Kind', type: 'enum', desc: 'Owned or borrowed', values: [
    { value: 'owned', desc: 'Owned' }, { value: 'borrowed', desc: 'Borrowed' }, { value: 'wish', desc: 'On the wish list' },
  ] },
  { key: 'has_ebook', group: 'Kind', type: 'enum', desc: 'Its e-book file is here', values: [
    { value: 'true', desc: 'With an e-book file' }, { value: 'false', desc: 'Without an e-book file' },
  ] },
  { key: 'year', group: 'When', type: 'number', desc: 'Its year, exactly or compared', example: 'year:>=2000', shortcuts: [
    { value: '>=', desc: 'That year or later' }, { value: '<=', desc: 'That year or before' },
  ] },
  { key: 'rating', group: 'Yours', type: 'number', desc: 'Its rating, exactly or compared', example: 'rating:>=4', shortcuts: [
    { value: '5', desc: '5' }, { value: '>=4', desc: '4 or more' }, { value: '<3', desc: 'Under 3' },
  ] },
];

export const booksSchema: SearchSchema = {
  section: 'books',
  keys,
  placeholder: 'Search BookDex by title, author...',
  wordsHint: 'In titles, authors and series',
};
