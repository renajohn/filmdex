import musicService from '../../../../services/musicService';
import { isDigitalOn } from '../../../../utils/digitalLibrary';
import { suggestFrom, yesNo, type SearchKey, type SearchSchema } from '../schema';

/**
 * MusicDex's keys, as the backend reads them (backend/src/models/album.ts,
 * _parseSearchQuery, Album.search; favouriteAlbumService for favourites):
 * words on the album or on its tracks, its stars and year, and what Navidrome
 * has of it. The values come from the collection, the digital albums and the
 * wishes too when Digital is on, as the page shows them.
 */
const fromMusic = (field: string) => suggestFrom(
  (f, typed) => musicService.getAutocompleteSuggestions(f, typed, { withNoCd: isDigitalOn() }),
  field,
);

const keys: SearchKey[] = [
  { key: 'artist', aliases: ['by'], group: 'Who', type: 'text', desc: 'The album’s artist, or one of its tracks’', example: 'artist:"Joni Mitchell"', suggest: fromMusic('artist') },
  { key: 'composer', group: 'Who', type: 'text', desc: 'A composer of one of its tracks', example: 'composer:Bach', suggest: fromMusic('composer') },
  { key: 'performer', group: 'Who', type: 'text', desc: 'Plays, sings or conducts on one of its tracks', example: 'performer:Argerich', suggest: fromMusic('performer') },
  { key: 'conductor', group: 'Who', type: 'text', desc: 'Conducts one of its tracks', example: 'conductor:Kleiber', suggest: fromMusic('conductor') },
  { key: 'title', group: 'What', type: 'text', desc: 'Words of the album’s title', example: 'title:blue', suggest: fromMusic('title'), valuesForWords: false },
  { key: 'track', group: 'What', type: 'text', desc: 'Words of one of its tracks’ titles', example: 'track:"So What"', suggest: fromMusic('track'), valuesForWords: false },
  { key: 'work', group: 'What', type: 'text', desc: 'A work on one of its tracks: K. 466, Brandenburg…', example: 'work:"K. 466"', suggest: fromMusic('work') },
  { key: 'genre', group: 'What', type: 'text', desc: 'One of its genres', example: 'genre:jazz', suggest: fromMusic('genre') },
  { key: 'instrument', group: 'What', type: 'text', desc: 'Someone plays it on one of its tracks: cello, piano…', example: 'instrument:cello', suggest: fromMusic('instrument') },
  { key: 'label', group: 'What', type: 'text', desc: 'Its record label', example: 'label:ECM', suggest: fromMusic('label') },
  { key: 'country', group: 'What', type: 'text', desc: 'The country it was released in', example: 'country:DE', suggest: fromMusic('country'), valuesForWords: false },
  { key: 'classical', group: 'What', type: 'bool', desc: 'Classical music, as on the shelves', values: yesNo('Only classical music, as on the shelves', 'Everything but classical music') },
  { key: 'cd', group: 'Medium', type: 'bool', desc: 'A CD of the collection', values: yesNo('Only your CDs', 'Only what you have as files or wish, with Digital on') },
  { key: 'mixtape', group: 'Medium', type: 'bool', desc: 'One of your mixtapes, your playlists in Navidrome', values: yesNo('Only your mixtapes', 'The albums, without the mixtapes') },
  { key: 'ripped', group: 'Medium', type: 'bool', desc: 'A CD of the collection in Navidrome', values: yesNo('A CD in Navidrome', 'A CD not in Navidrome yet') },
  { key: 'file', group: 'Medium', type: 'enum', desc: 'How good its files in Navidrome are', example: 'file:lossy', values: [
    { value: 'lossless', desc: 'FLAC, or 256 kbps and more' },
    { value: 'lossy', desc: 'Below 256 kbps: a copy to do again' },
  ] },
  { key: 'stars', group: 'Your stars', type: 'number', desc: 'Your stars, exactly or a range', example: 'stars:>=4', shortcuts: [
    { value: '5', desc: '★★★★★' },
    { value: '>=4', desc: '4 stars or more' },
    { value: '2-4', desc: 'Between 2 and 4' },
    { value: '<3', desc: 'Under 3' },
    { value: '0', desc: 'Not rated yet' },
  ] },
  { key: 'rated', group: 'Your stars', type: 'bool', desc: 'You have given it stars', values: yesNo('Rated, any number of stars', 'Not rated yet') },
  { key: 'favourites', aliases: ['favorites', 'fav'], group: 'Your stars', type: 'bool', desc: 'A track of it is a favourite (♥ in Navidrome)', values: yesNo('A track of it is a favourite (♥ in Navidrome)', 'No track of it is a favourite') },
  { key: 'year', group: 'When', type: 'number', desc: 'Its year, exactly or a range', example: 'year:1960-1969', shortcuts: [
    { value: '2020-2029', desc: '2020s' },
    { value: '2010-2019', desc: '2010s' },
    { value: '2000-2009', desc: '2000s' },
    { value: '1990-1999', desc: '1990s' },
    { value: '1980-1989', desc: '1980s' },
    { value: '1970-1979', desc: '1970s' },
    { value: '1960-1969', desc: '1960s' },
    { value: '<1960', desc: 'Before 1960' },
  ] },
];

export const musicSchema: SearchSchema = {
  section: 'music',
  keys,
  placeholder: 'Search MusicDex: words, or a filter like composer:Bach',
  wordsHint: 'In titles, artists, composers, performers and works',
};
