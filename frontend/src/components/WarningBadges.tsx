import React from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';
import CoverTag from './shared/CoverTag';

type Topic = 'spiders' | 'snakes';
type Movie = Partial<Record<`${Topic}_status` | `${Topic}_override`, string | null>>
  & Partial<Record<`${Topic}_yes` | `${Topic}_no`, number | null>>;

interface Props {
  movie: Movie;
}

/** As the movie's card says it: "Spiders", then "With · 125 yes / 0 no", "(manual)" when set by hand. */
export const warningTooltip = (movie: Movie, topic: Topic): string => {
  const name = topic === 'spiders' ? 'Spiders' : 'Snakes';
  const manual = movie[`${topic}_override`] ? ' (manual)' : '';
  return `${name}\nWith${manual} · ${movie[`${topic}_yes`] ?? 0} yes / ${movie[`${topic}_no`] ?? 0} no`;
};

/** Only "with" earns a badge: the poster should flag danger, not reassure. */
const WarningBadges: React.FC<Props> = ({ movie }) => (
  <>
    {movie.spiders_status === 'with' && (
      <CoverTag variant="alert" className="warning-badge-large" title={warningTooltip(movie, 'spiders')}><GiSpiderAlt size={14} /></CoverTag>
    )}
    {movie.snakes_status === 'with' && (
      <CoverTag variant="alert" className="warning-badge-large" title={warningTooltip(movie, 'snakes')}><GiSnake size={14} /></CoverTag>
    )}
  </>
);

export default WarningBadges;
