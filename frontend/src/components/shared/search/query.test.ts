import { describe, it, expect } from 'vitest';
import {
  boolOf, canonical, canonicalQuery, findKey, fitInRows, nameScore, nearestKey, parseNumber, parseToken, quote, splitValues, tokenize } from './query';
import { valuesFromRows, yesNo, type SearchKey } from './schema';

const keys: SearchKey[] = [
  { key: 'artist', aliases: ['by'], group: 'Who', type: 'text', desc: 'The artist' },
  { key: 'composer', group: 'Who', type: 'text', desc: 'A composer' },
  { key: 'cd', group: 'Medium', type: 'bool', desc: 'A CD', values: yesNo('CDs', 'Not CDs') },
  { key: 'favourites', aliases: ['fav', 'favorites'], group: 'Stars', type: 'bool', desc: 'A favourite' },
  { key: 'file', group: 'Medium', type: 'enum', desc: 'Its files', values: [{ value: 'lossless' }, { value: 'lossy' }] },
  { key: 'stars', group: 'Stars', type: 'number', desc: 'Stars' },
  { key: 'last_watched', group: 'When', type: 'date', desc: 'Last watched' },
  { key: 'original_language', aliases: ['lang'], group: 'What', type: 'text', desc: 'Language' },
];

describe('tokenize', () => {
  it('splits on the spaces outside quotes, with where each word stands', () => {
    expect(tokenize('composer:"Johann Sebastian Bach"  blue')).toEqual([
      { text: 'composer:"Johann Sebastian Bach"', start: 0, end: 32 },
      { text: 'blue', start: 34, end: 38 },
    ]);
  });

  it('keeps an unclosed quote to the end, as a word being typed', () => {
    expect(tokenize('title:"Vol: 2 and more').map(t => t.text)).toEqual(['title:"Vol: 2 and more']);
  });

  it('gives nothing for an empty or blank query', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('values and quotes', () => {
  it('splits values on the commas outside quotes', () => {
    expect(splitValues('Bach,"Joni Mitchell","a, b"')).toEqual(['Bach', 'Joni Mitchell', 'a, b']);
    expect(splitValues('')).toEqual(['']);
  });

  it('quotes a value only when a space, a comma or a colon would cut it', () => {
    expect(quote('Bach')).toBe('Bach');
    expect(quote('Joni Mitchell')).toBe('"Joni Mitchell"');
    expect(quote('Vol: 2')).toBe('"Vol: 2"');
    expect(quote('a,b')).toBe('"a,b"');
  });
});

describe('the old words of yes and no', () => {
  it('reads every alias as yes or no', () => {
    for (const v of ['yes', 'true', 'with', 'y', '1', 'YES']) expect(boolOf(v)).toBe('yes');
    for (const v of ['no', 'false', 'without', 'n', '0']) expect(boolOf(v)).toBe('no');
    expect(boolOf('maybe')).toBeNull();
  });
});

describe('numbers', () => {
  it('reads a number, a comparison, a range and decimals', () => {
    expect(parseNumber('4')).toEqual({ op: '=', a: 4 });
    expect(parseNumber('=4')).toEqual({ op: '=', a: 4 });
    expect(parseNumber('>=3.5')).toEqual({ op: '>=', a: 3.5 });
    expect(parseNumber('<3')).toEqual({ op: '<', a: 3 });
    expect(parseNumber('1960-1969')).toEqual({ op: 'range', a: 1960, b: 1969 });
    expect(parseNumber('>')).toBeNull();
    expect(parseNumber('four')).toBeNull();
  });
});

describe('parseToken', () => {
  it('reads a plain word', () => {
    expect(parseToken('blue', keys)).toMatchObject({ kind: 'word', text: 'blue', neg: false });
    expect(parseToken('"Vol: 2"', keys).kind).toBe('word');
  });

  it('reads a filter, its values without their quotes', () => {
    const t = parseToken('composer:Bach,"Carl Philipp Emanuel Bach"', keys);
    expect(t).toMatchObject({ kind: 'filter', rawKey: 'composer', values: ['Bach', 'Carl Philipp Emanuel Bach'] });
    expect(t.def?.key).toBe('composer');
    expect(t.error).toBeUndefined();
  });

  it('reads an exclusion written ! or -', () => {
    expect(parseToken('!composer:Bach', keys)).toMatchObject({ neg: true, sign: '!' });
    expect(parseToken('-composer:Bach', keys)).toMatchObject({ neg: true, sign: '-' });
  });

  it('reads an alias as its key', () => {
    expect(parseToken('by:Mitchell', keys).def?.key).toBe('artist');
    expect(parseToken('lang:fr', keys).def?.key).toBe('original_language');
    expect(findKey('FAV', keys)?.key).toBe('favourites');
  });

  it('marks a key without a value as pending, not as a mistake', () => {
    const t = parseToken('composer:', keys);
    expect(t.pending).toBe(true);
    expect(t.error).toBeUndefined();
  });

  it('offers the key a mistyped name was meant to be', () => {
    const t = parseToken('artst:Mitchell', keys);
    expect(t.error?.msg).toBe('`artst` is not a filter. Did you mean `artist`?');
    expect(t.error?.fix).toBe('artist:Mitchell');
    expect(t.error?.fixLabel).toBe('Use artist');
    expect(parseToken('!artst:Mitchell', keys).error?.fix).toBe('-artist:Mitchell');
    expect(nearestKey('zzzzzz', keys)).toBeNull();
    expect(parseToken('zzzzzz:x', keys).error?.fix).toBeUndefined();
  });

  it('takes yes/no for a bool and says so otherwise', () => {
    expect(parseToken('cd:true', keys).canon).toEqual(['yes']);
    expect(parseToken('cd:without', keys).canon).toEqual(['no']);
    const t = parseToken('cd:maybe', keys);
    expect(t.error?.msg).toBe('`cd` takes yes or no.');
    expect(t.error?.fix).toBe('cd:yes');
  });

  it('takes an enum\'s values alone, and mends one a letter off', () => {
    expect(parseToken('file:LOSSY', keys).canon).toEqual(['lossy']);
    const t = parseToken('file:losy', keys);
    expect(t.error?.msg).toBe('`file` takes lossless, lossy.');
    expect(t.error?.fix).toBe('file:lossy');
    expect(parseToken('file:mp3', keys).error?.fix).toBeUndefined();
  });

  it('takes numbers, comparisons and ranges for a number key', () => {
    expect(parseToken('stars:>=4', keys).nums).toEqual([{ op: '>=', a: 4 }]);
    expect(parseToken('stars:2-4,5', keys).nums).toHaveLength(2);
    expect(parseToken('stars:many', keys).error).toBeDefined();
  });

  it('never finds fault with a date or a free text', () => {
    expect(parseToken('last_watched:>2024-01-01', keys).error).toBeUndefined();
    expect(parseToken('last_watched:week', keys).error).toBeUndefined();
    expect(parseToken('composer:anything at all', keys).error).toBeUndefined();
  });
});

describe('canonical', () => {
  it('writes the key\'s own name, yes/no, and - for an exclusion', () => {
    expect(canonical(parseToken('fav:true', keys))).toBe('favourites:yes');
    expect(canonical(parseToken('!cd:with', keys))).toBe('-cd:yes');
    expect(canonical(parseToken('by:"Joni Mitchell",Bach', keys))).toBe('artist:"Joni Mitchell",Bach');
  });

  it('leaves a word, a pending key and a mistake as written', () => {
    expect(canonical(parseToken('blue', keys))).toBe('blue');
    expect(canonical(parseToken('composer:', keys))).toBe('composer:');
    expect(canonical(parseToken('artst:x', keys))).toBe('artst:x');
  });

  it('comes back to itself', () => {
    const q = 'composer:Bach,Händel -cd:yes stars:>=4 title:"Vol: 2" blue last_watched:>2024-01-01';
    expect(canonicalQuery(q, keys)).toBe(q);
    expect(canonicalQuery(canonicalQuery('cd:true !by:"Joni Mitchell"', keys), keys)).toBe('cd:yes -artist:"Joni Mitchell"');
  });
});

describe('old spellings of yes and no in keys that list them', () => {
  const warned: SearchKey[] = [
    { key: 'spiders', group: 'Warnings', type: 'enum', desc: 'Spiders', values: [{ value: 'yes' }, { value: 'no' }, { value: 'unknown' }] },
    { key: 'watched', group: 'Yours', type: 'number', desc: 'Watched', values: [{ value: 'yes' }, { value: 'no' }] },
  ];

  it('reads spiders:without as spiders:no, not as a mistake', () => {
    const t = parseToken('spiders:without', warned);
    expect(t.error).toBeUndefined();
    expect(canonical(t)).toBe('spiders:no');
    expect(canonical(parseToken('-spiders:with,unknown', warned))).toBe('-spiders:yes,unknown');
  });

  it('reads watched:true as watched:yes, and keeps a count as typed', () => {
    expect(canonical(parseToken('watched:true', warned))).toBe('watched:yes');
    expect(canonical(parseToken('watched:>=2', warned))).toBe('watched:>=2');
    expect(parseToken('watched:maybe', warned).error).toBeDefined();
  });
});

describe('fitInRows', () => {
  it('counts the elements of the first rows, a row being one top', () => {
    expect(fitInRows([0, 0, 30, 30, 60], 2)).toBe(4);
    expect(fitInRows([0, 1, 2], 1)).toBe(3);
    expect(fitInRows([0, 30, 60, 90], 2)).toBe(2);
    expect(fitInRows([], 2)).toBe(0);
  });
});

describe('valuesFromRows', () => {
  it('reads the names held in JSON lists, numbers, each once, those containing the words typed', () => {
    const rows = [{ actor: '["Tom Hanks","Meg Ryan"]' }, { actor: '["Tom Hanks"]' }, { actor: '"Tom Cruise"' }, { actor: null }, { actor: 'undefined' }];
    expect(valuesFromRows(rows, 'actor')).toEqual(['Tom Hanks', 'Meg Ryan', 'Tom Cruise']);
    expect(valuesFromRows(rows, 'actor', 'tom')).toEqual(['Tom Hanks', 'Tom Cruise']);
    expect(valuesFromRows([{ year: 1999 }], 'year')).toEqual(['1999']);
    expect(valuesFromRows([{ title: '[Live] at home' }], 'title')).toEqual(['[Live] at home']);
    expect(valuesFromRows('nope', 'title')).toEqual([]);
  });
});

describe('nameScore', () => {
  it('ranks the name itself, its start (an article aside), a word’s start, then anywhere', () => {
    expect(nameScore('low', 'Low')).toBe(120);
    expect(nameScore('bea', 'The Beatles')).toBe(100);
    expect(nameScore('beyo', 'Beyoncé')).toBe(100);
    expect(nameScore('oeuv', 'Œuvres pour piano')).toBe(100);
    expect(nameScore('beat', 'Beauty and the Beat')).toBe(70);
    expect(nameScore('eat', 'The Beatles')).toBe(30);
    expect(nameScore('xyz', 'The Beatles')).toBe(0);
  });
});
