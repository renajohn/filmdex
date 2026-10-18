import React, { useId, useState } from 'react';
import './star-rating.css';

/** Bootstrap Icons' star and star-fill, drawn here so that each half can take its own colour. */
const OUTLINE = 'M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z';
const FILL = 'M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z';

type Tone = 'given' | 'adding' | 'leaving' | null;

/**
 * The tone of one half star (1 to 10). Without the pointer, the stars given
 * are gold. Under it, the stars given stay gold, those a click would add are
 * white, those it would take away a pale gold: gold is what is on, never
 * what is pointed at.
 */
export const halfTone = (half: number, value: number, preview: number | null): Tone => {
  const given = value * 2;
  if (preview === null) return half <= given ? 'given' : null;
  const wanted = preview * 2;
  if (half <= Math.min(given, wanted)) return 'given';
  if (half > given && half <= wanted) return 'adding';
  if (half > wanted && half <= given) return 'leaving';
  return null;
};

const starsLabel = (stars: number) => (stars ? `${stars} star${stars > 1 ? 's' : ''}` : 'No stars');

export interface StarRatingProps {
  /** The stars given, 0.5 to 5 by halves; 0 or null for none. */
  value: number | null | undefined;
  /** The stars a click gives, 0 when it takes them away (a click on the stars already given). */
  onChange: (value: number) => void;
  /** sm 13 px (a list), md 16 px (a record's card), lg 20 px. */
  size?: 'sm' | 'md' | 'lg';
  /** What the stars rate, for screen readers. */
  label?: string;
  className?: string;
}

/**
 * The owner's stars on a record, by halves: the left half of a star gives the
 * half. Gold, flat, no glow (star-rating.css). The stars never take the focus:
 * the arrows go from one record to the next.
 */
const StarRating: React.FC<StarRatingProps> = ({ value, onChange, size = 'md', label = 'Your rating', className }) => {
  const [preview, setPreview] = useState<number | null>(null);
  // useId's colons or guillemets would break url(#…).
  const id = `stars${useId().replace(/[^\w-]/g, '')}`;
  const current = value || 0;

  const pointed = (event: React.MouseEvent<HTMLButtonElement>, star: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX - box.left < box.width / 2 ? star - 0.5 : star;
  };

  const half = (tone: Tone, star: number, right: boolean) => tone && (
    <>
      <clipPath id={`${id}${star}${right ? 'r' : 'l'}`}>
        <rect x={right ? 8 : -1} y={-1} width={9} height={18} />
      </clipPath>
      <path className={`ui-star__${tone}`} clipPath={`url(#${id}${star}${right ? 'r' : 'l'})`} d={FILL} />
    </>
  );

  return (
    <span
      className={['ui-stars', `ui-stars--${size}`, className].filter(Boolean).join(' ')}
      role="group"
      aria-label={`${label}: ${starsLabel(current)}`}
      onMouseLeave={() => setPreview(null)}
    >
      {[1, 2, 3, 4, 5].map(star => {
        const holds = current === star || current === star - 0.5;
        return (
          <button
            key={star}
            type="button"
            tabIndex={-1}
            className="ui-star"
            aria-label={starsLabel(star)}
            aria-pressed={holds}
            onMouseMove={event => setPreview(pointed(event, star))}
            onClick={event => {
              const stars = pointed(event, star);
              setPreview(null);
              onChange(stars === current ? 0 : stars);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path className="ui-star__empty" d={OUTLINE} />
              {half(halfTone(star * 2 - 1, current, preview), star, false)}
              {half(halfTone(star * 2, current, preview), star, true)}
            </svg>
          </button>
        );
      })}
    </span>
  );
};

export default StarRating;
