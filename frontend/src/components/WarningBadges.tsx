import React from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';

interface Props {
  movie: { spiders_status?: string; snakes_status?: string };
}

/** Only "with" earns a badge: the poster should flag danger, not reassure. */
const WarningBadges: React.FC<Props> = ({ movie }) => (
  <>
    {movie.spiders_status === 'with' && (
      <span className="warning-badge-large" title="Spiders"><GiSpiderAlt size={14} /></span>
    )}
    {movie.snakes_status === 'with' && (
      <span className="warning-badge-large" title="Snakes"><GiSnake size={14} /></span>
    )}
  </>
);

export default WarningBadges;
