import React from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';
import { BsQuestion } from 'react-icons/bs';
import './WarningStrip.css';

type Status = 'with' | 'without' | 'unknown';

interface Props {
  movie: { spiders_status?: string; snakes_status?: string };
}

const TOPICS = [
  { key: 'spiders_status', name: 'Spiders', Icon: GiSpiderAlt },
  { key: 'snakes_status', name: 'Snakes', Icon: GiSnake },
] as const;

const statusOf = (value: string | undefined): Status =>
  value === 'with' || value === 'without' ? value : 'unknown';

/**
 * Always-visible spider and snake markers for a poster, meant for the place
 * where tonight's movie is picked. Nothing means safe; a present animal is
 * named and frames the poster; an unchecked movie gets a discreet "?".
 */
const WarningStrip: React.FC<Props> = ({ movie }) => {
  const shown = TOPICS
    .map(topic => ({ ...topic, status: statusOf(movie[topic.key]) }))
    .filter(topic => topic.status !== 'without');
  if (shown.length === 0) return null;

  return (
    <>
      {shown.some(t => t.status === 'with') && <div className="warning-strip__frame" aria-hidden="true" />}
      <div className="warning-strip">
        {shown.map(({ key, name, Icon, status }) =>
          status === 'with' ? (
            <span key={key} className="warning-strip__pill warning-strip__pill--with" title={name}>
              <Icon size={13} /> {name}
            </span>
          ) : (
            <span key={key} className="warning-strip__pill warning-strip__pill--unknown" title={`${name} not reported yet`}>
              <Icon size={12} />
              <BsQuestion size={14} />
            </span>
          )
        )}
      </div>
    </>
  );
};

export default WarningStrip;
