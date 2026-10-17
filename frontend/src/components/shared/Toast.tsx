import React, { useEffect, useRef, useState } from 'react';
import { BsX } from 'react-icons/bs';
import { noticeIcons, NoticeTone } from './Notice';
import './notice.css';

/**
 * A word that passes (notice.css): at the bottom, above the player, in the
 * menus' glass, gone by itself after a few seconds, held while pointed at.
 * toast() says it; the ToastHost mounted once in the app shows it.
 */
export interface ToastOptions {
  tone?: NoticeTone;
  /** How long it stays, in ms: 6 s by default. */
  duration?: number;
  /** One thing to do about it, in gold: Undo. */
  action?: { label: string; onClick: () => void };
}

interface Shown extends ToastOptions {
  id: number;
  message: React.ReactNode;
}

// The latest three at most, the oldest first.
const MOST = 3;
let shown: Shown[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach(listener => listener());

export const toast = (message: React.ReactNode, options: ToastOptions = {}): number => {
  const id = nextId++;
  shown = [...shown, { ...options, id, message }].slice(-MOST);
  tell();
  return id;
};

export const dismissToast = (id: number) => {
  shown = shown.filter(t => t.id !== id);
  tell();
};

/** For the tests: none left from the one before. */
export const resetToasts = () => { shown = []; tell(); };

/** The old alert's types ('success', 'danger', 'warning', 'info', 'error') as a tone. */
export const toneOf = (type: string | undefined): NoticeTone =>
  type === 'success' || type === 'warning' || type === 'info' ? type : type === 'danger' || type === 'error' ? 'danger' : 'info';

const LEAVE_MS = 200;

const ToastItem: React.FC<{ toast: Shown }> = ({ toast: t }) => {
  const tone = t.tone ?? 'info';
  const duration = t.duration ?? 6000;
  const [leaving, setLeaving] = useState(false);
  const left = useRef(duration);
  const since = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const leave = () => {
    clearTimeout(timer.current);
    setLeaving(true);
    timer.current = setTimeout(() => dismissToast(t.id), LEAVE_MS);
  };
  const run = () => {
    since.current = Date.now();
    timer.current = setTimeout(leave, left.current);
  };
  const hold = () => {
    if (leaving) return;
    clearTimeout(timer.current);
    left.current = Math.max(0, left.current - (Date.now() - since.current));
  };

  useEffect(() => {
    run();
    return () => clearTimeout(timer.current);
    // Once, when it comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`ui-toast ui-toast--${tone}${leaving ? ' ui-toast--leaving' : ''}`}
      role={tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={hold}
      onMouseLeave={() => { if (!leaving) run(); }}
    >
      <span className="ui-notice__icon" aria-hidden="true">{noticeIcons[tone]}</span>
      <div className="ui-toast__words">{t.message}</div>
      {t.action && (
        <button type="button" className="ui-toast__action" onClick={() => { t.action!.onClick(); leave(); }}>
          {t.action.label}
        </button>
      )}
      <button type="button" className="ui-toast__close" aria-label="Close" onClick={leave}><BsX /></button>
      <span className="ui-toast__time" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
};

/** The toasts toast() says, once in the app. */
export const ToastHost: React.FC = () => {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw(n => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  if (shown.length === 0) return null;
  return (
    <div className="ui-toasts">
      {shown.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
};

export default toast;
