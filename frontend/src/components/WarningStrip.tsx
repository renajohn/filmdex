import React from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';
import { BsCheck, BsQuestion } from 'react-icons/bs';
import './WarningStrip.css';

type Status = 'with' | 'without' | 'unknown';

interface Props {
  movie: { spiders_status?: string; snakes_status?: string };
}

const TOPICS = [
  { key: 'spiders_status', name: 'Spiders', none: 'No spiders', Icon: GiSpiderAlt },
  { key: 'snakes_status', name: 'Snakes', none: 'No snakes', Icon: GiSnake },
] as const;

const statusOf = (value: string | undefined): Status =>
  value === 'with' || value === 'without' ? value : 'unknown';

/**
 * Always-visible spider and snake markers for a poster, meant for the place
 * where tonight's movie is picked: a present animal is spelled out in red and
 * frames the poster, so it cannot be missed even at thumbnail size.
 */
const WarningStrip: React.FC<Props> = ({ movie }) => {
  const statuses = TOPICS.map(topic => ({ ...topic, status: statusOf(movie[topic.key]) }));
  const anyPresent = statuses.some(t => t.status === 'with');

  return (
    <>
      {anyPresent && <div className="warning-strip__frame" aria-hidden="true" />}
      <div className="warning-strip">
        {statuses.map(({ key, name, none, Icon, status }) => {
          if (status === 'with') {
            return (
              <span key={key} className="warning-strip__pill warning-strip__pill--with" title={name}>
                <Icon size={16} /> {name}
              </span>
            );
          }
          const title = status === 'without' ? none : `${name} not reported yet`;
          return (
            <span key={key} className={`warning-strip__pill warning-strip__pill--${status}`} title={title}>
              <Icon size={12} />
              {status === 'without' ? <BsCheck size={14} /> : <BsQuestion size={14} />}
            </span>
          );
        })}
      </div>
    </>
  );
};

export default WarningStrip;
