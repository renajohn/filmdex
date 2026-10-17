import React from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';
import CoverTag from './shared/CoverTag';

interface Props {
  movie: { spiders_status?: string; snakes_status?: string };
}

/** Only "with" earns a badge: the poster should flag danger, not reassure. */
const WarningBadges: React.FC<Props> = ({ movie }) => (
  <>
    {movie.spiders_status === 'with' && (
      <CoverTag variant="alert" className="warning-badge-large" title="Spiders"><GiSpiderAlt size={14} /></CoverTag>
    )}
    {movie.snakes_status === 'with' && (
      <CoverTag variant="alert" className="warning-badge-large" title="Snakes"><GiSnake size={14} /></CoverTag>
    )}
  </>
);

export default WarningBadges;
