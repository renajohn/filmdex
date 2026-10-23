import { useEffect, useRef } from 'react';

/**
 * Opens an album's, a movie's or a book's card from outside its page: the
 * search's menu, which lives in the header, asks; the page showing that kind
 * of thing listens and opens it as a click on it would.
 */
export type OpenItemKind = 'album' | 'movie' | 'book';

const OPEN_ITEM_EVENT = 'dexvault:open-item';

export const openItem = (kind: OpenItemKind, id: number): void => {
  window.dispatchEvent(new CustomEvent(OPEN_ITEM_EVENT, { detail: { kind, id } }));
};

/** While the page is shown, opens what is asked of its kind. */
export const useOpenItem = (kind: OpenItemKind, open: (id: number) => void): void => {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: OpenItemKind; id: number }>).detail;
      if (detail?.kind === kind) latest.current(detail.id);
    };
    window.addEventListener(OPEN_ITEM_EVENT, listen);
    return () => window.removeEventListener(OPEN_ITEM_EVENT, listen);
  }, [kind]);
};
