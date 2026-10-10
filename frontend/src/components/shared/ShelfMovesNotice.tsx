import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { BsArrowCounterclockwise, BsBookshelf, BsDashLg } from 'react-icons/bs';
import { markMovesDone, markMovesUndone, refreshShelfLocations, shelvesChanged, useShelfMoves, type ShelfMove } from '../../utils/shelfLocations';
import shelvingService, { type LevelState, type ShelfLine } from '../../services/shelvingService';
import './ShelfMovesNotice.css';

/** Asked again this often while the page is in view, for a film added from elsewhere. */
const POLL_MS = 60 * 1000;

/** How many moves there were when the owner put them off for later, kept across visits. */
const LATER_KEY = 'shelfMovesLater';

const readLater = (): number | null => {
  try {
    const value = window.localStorage.getItem(LATER_KEY);
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
};

const saveLater = (count: number | null) => {
  try {
    if (count == null) window.localStorage.removeItem(LATER_KEY);
    else window.localStorage.setItem(LATER_KEY, String(count));
  } catch {
    // Without storage it stays put off until the page reloads.
  }
};

/** Where a film goes among the others on its shelf. */
const placeOf = (move: ShelfMove): string =>
  move.after ? `after ${move.after}` : move.before ? `first, before ${move.before}` : '';

const names = (titles: string[]): string =>
  titles.length <= 1 ? titles.join('') : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;

/** A step taken, and how to take it back. */
interface Taken {
  levels: LevelState[] | null;
  done: ShelfMove[];
  /** How many were off the shelf when it was answered, to come back to that question. */
  off: number;
}

/**
 * What to do on the real shelves since they were last put in order, one
 * shelf at a time: put what arrives on it, and if it does not fit, take its
 * last ones off for the next shelf until it does. The answers are what the
 * shelves really hold, so the plan follows them.
 */
const ShelfMovesNotice: React.FC = () => {
  const moves = useShelfMoves();
  const { pathname } = useLocation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Put off for later: folded down to a button in the corner. */
  const [later, setLater] = useState<number | null>(readLater);
  /** How many of the shelf's last ones come off it to make room: what the plan says, until the owner says otherwise. */
  const [off, setOff] = useState(0);
  /** The count to show again when an answer is taken back, rather than the plan's. */
  const restoring = useRef<number | null>(null);
  const [line, setLine] = useState<ShelfLine | null>(null);
  const [taken, setTaken] = useState<Taken[]>([]);

  const step = moves[0];
  const levelId = step?.to != null ? step.toLevelId ?? null : null;
  const arriving = levelId != null ? moves.filter(move => move.toLevelId === levelId) : step ? [step] : [];
  const listed = moves.map(move => `${move.kind}:${move.id}:${move.to}`).join(',');

  const putOff = (count: number | null) => {
    setLater(count);
    saveLater(count);
  };

  // Something new to move opens the list again.
  useEffect(() => {
    if (later != null && moves.length > later) putOff(null);
  }, [moves.length, later]);

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

  // The shelf being filled, as it stands with what arrives on it.
  useEffect(() => {
    setLine(null);
    if (levelId == null) return;
    let current = true;
    shelvingService.line(levelId).then(found => {
      if (!current) return;
      // The plan's guess: the last ones on the shelf that it sends on to the next.
      const leaving = new Set(moves.filter(move => move.from === found.code && move.to !== found.code).map(move => `${move.kind}:${move.id}`));
      let guess = 0;
      while (guess < found.items.length - 1 && leaving.has(`${found.items[found.items.length - 1 - guess].kind}:${found.items[found.items.length - 1 - guess].id}`)) guess += 1;
      setOff(restoring.current ?? guess);
      restoring.current = null;
      setLine(found);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [levelId, listed]);

  if (moves.length === 0 && taken.length === 0) return null;

  if (later != null && moves.length > 0) {
    return (
      <button type="button" className="shelf-moves-folded" onClick={() => putOff(null)} title="Show what to move on the shelves">
        <BsBookshelf aria-hidden="true" />
        <span>Shelves to tidy</span>
      </button>
    );
  }

  /** Does something on the shelves, then reads again what is left to do. */
  const act = async (work: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await work();
      await refreshShelfLocations();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // The last ones on the shelf, taken off to make room; what arrives may be among them.
  const takenOff = line ? line.items.slice(line.items.length - off) : [];
  const isOff = (move: ShelfMove) => off > 0 && takenOff.some(item => item.kind === move.kind && item.id === move.id);

  /** It fits: the shelf holds what is on it now, and the ones taken off go on to the next. */
  const fits = () => act(async () => {
    const levels = levelId != null ? await shelvingService.levelsState() : null;
    if (levelId != null) {
      await shelvingService.takeOff(levelId, off);
      shelvesChanged();
    }
    const done = arriving.filter(move => !isOff(move));
    if (done.length > 0) await markMovesDone(done);
    setTaken(steps => [...steps, { levels, done, off }]);
    setOff(0);
  });

  /** Back one step: the last answer taken back. */
  const back = () => {
    const last = taken[taken.length - 1];
    if (!last) return;
    act(async () => {
      // Read when the shelf is read again, as soon as the moves are listed back.
      restoring.current = last.off;
      if (last.levels) {
        await shelvingService.restoreLevels(last.levels);
        shelvesChanged();
      }
      if (last.done.length > 0) await markMovesUndone(last.done);
      setTaken(steps => steps.slice(0, -1));
    });
  };

  const doneWithAll = () => act(async () => {
    await markMovesDone(moves);
    setTaken(steps => [...steps, { levels: null, done: moves, off: 0 }]);
    setOff(0);
  });

  // All done: the last answer can still be taken back until closed.
  if (!step) {
    return (
      <aside className="shelf-moves" role="status" aria-label="Shelves to rearrange">
        <div className="shelf-moves-head">
          <BsBookshelf aria-hidden="true" />
          <strong>The shelves are tidy</strong>
        </div>
        {error && <div className="shelf-moves-error">{error}</div>}
        <div className="shelf-moves-foot">
          <button type="button" className="shelf-moves-link" onClick={back} disabled={saving}>
            <BsArrowCounterclockwise aria-hidden="true" /> Back
          </button>
          <button type="button" className="shelf-moves-link" onClick={() => setTaken([])}>Close</button>
        </div>
      </aside>
    );
  }

  const where = line?.code ?? step.to;
  // The shelf's last few, to tap: one taps where the ones coming off begin.
  const shown = line ? line.items.slice(Math.max(1, line.items.length - Math.max(3, off + 1))) : [];
  const nextShelf = moves.find(move => move.from === where && move.to !== where)?.to;
  const tap = (index: number) => {
    const fromEnd = line!.items.length - index;
    setOff(fromEnd === off ? off - 1 : fromEnd);
  };

  const instructions = (() => {
    if (step.to == null) return <p>Take <strong>{step.title}</strong> off {step.from}: no shelf has room for it.</p>;
    if (levelId == null) return <p>Put <strong>{step.title}</strong> in {step.to}.</p>;
    return (
      <>
        <ul className="shelf-moves-put">
          {arriving.map(move => (
            <li key={`${move.kind}:${move.id}`} className={isOff(move) ? 'is-off' : undefined}>
              <strong>{move.title}</strong>
              {move.from ? ` from ${move.from}` : ' (new)'}
              {placeOf(move) && `, ${placeOf(move)}`}
            </li>
          ))}
        </ul>
        {line && line.items.length > 1 && (
          <div className="shelf-moves-off">
            <p>{off === 0 ? 'Nothing comes off.' : `Take off for ${nextShelf ?? 'the next shelf'}:`}</p>
            <div className="shelf-moves-chips">
              {shown.map(item => {
                const index = line.items.indexOf(item);
                const leaving = index >= line.items.length - off;
                return (
                  <button key={`${item.kind}:${item.id}`} type="button" aria-pressed={leaving} disabled={saving}
                    className={leaving ? 'is-leaving' : undefined} onClick={() => tap(index)}>
                    {item.title}
                  </button>
                );
              })}
            </div>
            <p className="shelf-moves-hint">Tap a film to change how many come off.</p>
          </div>
        )}
      </>
    );
  })();

  return (
    <aside className="shelf-moves" role="status" aria-label="Shelves to rearrange">
      <div className="shelf-moves-head">
        <BsBookshelf aria-hidden="true" />
        <strong>{step.to == null || levelId == null ? 'Shelves to tidy' : `Put on ${where}`}</strong>
        <span className="shelf-moves-left">{moves.length} to move in all</span>
      </div>
      {instructions}
      {error && <div className="shelf-moves-error">{error}</div>}
      {levelId != null ? (
        <div className="shelf-moves-ask">
          <Button size="sm" variant="warning" onClick={fits} disabled={saving || line == null}>Done</Button>
        </div>
      ) : (
        <div className="shelf-moves-ask">
          <Button size="sm" variant="warning" onClick={fits} disabled={saving}>Done</Button>
        </div>
      )}
      <div className="shelf-moves-foot">
        <button type="button" className="shelf-moves-link" onClick={back} disabled={saving || taken.length === 0}>
          <BsArrowCounterclockwise aria-hidden="true" /> Back
        </button>
        <button type="button" className="shelf-moves-link" onClick={doneWithAll} disabled={saving}
          title="The shelves already stand as DexVault has them">
          All done already
        </button>
        <button type="button" className="shelf-moves-link" onClick={() => putOff(moves.length)}
          title="Put it away until you have time to tidy the shelves">
          <BsDashLg aria-hidden="true" /> Later
        </button>
      </div>
    </aside>
  );
};

export default ShelfMovesNotice;
