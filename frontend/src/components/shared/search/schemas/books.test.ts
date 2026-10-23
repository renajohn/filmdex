import { describe, expect, it, vi } from 'vitest';
import { canonicalQuery, parseToken } from '../query';
import { booksSchema } from './books';
import { scoresSchema } from './scores';

vi.mock('../../../../services/bookService', () => ({ default: { getAutocompleteSuggestions: vi.fn().mockResolvedValue([{ owner: 'Alice' }, { owner: 'Oriane' }]) } }));
vi.mock('../../../../services/bookSectionsService', () => ({ default: { scores: vi.fn().mockResolvedValue([
  { composer: 'Johann Sebastian Bach' }, { composer: 'Claude Debussy' }, { composer: 'Johann Sebastian Bach' }, { composer: null },
]) } }));

describe('les clés de BookDex et de Scores', () => {
  it('ont chacune un groupe, une description en phrase et des noms uniques', () => {
    for (const { keys } of [booksSchema, scoresSchema]) {
      const names = keys.flatMap(k => [k.key, ...(k.aliases || [])]);
      expect(new Set(names).size).toBe(names.length);
      for (const k of keys) {
        expect(k.group).toBeTruthy();
        expect(k.desc).toMatch(/^[A-Z]/);
        if (k.type === 'enum' || k.type === 'bool') expect(k.values?.every(v => v.desc)).toBe(true);
      }
    }
  });

  it('écrivent yes/no et - pour les anciens mots et le !', () => {
    expect(canonicalQuery('has_ebook:true !type:Score book_type:graphic-novel', booksSchema.keys))
      .toBe('has_ebook:yes -type:score type:graphic-novel');
    expect(canonicalQuery('pdf:false !heard:with contents:1', scoresSchema.keys)).toBe('pdf:no -heard:yes contents:yes');
    expect(parseToken('title_status:wished', booksSchema.keys).error?.fix).toBe('title_status:wish');
    expect(parseToken('year:>=2000', booksSchema.keys).nums).toEqual([{ op: '>=', a: 2000 }]);
  });

  it('proposent les propriétaires et none en dernier, les compositeurs par leur nom', async () => {
    const owner = booksSchema.keys.find(k => k.key === 'owner')!;
    expect((await owner.suggest!('')).map(v => v.value)).toEqual(['Alice', 'Oriane', 'none']);
    expect((await owner.suggest!('ori')).map(v => v.value)).toEqual(['Oriane']);
    const composer = scoresSchema.keys.find(k => k.key === 'composer')!;
    expect(await composer.suggest!('')).toEqual([
      { value: 'Johann Sebastian Bach', count: 2 }, { value: 'Claude Debussy', count: 1 },
      { value: 'none', count: 1, desc: 'Anthologies and methods' },
    ]);
  });
});
