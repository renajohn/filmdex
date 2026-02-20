
import React, { useState, useEffect, useRef } from 'react';
import { BsCheckCircleFill, BsCloudUpload } from 'react-icons/bs';
import apiService from '../services/api';
import './InlinePosterSelector.css';

interface Poster {
  file_path: string;
  width: number;
  height: number;
  iso_639_1?: string;
  isCustom?: boolean;
}

interface Movie {
  id?: number;
  movie_id?: number;
  tmdb_id?: number;
  media_type?: string;
}

interface Position {
  top?: number;
  left?: number;
  right?: number;
  arrowLeft?: number;
}

interface InlinePosterSelectorProps {
  movie: Movie;
  isOpen: boolean;
  onSelectPoster: (poster: Poster) => void;
  currentPosterPath?: string;
  position?: Position;
}

const InlinePosterSelector = ({ movie, isOpen, onSelectPoster, currentPosterPath, position }: InlinePosterSelectorProps) => {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  const [uploadedPoster, setUploadedPoster] = useState<Poster | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchPosters = async () => {
      if (!isOpen) return;

      // Support both tmdb_id (from database) and id (from TMDB search)
      const tmdbId = movie.tmdb_id || movie.id;

      if (!tmdbId) {
        return;
      }

      setLoading(true);
      try {
        const mediaType = movie.media_type || 'movie';
        const posterData = await apiService.getMoviePosters(tmdbId, mediaType) as Poster[];
        setPosters(posterData);

        // Mark current poster as selected
        if (currentPosterPath) {
          const currentPath = currentPosterPath.includes('image.tmdb.org')
            ? currentPosterPath.split('/').pop() || ''
            : currentPosterPath.replace('/images/posters/', '').replace('.jpg', '');
          setSelectedPoster(currentPath);
        }
      } catch (error) {
        console.error('Error fetching posters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosters();
  }, [isOpen, movie, currentPosterPath]);

  const handlePosterSelect = (poster: Poster) => {
    setSelectedPoster(poster.file_path);
    onSelectPoster(poster);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const dragCounter = useRef<number>(0);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Process the dropped file
    await processFile(file);
  };

  const processFile = async (file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);

      // Get movie ID (support both database and TMDB search context)
      const movieId = movie.id || movie.movie_id || 0;

      // Upload the file
      const result = await apiService.uploadCustomPoster(movieId, file) as { posterPath: string; width?: number; height?: number };

      // Create a custom poster object
      const customPoster: Poster = {
        file_path: result.posterPath,
        width: result.width || 500,
        height: result.height || 750,
        iso_639_1: 'custom',
        isCustom: true
      };

      setUploadedPoster(customPoster);
      setSelectedPoster(result.posterPath);
      onSelectPoster(customPoster);

    } catch (error) {
      console.error('Error uploading poster:', error);
      alert((error as Error).message || 'Failed to upload poster. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const getTmdbImageUrl = (path: string, size: string = 'w342'): string => {
    return `https://image.tmdb.org/t/p/${size}${path}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="inline-poster-selector"
      style={{
        top: position?.top ? `${position.top}px` : 'calc(20px + 375px + 10px)',
        left: position?.left ? `${position.left}px` : '20px',
        right: position?.right ? `${position.right}px` : '20px'
      }}
    >
      <div
        className="inline-poster-indicator"
        style={{
          paddingLeft: position?.arrowLeft ? `${position.arrowLeft}px` : 'calc(20px + 125px - 12px)'
        }}
      >
        <div className="indicator-arrow"></div>
      </div>

      <div className="inline-poster-content">
        {loading ? (
          <div className="inline-poster-loading">Loading posters...</div>
        ) : (
          <div className="inline-poster-grid">
            {/* Upload Card - Always first */}
            <div
              className={`inline-poster-option upload-card ${isDragging ? 'dragging' : ''}`}
              onClick={handleUploadClick}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <div className="upload-card-content">
                {uploading ? (
                  <>
                    <div className="upload-spinner"></div>
                    <span className="upload-text">Uploading...</span>
                  </>
                ) : (
                  <>
                    <BsCloudUpload size={36} className="upload-icon" />
                    <span className="upload-text">Upload</span>
                  </>
                )}
              </div>
            </div>

            {/* Uploaded Custom Poster */}
            {uploadedPoster && (
              <div
                className={`inline-poster-option ${selectedPoster === uploadedPoster.file_path ? 'selected' : ''}`}
                onClick={() => handlePosterSelect(uploadedPoster)}
              >
                <img
                  src={`${apiService.getImageBaseUrl()}${uploadedPoster.file_path}`}
                  alt="Custom poster"
                  loading="lazy"
                />
                {selectedPoster === uploadedPoster.file_path && (
                  <div className="inline-selected-indicator">
                    <BsCheckCircleFill size={24} />
                  </div>
                )}
                <div className="inline-poster-info">
                  <span className="inline-poster-language custom-badge">CUSTOM</span>
                </div>
              </div>
            )}

            {/* TMDB Posters */}
            {posters.length === 0 && !uploadedPoster ? (
              <div className="inline-poster-empty-inline">No TMDB posters available</div>
            ) : (
              posters.map((poster, index) => (
                <div
                  key={index}
                  className={`inline-poster-option ${selectedPoster === poster.file_path ? 'selected' : ''}`}
                  onClick={() => handlePosterSelect(poster)}
                >
                  <img
                    src={getTmdbImageUrl(poster.file_path, 'w185')}
                    alt={`Poster ${index + 1}`}
                    loading="lazy"
                  />
                  {selectedPoster === poster.file_path && (
                    <div className="inline-selected-indicator">
                      <BsCheckCircleFill size={24} />
                    </div>
                  )}
                  <div className="inline-poster-info">
                    {poster.iso_639_1 && (
                      <span className="inline-poster-language">{poster.iso_639_1.toUpperCase()}</span>
                    )}
                    <span className="inline-poster-resolution">{poster.width}x{poster.height}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InlinePosterSelector;
