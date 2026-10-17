import React from 'react';
import { BsCheckCircleFill, BsExclamationCircleFill, BsExclamationTriangleFill, BsInfoCircle, BsX } from 'react-icons/bs';
import './notice.css';

/**
 * A word in a window or on a page (notice.css): dark glass, a stripe of its
 * tone on the left, its icon in that tone. info grey, a thing to know; success
 * a gold ✓, it is done; warning orange, to check or do again; danger red, it
 * did not work.
 */
export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export const noticeIcons: Record<NoticeTone, React.ReactNode> = {
  info: <BsInfoCircle />,
  success: <BsCheckCircleFill />,
  warning: <BsExclamationTriangleFill />,
  danger: <BsExclamationCircleFill />,
};

export interface NoticeProps {
  tone?: NoticeTone;
  /** A first line in bold, the words under it. */
  title?: React.ReactNode;
  /** A small button at its end: Retry, Back up now. */
  action?: React.ReactNode;
  /** A ✕ that puts it away. */
  onClose?: () => void;
  /** In place of the tone's own icon. */
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export const Notice: React.FC<NoticeProps> = ({ tone = 'info', title, action, onClose, icon, className, children }) => (
  <div
    className={['ui-notice', `ui-notice--${tone}`, className].filter(Boolean).join(' ')}
    // What did not work is said at once; the rest when the reader comes to it.
    role={tone === 'danger' ? 'alert' : 'status'}
  >
    <span className="ui-notice__icon" aria-hidden="true">{icon ?? noticeIcons[tone]}</span>
    <div className="ui-notice__words">
      {title && <div className="ui-notice__title">{title}</div>}
      {children}
    </div>
    {action && <div className="ui-notice__action">{action}</div>}
    {onClose && (
      <button type="button" className="ui-notice__close" aria-label="Close" onClick={onClose}><BsX /></button>
    )}
  </div>
);

export default Notice;
