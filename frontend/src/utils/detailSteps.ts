import { useCallback, useRef } from 'react';

export type Id = number | string;

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

/**
 * Steps an open item's details to the one before or after it on the page.
 * Only the last step asked for lands, so holding an arrow down never leaves
 * the details on an item fetched late.
 */
export function useDetailSteps<T>(
  ids: Id[],
  currentId: Id | null | undefined,
  load: (id: Id) => Promise<T>,
  show: (item: T) => void,
) {
  const latest = useRef(0);
  const go = useCallback(async (id: Id) => {
    const request = ++latest.current;
    try {
      const item = await load(id);
      if (request === latest.current) show(item);
    } catch (e) {
      console.error('Failed to load details:', e);
    }
  }, [load, show]);

  const { previous, next } = adjacent(ids, currentId);
  return {
    onPrevious: previous == null ? null : () => go(previous),
    onNext: next == null ? null : () => go(next),
  };
}
