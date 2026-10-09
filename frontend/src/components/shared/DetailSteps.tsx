import React, { useEffect, type RefObject } from 'react';
import { BsChevronLeft, BsChevronRight } from 'react-icons/bs';
import './DetailSteps.css';

type Step = (() => void) | null | undefined;

/**
 * ← and → step through the page's items while their details are open,
 * unless a field is being typed in or something else has the keys (`paused`).
 */
export function useStepKeys(onPrevious: Step, onNext: Step, paused = false) {
  useEffect(() => {
    if ((!onPrevious && !onNext) || paused) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const step = e.key === 'ArrowLeft' ? onPrevious : e.key === 'ArrowRight' ? onNext : null;
      if (!step) return;
      e.preventDefault();
      step();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onPrevious, onNext, paused]);
}

/** How far a tap on ↑ or ↓ scrolls, and how fast a held one glides; Shift goes three times as far and fast. */
const ARROW_STEP = 120;
const GLIDE_SPEED = 1000; // px per second
const SHIFT_FACTOR = 3;

/**
 * ↑ ↓, Page Up/Down, Home and End scroll the open details right away. The
 * browser scrolls only what holds the focus, and on opening that is the
 * dialog's frame, not the part that scrolls: without this, the keys did
 * nothing until a click inside. The browser's own step was short too, so
 * these keys always scroll by this hook's steps, wherever the focus is.
 *
 * A held arrow glides at a steady speed, frame by frame, until it is let go.
 * Answering each of the key's repeats with a smooth step instead had every
 * step cut the last one short, and the scrolling stuttered.
 */
export function useScrollKeys(scroller: RefObject<HTMLElement | null>, paused = false) {
  useEffect(() => {
    if (paused) return;
    let direction = 0;
    let fast = false;
    let frame = 0;
    let last = 0;

    const glide = (now: number) => {
      const element = scroller.current;
      if (!direction || !element) {
        frame = 0;
        return;
      }
      // A frame late after a hiccup must not jump.
      const seconds = Math.min(now - last, 50) / 1000;
      last = now;
      element.scrollTop += direction * GLIDE_SPEED * (fast ? SHIFT_FACTOR : 1) * seconds;
      frame = requestAnimationFrame(glide);
    };

    const stop = () => {
      direction = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        fast = true;
        return;
      }
      const element = scroller.current;
      if (!element || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        fast = e.shiftKey;
        const way = e.key === 'ArrowDown' ? 1 : -1;
        if (!e.repeat) {
          stop();
          element.scrollBy({ top: way * ARROW_STEP * (fast ? SHIFT_FACTOR : 1), behavior: 'smooth' });
        } else if (direction !== way) {
          direction = way;
          last = performance.now();
          if (!frame) frame = requestAnimationFrame(glide);
        }
        return;
      }

      const page = element.clientHeight * 0.9;
      const moves: Record<string, () => void> = {
        PageDown: () => element.scrollBy({ top: page, behavior: 'smooth' }),
        PageUp: () => element.scrollBy({ top: -page, behavior: 'smooth' }),
        End: () => element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }),
        Home: () => element.scrollTo({ top: 0, behavior: 'smooth' }),
      };
      const move = moves[e.key];
      if (!move) return;
      e.preventDefault();
      stop();
      move();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') fast = false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') stop();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stop);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stop);
      stop();
    };
  }, [scroller, paused]);
}

interface DetailStepsProps {
  onPrevious: Step;
  onNext: Step;
  /** What is stepped through, for the buttons' names: "album", "movie", "book". */
  noun: string;
  className?: string;
}

/** ‹ › to the item before or after on the page; nothing when the item is not on it. */
const DetailSteps: React.FC<DetailStepsProps> = ({ onPrevious, onNext, noun, className }) => {
  if (!onPrevious && !onNext) return null;
  return (
    <div className={`detail-steps${className ? ` ${className}` : ''}`}>
      <button type="button" className="detail-step" onClick={() => onPrevious?.()} disabled={!onPrevious}
        aria-label={`Previous ${noun}`} title={`Previous ${noun} (←)`}>
        <BsChevronLeft />
      </button>
      <button type="button" className="detail-step" onClick={() => onNext?.()} disabled={!onNext}
        aria-label={`Next ${noun}`} title={`Next ${noun} (→)`}>
        <BsChevronRight />
      </button>
    </div>
  );
};

export default DetailSteps;
