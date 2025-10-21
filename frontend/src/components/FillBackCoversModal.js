import React, { useState, useEffect } from 'react';
import './FillBackCoversModal.css';

const FillBackCoversModal = ({ isOpen, onClose, onFill }) => {
  const [albums, setAlbums] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentAlbum: '', phase: '' });

  // Load albums missing covers when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAlbumsMissingCovers();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAlbumsMissingCovers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get albums missing both front and back covers
      const [frontData, backData] = await Promise.all([
        onFill('getAlbums', 'front'),
        onFill('getAlbums', 'back')
      ]);
      
      const frontAlbums = frontData.albums || [];
      const backAlbums = backData.albums || [];
      
      // Combine and deduplicate albums
      const allAlbums = [...frontAlbums, ...backAlbums];
      const uniqueAlbums = allAlbums.filter((album, index, self) => 
        index === self.findIndex(a => a.id === album.id)
      );
      
      // Filter out albums that already have both front and back covers
      const albumsNeedingCovers = uniqueAlbums.filter(album => {
        const hasFrontCover = album.cover && album.cover.trim() !== '';
        const hasBackCover = album.backCover && album.backCover.trim() !== '';
        return !hasFrontCover || !hasBackCover;
      });
      
      setAlbums(albumsNeedingCovers);
    } catch (err) {
      setError(err.message || 'Failed to load albums');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillCovers = async () => {
    if (albums.length === 0) {
      setError('No albums found');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setProgress({ current: 0, total: albums.length * 2, currentAlbum: '', phase: 'Starting...' });

    try {
      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process front covers first
      setProgress(prev => ({ ...prev, phase: 'Processing front covers...' }));
      
      for (let i = 0; i < albums.length; i++) {
        const album = albums[i];
        setProgress(prev => ({ 
          ...prev, 
          current: i, 
          currentAlbum: album.title,
          phase: 'Processing front covers...'
        }));
        
        // Only process if front cover is missing
        if (!album.cover || album.cover.trim() === '') {
          try {
            const frontResult = await onFill('fillCovers', [album.id], 'front');
            results.processed += frontResult.processed;
            results.successful += frontResult.successful;
            results.failed += frontResult.failed;
            if (frontResult.errors) {
              results.errors.push(...frontResult.errors);
            }
          } catch (error) {
            results.failed++;
            results.errors.push(`Front cover for ${album.title}: ${error.message}`);
          }
        } else {
          // Skip albums that already have front covers
          results.successful++;
        }
      }
      
      // Process back covers
      setProgress(prev => ({ ...prev, phase: 'Processing back covers...' }));
      
      for (let i = 0; i < albums.length; i++) {
        const album = albums[i];
        setProgress(prev => ({ 
          ...prev, 
          current: albums.length + i, 
          currentAlbum: album.title,
          phase: 'Processing back covers...'
        }));
        
        // Only process if back cover is missing
        if (!album.backCover || album.backCover.trim() === '') {
          try {
            const backResult = await onFill('fillCovers', [album.id], 'back');
            results.processed += backResult.processed;
            results.successful += backResult.successful;
            results.failed += backResult.failed;
            if (backResult.errors) {
              results.errors.push(...backResult.errors);
            }
          } catch (error) {
            results.failed++;
            results.errors.push(`Back cover for ${album.title}: ${error.message}`);
          }
        } else {
          // Skip albums that already have back covers
          results.successful++;
        }
      }
      
      setResult(results);
    } catch (err) {
      setError(err.message || 'Failed to fill covers');
    } finally {
      setIsRunning(false);
    }
  };

  const handleClose = () => {
    if (!isRunning) {
      setAlbums([]);
      setResult(null);
      setError(null);
      setProgress({ current: 0, total: 0, currentAlbum: '', phase: '' });
      onClose();
    }
  };

  const getArtistDisplay = (artist) => {
    if (Array.isArray(artist)) {
      return artist.join(', ');
    }
    return artist || 'Unknown Artist';
  };

  if (!isOpen) return null;

  return (
    <div className="fill-back-covers-modal-overlay" onClick={handleClose}>
      <div className="fill-back-covers-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fill-back-covers-modal-header">
          <h2>Fill Album Covers</h2>
          <button
            className="fill-back-covers-modal-close"
            onClick={handleClose}
            disabled={isRunning}
          >
            ×
          </button>
        </div>

        <div className="fill-back-covers-modal-body">
          {!result && !error && !isRunning && (
            <>
              <div className="fill-back-covers-info">
                <p>
                  This tool will automatically download both front and back covers for all albums that are missing them.
                  Only albums with MusicBrainz release IDs can be processed.
                </p>
                <p>
                  Click "Fill All Covers" to start processing all albums with missing covers.
                </p>
              </div>

              {isLoading ? (
                <div className="fill-back-covers-loading">
                  <div className="fill-back-covers-spinner"></div>
                  <p>Loading albums missing covers...</p>
                </div>
              ) : (
                <>
                  <div className="fill-back-covers-summary">
                    <div className="summary-stats">
                      <div className="stat-item">
                        <span className="stat-label">Albums Missing Covers:</span>
                        <span className="stat-value">{albums.length}</span>
                      </div>
                    </div>
                  </div>

                  {albums.length === 0 ? (
                    <div className="fill-back-covers-empty">
                      <p>🎉 All albums already have covers!</p>
                    </div>
                  ) : (
                    <div className="fill-back-covers-actions">
                      <button
                        className="btn btn-primary btn-lg"
                        onClick={handleFillCovers}
                        disabled={albums.length === 0}
                      >
                        Fill All Covers
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {isRunning && (
            <div className="fill-back-covers-progress">
              <div className="progress-header">
                <h3>{progress.phase}</h3>
                <div className="progress-stats">
                  {progress.current} of {progress.total} albums processed
                </div>
              </div>
              
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
              
              {progress.currentAlbum && (
                <div className="current-album">
                  Currently processing: <strong>{progress.currentAlbum}</strong>
                </div>
              )}
              
              <div className="fill-back-covers-spinner"></div>
              <p>Downloading covers... Please wait.</p>
              <p className="fill-back-covers-progress-note">
                This may take a few minutes depending on the number of albums and internet speed.
              </p>
            </div>
          )}

          {result && (
            <div className="fill-back-covers-result">
              <h3>Cover Fill Results</h3>
              <div className="fill-back-covers-stats">
                <div className="stat-item">
                  <span className="stat-label">Processed:</span>
                  <span className="stat-value">{result.processed}</span>
                </div>
                <div className="stat-item success">
                  <span className="stat-label">Successful:</span>
                  <span className="stat-value">{result.successful}</span>
                </div>
                <div className="stat-item error">
                  <span className="stat-label">Failed:</span>
                  <span className="stat-value">{result.failed}</span>
                </div>
              </div>
              
              <div className="fill-back-covers-result-actions">
                <button className="btn btn-primary" onClick={loadAlbumsMissingCovers}>
                  Refresh List
                </button>
                <button className="btn btn-secondary" onClick={handleClose}>
                  Close
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="fill-back-covers-error">
              <h3>Error</h3>
              <p>{error}</p>
              <div className="fill-back-covers-error-actions">
                <button className="btn btn-primary" onClick={loadAlbumsMissingCovers}>
                  Try Again
                </button>
                <button className="btn btn-secondary" onClick={handleClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FillBackCoversModal;
