/** Fewer votes than this say more about one listener than about the album. */
export const MIN_COMMUNITY_VOTES = 3;

type Source = { value: number | null | undefined; votes: number | null | undefined };

/**
 * One rating out of MusicBrainz's and Discogs's, each weighed by its votes:
 * 27 votes at 4.26 and one at 2 make 4.18, not 3.13. Null under
 * MIN_COMMUNITY_VOTES in all.
 */
export const combineRatings = (...sources: Source[]): { value: number | null; votes: number } => {
  const counted = sources.filter((source): source is { value: number; votes: number } =>
    typeof source.value === 'number' && typeof source.votes === 'number' && source.votes > 0);
  const votes = counted.reduce((total, source) => total + source.votes, 0);
  if (votes < MIN_COMMUNITY_VOTES) return { value: null, votes };
  const value = counted.reduce((total, source) => total + source.value * source.votes, 0) / votes;
  return { value: Math.round(value * 100) / 100, votes };
};
