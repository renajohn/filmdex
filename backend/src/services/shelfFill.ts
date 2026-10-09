/**
 * How a section's objects fill its shelves, in order. Nothing here reads the
 * database, so the rules can be checked on their own.
 */

/** A shelf is filled to this share of what it holds, so an album bought later finds room without shifting the rest. */
export const FILL_RATIO = 0.85;

export interface FillShelf {
  id: number;
  capacity: number;
  locked: boolean;
  /** The order keys of the first and last object a locked shelf keeps. */
  lockedFrom: string | null;
  lockedThrough: string | null;
  /** The order key of the first object that found no room: it and those after it go on the next shelf. */
  breakBefore: string | null;
  /** Cases taken by what the owner put there by hand. */
  reserved?: number;
}

export interface FillItem {
  key: string;
  units: number;
}

/** How many cases an unlocked shelf takes before it is full: 12 Blu-ray make 10.2, room for 10 and a DVD's thickness to spare. */
export const usableCases = (capacity: number): number => Math.max(1, Math.round(capacity * FILL_RATIO * 10) / 10);

/**
 * Which shelf each object goes on, by index in `items` (sorted by key), and
 * how many found none. Each shelf takes the objects in turn until the next
 * would pass its usable room, or one it was told had no room comes up, or the
 * objects a locked shelf further on keeps begin. A locked shelf keeps every
 * object up to the last it held when locked, whatever its room: an album
 * bought since goes where its name puts it, beside the others. An object
 * wider than a whole shelf still gets an empty one, rather than none.
 */
export const fillShelves = (shelves: FillShelf[], items: FillItem[]): { shelfOf: Array<number | null>; overflow: number } => {
  const shelfOf: Array<number | null> = items.map(() => null);
  let next = 0;

  shelves.forEach((shelf, index) => {
    if (shelf.locked) {
      if (shelf.lockedThrough == null) return;
      while (next < items.length && items[next].key <= shelf.lockedThrough) shelfOf[next++] = shelf.id;
      return;
    }
    const lockedAhead = shelves.slice(index + 1).find(other => other.locked && other.lockedFrom != null);
    const room = usableCases(shelf.capacity) - (shelf.reserved || 0);
    let used = 0;
    while (next < items.length) {
      const item = items[next];
      if (lockedAhead && item.key >= lockedAhead.lockedFrom!) break;
      if (used > 0 && shelf.breakBefore != null && item.key >= shelf.breakBefore) break;
      if (used + item.units > room + 1e-9 && (used > 0 || (shelf.reserved || 0) > 0)) break;
      shelfOf[next++] = shelf.id;
      used += item.units;
    }
  });

  return { shelfOf, overflow: items.length - next };
};
