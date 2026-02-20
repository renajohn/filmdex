import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';
import './MovieForm.css';

interface MovieData {
  id?: number | string;
  title?: string;
  original_title?: string;
  original_language?: string;
  genre?: string;
  director?: string;
  cast?: string | string[];
  release_date?: string;
  format?: string;
  imdb_rating?: string | number;
  rotten_tomato_rating?: string | number;
  rotten_tomatoes_link?: string;
  imdb_id?: string;
  tmdb_id?: string | number;
  tmdb_rating?: string | number;
  price?: string | number;
  runtime?: string | number;
  plot?: string;
  comments?: string;
  never_seen?: boolean;
  acquired_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  budget?: number;
  revenue?: number;
  trailer_key?: string;
  trailer_site?: string;
  status?: string;
  popularity?: number;
  vote_count?: number;
  adult?: boolean;
  video?: boolean;
  media_type?: string;
  [key: string]: unknown;
}

interface FormData {
  title: string;
  original_title: string;
  original_language: string;
  genre: string;
  director: string;
  cast: string;
  release_date: string;
  format: string;
  imdb_rating: string;
  rotten_tomato_rating: string;
  rotten_tomatoes_link: string;
  imdb_id: string;
  tmdb_id: string;
  tmdb_rating: string;
  price: string;
  runtime: string;
  plot: string;
  comments: string;
  never_seen: boolean;
  acquired_date: string;
}

interface MovieFormProps {
  movie?: MovieData | null;
  prefilledData?: MovieData | null;
  onSave: () => void;
  onCancel: () => void;
}

const MovieForm: React.FC<MovieFormProps> = ({ movie = null, prefilledData = null, onSave, onCancel }) => {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    original_title: '',
    original_language: '',
    genre: '',
    director: '',
    cast: '',
    release_date: '',
    format: '',
    imdb_rating: '',
    rotten_tomato_rating: '',
    rotten_tomatoes_link: '',
    imdb_id: '',
    tmdb_id: '',
    tmdb_rating: '',
    price: '',
    runtime: '',
    plot: '',
    comments: '',
    never_seen: false,
    acquired_date: new Date().toISOString().split('T')[0]
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [hasAutoFetched, setHasAutoFetched] = useState<boolean>(false);

  useEffect(() => {
    const dataToUse = movie || prefilledData;
    if (dataToUse) {
      // Reset auto-fetch flag when new data comes in
      setHasAutoFetched(false);

      // Format acquired_date for HTML date input (YYYY-MM-DD)
      let formattedDate = new Date().toISOString().split('T')[0]; // Default to today
      if (dataToUse.acquired_date) {
        try {
          // Handle various date formats
          const date = new Date(dataToUse.acquired_date);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toISOString().split('T')[0];
          }
        } catch (error) {
          console.warn('Error formatting acquired_date:', error);
        }
      }

      // Pre-populate form for editing or new movie with pre-filled data
      setFormData({
        title: (dataToUse.title as string) || '',
        original_title: (dataToUse.original_title as string) || '',
        original_language: (dataToUse.original_language as string) || '',
        genre: (dataToUse.genre as string) || '',
        director: (dataToUse.director as string) || '',
        cast: Array.isArray(dataToUse.cast) ? dataToUse.cast.join(', ') : (dataToUse.cast as string) || '',
        release_date: (dataToUse.release_date as string) || '',
        format: (dataToUse.format as string) || '',
        imdb_rating: String(dataToUse.imdb_rating || ''),
        rotten_tomato_rating: String(dataToUse.rotten_tomato_rating || ''),
        rotten_tomatoes_link: (dataToUse.rotten_tomatoes_link as string) || constructRottenTomatoesLink(dataToUse.title, dataToUse.release_date),
        imdb_id: (dataToUse.imdb_id as string) || '',
        tmdb_id: String(dataToUse.tmdb_id || ''),
        tmdb_rating: String(dataToUse.tmdb_rating || ''),
        price: String(dataToUse.price || ''),
        runtime: String(dataToUse.runtime || ''),
        plot: (dataToUse.plot as string) || '',
        comments: (dataToUse.comments as string) || '',
        never_seen: (dataToUse.never_seen as boolean) || false,
        acquired_date: formattedDate
      });
    }
  }, [movie, prefilledData]);

  // Helper function to construct Rotten Tomatoes link
  const constructRottenTomatoesLink = useCallback((title?: string, releaseDate?: string): string => {
    if (!title) return '';

    // Convert title to Rotten Tomatoes URL format
    let urlTitle = title
      .toLowerCase()
      .replace(/^the\s+/, '') // Remove "the" from the beginning
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters but keep hyphens
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/-/g, '_') // Replace hyphens with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

    return `https://www.rottentomatoes.com/m/${urlTitle}`;
  }, []);

  // Internal auto-fetch function that can be called from useEffect
  const autoFetchData = useCallback(async (title: string) => {
    if (!title?.trim()) {
      return;
    }

    // Only auto-fetch from local database when editing an existing movie
    if (!movie) {
      console.log('Skipping auto-fetch for new movie - will fetch from TMDB on submit');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Search local database for the movie
      const localResults = await apiService.searchMovies({ searchText: title }) as MovieData[];

      if (!localResults || localResults.length === 0) {
        console.warn('No movies found in local database for:', title);
        return;
      }

      // Use the first result (most relevant)
      const localMovie = localResults[0];

      // Get detailed local data including cast and crew
      const movieId = localMovie.id as string | number;
      const [movieDetails, cast, crew] = await Promise.all([
        apiService.getMovieDetails(movieId),
        apiService.getMovieCast(movieId),
        apiService.getMovieCrew(movieId)
      ]) as [MovieData, Array<{ name: string; job?: string }>, Array<{ name: string; job: string }>];

      // Extract director from crew
      const director = crew?.find((person: { job: string }) => person.job === 'Director')?.name || '';

      // Extract cast (first 5 actors)
      const castNames = cast?.slice(0, 5).map((actor: { name: string }) => actor.name).join(', ') || '';

      // Combine data from local sources
      const combinedData: Partial<FormData> = {
        title: (movieDetails.title as string) || title,
        original_title: (movieDetails.original_title as string) || '',
        original_language: (movieDetails.original_language as string) || '',
        release_date: (movieDetails.release_date as string) || '',
        genre: (movieDetails.genre as string) || '',
        director: director || '',
        cast: castNames || '',
        runtime: String(movieDetails.runtime || ''),
        plot: (movieDetails.plot as string) || '',
        imdb_rating: String(movieDetails.imdb_rating || ''),
        rotten_tomato_rating: String(movieDetails.rotten_tomato_rating || ''),
        rotten_tomatoes_link: (movieDetails.rotten_tomatoes_link as string) || constructRottenTomatoesLink(movieDetails.title as string, movieDetails.release_date as string),
        tmdb_rating: String(movieDetails.tmdb_rating || ''),
        tmdb_id: String(movieDetails.tmdb_id || ''),
        imdb_id: (movieDetails.imdb_id as string) || ''
      };

      setFormData(prev => ({
        ...prev,
        ...combinedData
      }));

    } catch (err) {
      console.error('Error auto-fetching movie data:', err);
      setError('Could not fetch movie data from local database');
    } finally {
      setLoading(false);
    }
  }, [movie, constructRottenTomatoesLink]);

  // Auto-fetch data when form loads with a title (but not when editing existing movie)
  useEffect(() => {
    const dataToUse = movie || prefilledData;
    // Only auto-fetch if we have a title, we're not editing an existing movie, and we haven't already auto-fetched
    if (dataToUse?.title && !movie && !hasAutoFetched) {
      setHasAutoFetched(true);
      // Call the auto-fetch logic directly here to avoid dependency issues
      autoFetchData(dataToUse.title as string);
    }
  }, [movie, prefilledData, hasAutoFetched, autoFetchData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Client-side validation
    if (!formData.title.trim()) {
      setError('Title is required');
      setLoading(false);
      return;
    }

    try {
      if (movie) {
        // Update existing movie - preserve existing TMDB data while updating editable fields
        const editableData = {
          // Preserve existing TMDB data
          original_title: movie.original_title,
          original_language: movie.original_language,
          genre: movie.genre,
          director: movie.director,
          cast: movie.cast,
          release_date: movie.release_date,
          imdb_rating: movie.imdb_rating,
          rotten_tomato_rating: movie.rotten_tomato_rating,
          rotten_tomatoes_link: movie.rotten_tomatoes_link,
          tmdb_rating: movie.tmdb_rating,
          tmdb_id: movie.tmdb_id,
          imdb_id: movie.imdb_id,
          runtime: movie.runtime,
          plot: movie.plot,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          budget: movie.budget,
          revenue: movie.revenue,
          trailer_key: movie.trailer_key,
          trailer_site: movie.trailer_site,
          status: movie.status,
          popularity: movie.popularity,
          vote_count: movie.vote_count,
          adult: movie.adult,
          video: movie.video,
          media_type: movie.media_type,
          // Update editable fields
          title: formData.title,
          format: formData.format,
          price: formData.price ? parseFloat(formData.price) : null,
          acquired_date: formData.acquired_date,
          comments: formData.comments,
          never_seen: formData.never_seen
        };
        await apiService.updateMovie(movie.id!, editableData);
      } else {
        // Create new movie - check if we have TMDB data to use pipeline
        if (formData.tmdb_id && prefilledData) {
          // Use the pipeline for movies with TMDB data (from search results)
          const movieData = {
            title: formData.title,
            year: formData.release_date ? new Date(formData.release_date).getFullYear() : null,
            format: formData.format,
            price: formData.price ? parseFloat(formData.price) : null,
            acquired_date: formData.acquired_date,
            comments: formData.comments,
            never_seen: formData.never_seen
          };
          await apiService.addMovieWithPipeline(movieData.title, movieData.year !== null ? String(movieData.year) : null, movieData as Record<string, unknown>);
        } else {
          // Use regular create for manual entry
          const movieData = {
            ...formData,
            cast: formData.cast.split(',').map((actor: string) => actor.trim()).filter((actor: string) => actor),
            release_date: formData.release_date || null,
            imdb_rating: formData.imdb_rating ? parseFloat(formData.imdb_rating) : null,
            rotten_tomato_rating: formData.rotten_tomato_rating ? parseInt(formData.rotten_tomato_rating) : null,
            tmdb_rating: formData.tmdb_rating ? parseFloat(formData.tmdb_rating) : null,
            price: formData.price ? parseFloat(formData.price) : null,
            runtime: formData.runtime ? parseInt(formData.runtime) : null
          };
          await apiService.createMovie(movieData);
        }
      }

      onSave();
    } catch (err: unknown) {
      const error = err as { status?: number; code?: string; data?: { error?: string }; message?: string };
      // Check if it's a duplicate edition error (409 status)
      if (error.status === 409 && error.code === 'DUPLICATE_EDITION') {
        setError('A movie with this title, format, and TMDB ID already exists in your collection. Please use a different title (e.g., add "Director\'s Cut", "Extended Edition") or choose a different format to distinguish this edition.');
      } else if (error.status === 409) {
        // Other 409 conflicts
        setError((error.data?.error || error.message || 'This movie already exists'));
      } else if (error.data?.error) {
        // Show specific error message from server
        setError('Failed to save: ' + error.data.error);
      } else {
        setError('Failed to save movie: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="movie-form">
      <h2>{movie ? 'Edit Movie' : 'Add New Movie'}</h2>



      <form onSubmit={handleSubmit}>
        {/* Editable Fields */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="format">Format</label>
            <select
              id="format"
              name="format"
              value={formData.format}
              onChange={handleInputChange}
            >
              <option value="">Select format</option>
              <option value="Blu-ray">Blu-ray</option>
              <option value="Blu-ray 4K">Blu-ray 4K</option>
              <option value="DVD">DVD</option>
              <option value="Digital">Digital</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="price">Price (CHF)</label>
            <input
              type="number"
              id="price"
              name="price"
              value={formData.price}
              onChange={handleInputChange}
              min="0"
              step="0.01"
              placeholder="e.g., 19.99"
            />
          </div>

          <div className="form-group">
            <label htmlFor="acquired_date">Acquired Date</label>
            <input
              type="date"
              id="acquired_date"
              name="acquired_date"
              value={formData.acquired_date}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="comments">Comments</label>
          <textarea
            id="comments"
            name="comments"
            value={formData.comments}
            onChange={handleInputChange}
            rows={3}
            placeholder="Personal notes or comments about this movie..."
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="never_seen"
              checked={formData.never_seen}
              onChange={handleInputChange}
            />
            <span className="checkbox-text">Never Seen</span>
          </label>
          <small className="form-help">
            Check this if you haven't watched this movie yet
          </small>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="form-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="save-btn">
            {loading ? 'Saving...' : (movie ? 'Update Movie' : 'Add Movie')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MovieForm;
