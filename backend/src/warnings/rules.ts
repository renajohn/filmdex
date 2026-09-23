/**
 * Topics we read from DoesTheDogDie, keyed by our own name. Adding one here is
 * enough: votes live in movie_warnings rows, so no migration is needed.
 */
export const TOPICS = { spiders: 165, snakes: 214 } as const;

export type Topic = keyof typeof TOPICS;
export type WarningStatus = 'with' | 'without' | 'unknown';
export type Override = 'with' | 'without';

/** A movie is "with" once this many people saw the animal, whatever the others say. */
export const MIN_YES_VOTES = 5;
/** ...or once yes votes reach this share of all votes. */
export const MIN_YES_PERCENT = 25;

export const isTopic = (value: string): value is Topic =>
  Object.prototype.hasOwnProperty.call(TOPICS, value);

export const isOverride = (value: unknown): value is Override =>
  value === 'with' || value === 'without';

export const classify = (yes: number, no: number, override: Override | null = null): WarningStatus => {
  if (override) return override;
  if (yes + no === 0) return 'unknown';
  // Integer arithmetic keeps this identical to the SQL expression below.
  if (yes >= MIN_YES_VOTES || yes * 100 >= MIN_YES_PERCENT * (yes + no)) return 'with';
  return 'without';
};

/**
 * The same rule as classify(), as a SQL expression over movie_warnings. A movie
 * without a row for the topic is 'unknown'. The topic is checked against TOPICS
 * because it is interpolated, not bound.
 */
export const statusSql = (topic: Topic, movieIdExpr = 'm.id'): string => {
  if (!isTopic(topic)) throw new Error(`Unknown warning topic: ${String(topic)}`);
  return `COALESCE((
    SELECT CASE
      WHEN w.override IS NOT NULL THEN w.override
      WHEN w.yes_votes + w.no_votes = 0 THEN 'unknown'
      WHEN w.yes_votes >= ${MIN_YES_VOTES}
        OR w.yes_votes * 100 >= ${MIN_YES_PERCENT} * (w.yes_votes + w.no_votes) THEN 'with'
      ELSE 'without'
    END
    FROM movie_warnings w
    WHERE w.movie_id = ${movieIdExpr} AND w.topic = '${topic}'
  ), 'unknown')`;
};

export const warningStatusColumnsSql = (): string =>
  (Object.keys(TOPICS) as Topic[]).map(topic => `${statusSql(topic)} AS ${topic}_status`).join(',\n');
