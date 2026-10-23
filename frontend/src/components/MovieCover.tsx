import React from 'react';
import { BsCollectionFill } from 'react-icons/bs';
import MovieThumbnail from './MovieThumbnail';
import WarningBadges from './WarningBadges';
import ShelfCode from './shared/ShelfCode';
import CoverTag, { CoverTagStack } from './shared/CoverTag';
import { ageTooltip, scoreTooltip } from './movieTagTooltips';
import './MovieCover.css';

// As the API gives it: the grid's movies, Watch Next's, a box set's.
type Movie = any;

/** TMDB 40%, IMDb 35%, Rotten Tomatoes 25% (on 10), over those it has; null with none. */
export const combinedScore = (movie: Movie): number | null => {
  const ratings: { score: number; weight: number }[] = [];
  if (movie.tmdb_rating && movie.tmdb_rating !== 'N/A') ratings.push({ score: parseFloat(String(movie.tmdb_rating)), weight: 0.4 });
  if (movie.imdb_rating && movie.imdb_rating !== 'N/A') ratings.push({ score: parseFloat(String(movie.imdb_rating)), weight: 0.35 });
  if (movie.rotten_tomato_rating && movie.rotten_tomato_rating !== 'N/A') ratings.push({ score: parseFloat(String(movie.rotten_tomato_rating)) / 10, weight: 0.25 });
  if (ratings.length === 0) return null;
  const totalWeight = ratings.reduce((sum, rating) => sum + rating.weight, 0);
  return ratings.reduce((sum, rating) => sum + rating.score * rating.weight, 0) / totalWeight;
};

/** A score's colour, from red to green. */
export const ratingColor = (rating: number | string | null | undefined, maxRating = 10): string => {
  if (!rating || rating === 'N/A') return '#3a3a3a';
  const percentage = (parseFloat(String(rating)) / maxRating) * 100;
  if (percentage >= 80) return '#22c55e';
  if (percentage >= 70) return '#4ade80';
  if (percentage >= 60) return '#6ee7b7';
  if (percentage >= 50) return '#86efac';
  if (percentage >= 40) return '#a7f3d0';
  if (percentage >= 30) return '#fbbf24';
  if (percentage >= 20) return '#f59e0b';
  return '#ef4444';
};

const shortFormat = (format: string) =>
  format === 'Blu-ray 4K' ? '4K' :
  format === 'Blu-ray' ? 'BR' :
  format === 'DVD' ? 'DVD' :
  format === 'Digital' ? 'DIG' :
  format.substring(0, 3).toUpperCase();

/** A poster's tags, for a CoverTagStack: age, spiders and snakes, score, format, and its box set or collections. */
export const MovieCoverTags: React.FC<{ movie: Movie; collection?: boolean }> = ({ movie, collection = true }) => {
  const score = combinedScore(movie);
  const hasCollection = (movie.has_box_set && movie.box_set_name) || movie.collection_names?.length > 0;
  return (
    <>
      {movie.recommended_age != null && (
        <CoverTag className="age-badge-large" title={ageTooltip(movie)}>{movie.recommended_age}+</CoverTag>
      )}
      <WarningBadges movie={movie} />
      {score && (
        <CoverTag className="score-badge-large" title={scoreTooltip(movie)} style={{ color: ratingColor(score) }}>
          {score.toFixed(1)}
        </CoverTag>
      )}
      {movie.format && (
        <CoverTag variant="gold" className="format-badge-large" title={movie.format}>{shortFormat(movie.format)}</CoverTag>
      )}
      {collection && hasCollection && (
        <CoverTag className="collection-badge-large" title={
          movie.has_box_set && movie.box_set_name ? `${movie.box_set_name} box set` : movie.collection_names?.join(', ') || ''
        }>
          <BsCollectionFill size={14} />
        </CoverTag>
      )}
    </>
  );
};

interface MovieCoverProps {
  movie: Movie;
  /** Buttons laid on the poster: Watch Next's star in the grid. */
  children?: React.ReactNode;
}

/**
 * A movie's poster as the grid and Watch Next show it: its tags and its title
 * under the pointer of the card holding it (a `cover-host`), its shelf.
 */
const MovieCover: React.FC<MovieCoverProps> = ({ movie, children }) => {
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : movie.year;
  return (
    <div className="movie-poster-large">
      <MovieThumbnail
        imdbLink={movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}` : movie.imdb_link}
        title={movie.title}
        year={year}
        className="movie-thumbnail-large"
        disableZoom={true}
        posterPath={movie.poster_path}
        recommendedAge={null}
      />
      <div className="poster-overlay-large">
        <CoverTagStack className="poster-badges-left">
          <MovieCoverTags movie={movie} />
        </CoverTagStack>
        {children}
        <ShelfCode kind="movie" id={movie.id} />
        <div className="poster-title-overlay-large">
          <h4 className="poster-title-text">{movie.title}</h4>
          {year && <span className="poster-year-text">({year})</span>}
        </div>
      </div>
    </div>
  );
};

export default MovieCover;
