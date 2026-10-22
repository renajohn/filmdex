import { useEffect, useState } from 'react';

const NARROW = '(max-width: 575px)';

/** A phone's width, followed as the window turns or is resized. */
export const useNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW);
    if (!query) return undefined;
    const changed = () => setNarrow(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return narrow;
};

export default useNarrow;
