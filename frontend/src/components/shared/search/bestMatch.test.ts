import { describe, expect, it } from 'vitest';
import { bestMatchFirst, hasMatchScores } from './bestMatch';

describe('bestMatchFirst', () => {
  it('puts the best match first, keeping the given order between equals', () => {
    const items = [{ id: 'a', matchScore: 30 }, { id: 'b', matchScore: 100 }, { id: 'c', matchScore: 30 }, { id: 'd', matchScore: 100 }];
    expect(bestMatchFirst(items).map(i => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('leaves a list nobody scored as it is', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(hasMatchScores(items)).toBe(false);
    expect(bestMatchFirst(items)).toBe(items);
  });
});
