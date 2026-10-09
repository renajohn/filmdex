import { useCallback, useEffect, useRef } from 'react';

export type Id = number | string;

/** The entry for `id` among a page's lists, the first that has it. */
export function findById<T extends { id: Id }>(id: Id, ...lists: T[][]): T | undefined {
  for (const list of lists) {
    const found = list.find(item => String(item.id) === String(id));
    if (found) return found;
  }
  return undefined;
}

/** The ids either side of `id`, in the order a page shows them; none when it is not shown there. */
export function adjacent(ids: Id[], id: Id | null | undefined): { previous: Id | null; next: Id | null } {
  const at = id == null ? -1 : ids.findIndex(other => String(other) === String(id));
  if (at < 0) return { previous: null, next: null };
  return {
    previous: at > 0 ? ids[at - 1] : null,
    next: at < ids.length - 1 ? ids[at + 1] : null,
  };
}

/**
 * The ids of the items a page shows under `root`, in the order they appear on
 * screen: what a grid lays out, groups and stacks included, without having to
 * rebuild its order. Hidden items, such as a closed stack's, are left out.
 */
export function shownIds(root: ParentNode | null | undefined): Id[] {
  if (!root) return [];
  const ids: Id[] = [];
  root.querySelectorAll<HTMLElement>('[data-item-id]').forEach(element => {
    const id = element.dataset.itemId;
    if (id && element.getClientRects().length > 0 && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

interface StepOptions<T> {
  /** The images the details show for an item, fetched along with it ahead of time. */
  imagesOf?: (item: T) => Array<string | null | undefined>;
  /** What the page already knows of an item, its list entry, shown at once while its details load. */
  summaryOf?: (id: Id) => T | null | undefined;
}

/** How long the details must stay on an item before its neighbours are fetched, so a held arrow does not fetch every item it passes. */
const SETTLE_MS = 150;

/**
 * Steps an open item's details to the one before or after it on the page,
 * and never makes a step wait on the server: the item shows at once from
 * what is already at hand, its neighbours' details fetched ahead or else its
 * list entry, and its full details replace that as they come. Only the last
 * step asked for lands, so holding an arrow down never leaves the details on
 * an item fetched late.
 *
 * Waiting for the details instead, the card kept the last item, its large
 * poster and backdrop with it, on screen until the new one arrived. The item
 * on show is dropped from what is kept ahead, so coming back to it after an
 * edit fetches it afresh.
 */
export function useDetailSteps<T>(
  ids: Id[],
  currentId: Id | null | undefined,
  load: (id: Id) => Promise<T>,
  show: (item: T) => void,
  { imagesOf, summaryOf }: StepOptions<T> = {},
) {
  const latest = useRef(0);
  const ahead = useRef(new Map<string, Promise<T>>());
  const ready = useRef(new Map<string, T>());
  const { previous, next } = adjacent(ids, currentId);

  // Held in refs, so passing new functions on each render does not refetch.
  const loadRef = useRef(load);
  const imagesRef = useRef(imagesOf);
  const summaryRef = useRef(summaryOf);
  loadRef.current = load;
  imagesRef.current = imagesOf;
  summaryRef.current = summaryOf;

  useEffect(() => {
    const wanted = [previous, next].filter((id): id is Id => id != null).map(String);
    for (const id of [...ahead.current.keys()]) {
      if (!wanted.includes(id)) {
        ahead.current.delete(id);
        ready.current.delete(id);
      }
    }
    const settle = setTimeout(() => {
      for (const id of wanted) {
        if (ahead.current.has(id)) continue;
        const item = loadRef.current(id);
        ahead.current.set(id, item);
        item.then(loaded => {
          if (ahead.current.get(id) === item) ready.current.set(id, loaded);
          for (const url of imagesRef.current?.(loaded) || []) {
            if (url) new Image().src = url;
          }
        }, () => ahead.current.delete(id));
      }
    }, SETTLE_MS);
    return () => clearTimeout(settle);
  }, [previous, next, currentId]);

  const go = useCallback(async (id: Id) => {
    const request = ++latest.current;
    const key = String(id);
    const fetched = ready.current.get(key);
    if (fetched) {
      show(fetched);
      return;
    }
    const summary = summaryRef.current?.(id);
    if (summary) show(summary);
    try {
      const item = await (ahead.current.get(key) ?? loadRef.current(id));
      if (request === latest.current) show(item);
    } catch (e) {
      console.error('Failed to load details:', e);
    }
  }, [show]);

  return {
    onPrevious: previous == null ? null : () => go(previous),
    onNext: next == null ? null : () => go(next),
  };
}
