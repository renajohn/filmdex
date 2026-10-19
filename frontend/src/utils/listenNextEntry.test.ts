import { describe, it, expect } from 'vitest';
import { discsInWords, entryKey, heldOf, keyOf, listenNextTitle, parseEntryKey } from './listenNextEntry';

describe('an entry of Listen Next', () => {
  it('is named by its album and its disc, 0 for the whole album', () => {
    expect(entryKey(12)).toBe('12:0');
    expect(keyOf({ id: 12, disc: 2 })).toBe('12:2');
    expect(keyOf({ id: 12, disc: null })).toBe('12:0');
    expect(parseEntryKey('12:2')).toEqual({ albumId: 12, disc: 2 });
    expect(parseEntryKey(12)).toEqual({ albumId: 12, disc: 0 });
  });

  it('tells what of an album the list holds', () => {
    const list = [{ id: 1 }, { id: 2, disc: 3 }, { id: 2, disc: 1 }];
    expect(heldOf(list, 1)).toBe('all');
    expect(heldOf(list, 2)).toEqual([1, 3]);
    expect(heldOf(list, 9)).toEqual([]);
  });

  it('says it on the cover’s headphones', () => {
    expect(discsInWords([2])).toBe('Disc 2');
    expect(discsInWords([1, 2])).toBe('Disc 1 & 2');
    expect(discsInWords([1, 2, 4])).toBe('Disc 1, 2 & 4');
    expect(listenNextTitle([])).toBe('Listen Next');
    expect(listenNextTitle([1, 3], 3)).toBe('In Listen Next: Disc 1 & 3 · take it out');
    expect(listenNextTitle('all', 3)).toBe('In Listen Next: all discs · take it out');
    expect(listenNextTitle('all', 1)).toBe('In Listen Next: take it out');
  });
});
