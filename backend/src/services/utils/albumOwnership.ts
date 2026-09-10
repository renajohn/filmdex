/**
 * Ownership fields arrive in two shapes: AlbumMetadataForm posts them flat
 * (condition, notes, purchasedAt, priceChf) while MusicForm nests them under
 * `ownership`. The albums table also constrains `condition` to a short code
 * (CHECK(condition IN ('M','NM','VG+','VG'))), so long labels coming from the
 * UI have to be mapped before they reach SQLite.
 */

export class ConditionError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ConditionError';
  }
}

export interface NormalizedOwnership {
  condition: string | null;
  notes: string | null;
  purchasedAt: string | null;
  priceChf: number | null;
}

/** Codes allowed by the CHECK constraint on albums.condition. */
export const CONDITION_CODES = ['M', 'NM', 'VG+', 'VG'] as const;

const CONDITION_ALIASES: Record<string, string> = {
  'm': 'M',
  'mint': 'M',
  'nm': 'NM',
  'near mint': 'NM',
  'vg+': 'VG+',
  'very good plus': 'VG+',
  'vg': 'VG',
  'very good': 'VG'
};

export const normalizeCondition = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();
  if (value === '') return null;

  const code = CONDITION_ALIASES[value.toLowerCase()];
  if (!code) {
    throw new ConditionError(
      `Invalid condition "${value}". Expected one of: ${CONDITION_CODES.join(', ')}`
    );
  }

  return code;
};

const normalizePrice = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new ConditionError(`Invalid price "${raw}". Expected a number.`);
    }
    return raw;
  }

  const value = String(raw).trim();
  if (value === '') return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ConditionError(`Invalid price "${value}". Expected a number.`);
  }

  return parsed;
};

const normalizeText = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();
  return value === '' ? null : value;
};

/**
 * Accepts either shape and returns a fully populated ownership object.
 * The nested shape wins when both are present.
 */
export const normalizeAlbumOwnership = (data: object = {}): NormalizedOwnership => {
  const source = data as Record<string, unknown>;
  const nested = (source.ownership ?? {}) as Record<string, unknown>;

  const pick = (key: string): unknown =>
    nested[key] !== undefined ? nested[key] : source[key];

  return {
    condition: normalizeCondition(pick('condition')),
    notes: normalizeText(pick('notes')),
    purchasedAt: normalizeText(pick('purchasedAt')),
    priceChf: normalizePrice(pick('priceChf'))
  };
};
