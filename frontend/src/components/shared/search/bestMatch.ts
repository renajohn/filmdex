import { useCallback, useEffect, useRef, useState } from 'react';

/** What a search found, with how well its plain words name it (the backend's matchScore). */
interface Scored {
  matchScore?: number;
}

/** Whether a search's plain words scored what it found: only then is there a best match. */
export const hasMatchScores = (items: readonly unknown[]): boolean =>
  items.some(item => (item as Scored)?.matchScore != null);

/** The best match first, the order given kept between equals (the grid's sort). */
export const bestMatchFirst = <T,>(items: T[]): T[] =>
  hasMatchScores(items)
    ? [...items].sort((a, b) => ((b as Scored).matchScore ?? 0) - ((a as Scored).matchScore ?? 0))
    : items;

/**
 * While letters are typed, a section's grid shows the best match first, its own
 * sort only between equals; a sort chosen then is kept until the letters go,
 * and the next ones show the best match again.
 */
export const useBestMatch = (searchText: string) => {
  const [on, setOn] = useState(true);
  const onRef = useRef(true);
  const choose = useCallback((value: boolean) => {
    onRef.current = value;
    setOn(value);
  }, []);
  useEffect(() => {
    if (!searchText.trim()) choose(true);
  }, [searchText, choose]);
  const order = useCallback(<T,>(items: T[]): T[] => (onRef.current ? bestMatchFirst(items) : items), []);
  return { on, choose, order };
};

/**
 * Stacks (a box set, a series) and single things, as a grid stacks them, the
 * best match first: a stack by its best member. Sorts in place, the order given
 * kept between equals.
 */
export const stacksMatchFirst = <I,>(
  items: I[],
  found: readonly { id: number; matchScore?: number }[],
  membersOf: (item: I) => { id: number }[],
): I[] => {
  if (!hasMatchScores(found)) return items;
  const scores = new Map(found.map(f => [f.id, f.matchScore ?? 0]));
  const scoreOf = (item: I) => Math.max(0, ...membersOf(item).map(m => scores.get(m.id) ?? 0));
  return items.sort((a, b) => scoreOf(b) - scoreOf(a));
};
