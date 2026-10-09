import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { BsArrowRightCircle, BsBookshelf, BsDashCircle, BsPlusCircle } from 'react-icons/bs';
import { markMovesDone, refreshShelfLocations, useShelfMoves, type ShelfMove } from '../../utils/shelfLocations';
import './ShelfMovesNotice.css';

/** Asked again this often while the page is in view, for a film added from elsewhere. */
const POLL_MS = 60 * 1000;

/** New on the shelves, moved along them, or taken off them for want of room. */
const iconOf = (move: ShelfMove): React.ReactNode => {
  if (move.from == null) return <BsPlusCircle className="shelf-moves-icon put" aria-hidden="true" />;
  if (move.to == null) return <BsDashCircle className="shelf-moves-icon off" aria-hidden="true" />;
  return <BsArrowRightCircle className="shelf-moves-icon move" aria-hidden="true" />;
};

const whatToDo = (move: ShelfMove): string => {
  if (move.to == null) return `Take off ${move.from}: no shelf has room for it`;
  // A film moved on keeps its place among the others; a new one needs telling where it slips in.
  if (move.from == null) return `Put on ${move.to}${move.after ? `, after ${move.after}` : move.before ? `, before ${move.before}` : ''}`;
  return `Move from ${move.from} to ${move.to}`;
};

/**
 * What to move on the real shelves since they were last put in order: a film
 * added pushes those after it on to the next shelf. Stays until the owner says
 * the moves are done.
 */
const ShelfMovesNotice: React.FC = () => {
  const moves = useShelfMoves();
  const { pathname } = useLocation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { refreshShelfLocations(); }, [pathname]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') refreshShelfLocations(); };
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (moves.length === 0) return null;

  const done = async () => {
    setSaving(true);
    setError(null);
    try {
      await markMovesDone(moves);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="shelf-moves" role="status" aria-label="Shelves to rearrange">
      <div className="shelf-moves-head">
        <BsBookshelf aria-hidden="true" />
        <strong>{moves.length === 1 ? '1 thing to move' : `${moves.length} things to move`} on the shelves</strong>
      </div>
      <ul className="shelf-moves-list">
        {moves.map(move => (
          <li key={`${move.kind}:${move.id}`}>
            {iconOf(move)}
            <span><span className="shelf-moves-title">{move.title}</span>: {whatToDo(move)}</span>
          </li>
        ))}
      </ul>
      {error && <div className="shelf-moves-error">{error}</div>}
      <Button size="sm" variant="warning" onClick={done} disabled={saving}>Done, dismiss</Button>
    </aside>
  );
};

export default ShelfMovesNotice;
