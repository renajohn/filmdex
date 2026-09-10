import {
  normalizeCondition,
  normalizeAlbumOwnership,
  ConditionError
} from '../../src/services/utils/albumOwnership';

describe('normalizeCondition', () => {
  it('returns null for an empty selection', () => {
    expect(normalizeCondition('')).toBeNull();
    expect(normalizeCondition(null)).toBeNull();
    expect(normalizeCondition(undefined)).toBeNull();
  });

  it('keeps the canonical codes accepted by the albums CHECK constraint', () => {
    expect(normalizeCondition('M')).toBe('M');
    expect(normalizeCondition('NM')).toBe('NM');
    expect(normalizeCondition('VG+')).toBe('VG+');
    expect(normalizeCondition('VG')).toBe('VG');
  });

  it('maps the long labels sent by the metadata form to canonical codes', () => {
    expect(normalizeCondition('Mint')).toBe('M');
    expect(normalizeCondition('Near Mint')).toBe('NM');
    expect(normalizeCondition('Very Good Plus')).toBe('VG+');
    expect(normalizeCondition('Very Good')).toBe('VG');
  });

  it('is tolerant to casing and surrounding whitespace', () => {
    expect(normalizeCondition('  near mint ')).toBe('NM');
    expect(normalizeCondition('vg+')).toBe('VG+');
  });

  it('rejects a value the database would refuse, instead of letting it reach SQLite', () => {
    expect(() => normalizeCondition('Poor')).toThrow(ConditionError);
    expect(() => normalizeCondition('banana')).toThrow(ConditionError);
  });
});

describe('normalizeAlbumOwnership', () => {
  it('reads the flat shape sent by AlbumMetadataForm', () => {
    const result = normalizeAlbumOwnership({
      condition: 'Near Mint',
      notes: 'sealed',
      purchasedAt: '2026-01-15',
      priceChf: '12.50'
    });

    expect(result).toEqual({
      condition: 'NM',
      notes: 'sealed',
      purchasedAt: '2026-01-15',
      priceChf: 12.5
    });
  });

  it('reads the nested shape sent by MusicForm', () => {
    const result = normalizeAlbumOwnership({
      ownership: {
        condition: 'VG+',
        notes: 'slight scuff',
        purchasedAt: '2026-02-01',
        priceChf: 8
      }
    });

    expect(result).toEqual({
      condition: 'VG+',
      notes: 'slight scuff',
      purchasedAt: '2026-02-01',
      priceChf: 8
    });
  });

  it('prefers the nested shape when both are present', () => {
    const result = normalizeAlbumOwnership({
      condition: 'M',
      ownership: { condition: 'VG' }
    });

    expect(result.condition).toBe('VG');
  });

  it('returns nulls rather than undefined so the INSERT is explicit', () => {
    expect(normalizeAlbumOwnership({})).toEqual({
      condition: null,
      notes: null,
      purchasedAt: null,
      priceChf: null
    });
  });

  it('keeps a zero price instead of collapsing it to null', () => {
    expect(normalizeAlbumOwnership({ priceChf: 0 }).priceChf).toBe(0);
    expect(normalizeAlbumOwnership({ priceChf: '0' }).priceChf).toBe(0);
  });

  it('treats an empty price field as no price', () => {
    expect(normalizeAlbumOwnership({ priceChf: '' }).priceChf).toBeNull();
  });

  it('rejects a non-numeric price', () => {
    expect(() => normalizeAlbumOwnership({ priceChf: 'douze' })).toThrow(ConditionError);
  });
});
