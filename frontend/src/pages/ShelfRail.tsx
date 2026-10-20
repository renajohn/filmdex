import React, { useEffect, useLayoutEffect, useState } from 'react';
import type { ShelvedItem } from '../services/shelvingService';

interface Props {
  /** The list the marks stand for. */
  list: React.RefObject<HTMLElement | null>;
  hits: ShelvedItem[];
  current: number;
  rowIdOf: (item: ShelvedItem) => string;
  onGo: (index: number) => void;
}

/**
 * The margin of a search, as in a code editor: each result a gold mark at its
 * height in the list, the one the list was taken to brighter, and a frame for
 * what the screen shows. A click on a mark goes there.
 */
const ShelfRail: React.FC<Props> = ({ list, hits, current, rowIdOf, onGo }) => {
  const [marks, setMarks] = useState<number[]>([]);
  const [view, setView] = useState({ top: 0, height: 100 });

  // Where each result stands in the list, as a share of its height: measured again as the list changes size.
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const measure = () => {
      const top = node.getBoundingClientRect().top;
      const height = node.offsetHeight || 1;
      setMarks(hits.map(item => {
        const row = document.getElementById(rowIdOf(item));
        return row ? ((row.getBoundingClientRect().top - top) / height) * 100 : 0;
      }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [list, hits, rowIdOf]);

  // The frame of what the screen shows.
  useEffect(() => {
    const follow = () => {
      const node = list.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const height = node.offsetHeight || 1;
      setView({ top: Math.max(0, (-rect.top / height) * 100), height: Math.min(100, (window.innerHeight / height) * 100) });
    };
    follow();
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
    };
  }, [list]);

  if (!hits.length) return null;
  return (
    <div className="shelf-rail" aria-hidden="true">
      <span className="shelf-rail-view" style={{ top: `${view.top}%`, height: `${view.height}%` }} />
      {marks.slice(0, hits.length).map((top, index) => (
        <span key={rowIdOf(hits[index])} className={`shelf-rail-mark ${index === current ? 'current' : ''}`}
          style={{ top: `${top}%` }} title={`${hits[index].sortName} · ${hits[index].title}`} onClick={() => onGo(index)} />
      ))}
    </div>
  );
};

export default ShelfRail;
