/**
 * "4:19" -> 259, "1:02:30" -> 3750.
 *
 * Returns null rather than 0 for anything it cannot read: a track silently
 * timed at zero looks like data, while a blank one is visibly missing.
 */
export const durationToSeconds = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  const numbers = parts.map(p => (/^\d+$/.test(p.trim()) ? parseInt(p, 10) : NaN));
  if (numbers.some(Number.isNaN)) return null;

  return numbers.reduce((total, part) => total * 60 + part, 0);
};

export default durationToSeconds;
