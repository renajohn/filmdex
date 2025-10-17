import React, { useState } from 'react';
import './ResizeCoversMigrationModal.css';

const ResizeCoversMigrationModal = ({ isOpen, onClose, onMigrate }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleMigrate = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const migrationResult = await onMigrate();
      setResult(migrationResult);
    } catch (err) {
      setError(err.message || 'Migration failed');
    } finally {
      setIsRunning(false);
    }
  };

  const handleClose = () => {
    if (!isRunning) {
      setResult(null);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="resize-covers-modal-overlay" onClick={handleClose}>
      <div className="resize-covers-modal" onClick={(e) => e.stopPropagation()}>
        <div className="resize-covers-modal-header">
          <h2>Resize Album Covers</h2>
          <button
            className="resize-covers-modal-close"
            onClick={handleClose}
            disabled={isRunning}
          >
            ×
          </button>
        </div>

        <div className="resize-covers-modal-body">
          {!result && !error && !isRunning && (
            <>
              <p>
                This will download any external cover URLs and resize all album covers to a maximum size of
                1000×1000 pixels while maintaining aspect ratio.
              </p>
              <p>
                External URLs (like Cover Art Archive) will be downloaded locally and the database will be updated.
                Images that are already within this size limit will be skipped.
              </p>
              <div className="resize-covers-modal-warning">
                <strong>Note:</strong> This operation may take a few minutes
                depending on the number of albums in your collection and internet speed for downloads.
              </div>
            </>
          )}

          {isRunning && (
            <div className="resize-covers-modal-progress">
              <div className="resize-covers-spinner"></div>
              <p>Downloading and resizing album covers... Please wait.</p>
            </div>
          )}

          {result && (
            <div className="resize-covers-modal-result">
              <h3>Migration Complete!</h3>
              <div className="resize-covers-stats">
                <div className="stat">
                  <span className="stat-label">Total Albums:</span>
                  <span className="stat-value">{result.total}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Processed:</span>
                  <span className="stat-value">{result.processed}</span>
                </div>
                {result.downloaded > 0 && (
                  <div className="stat success">
                    <span className="stat-label">Downloaded:</span>
                    <span className="stat-value">{result.downloaded}</span>
                  </div>
                )}
                <div className="stat success">
                  <span className="stat-label">Resized:</span>
                  <span className="stat-value">{result.resized}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Skipped (correct size):</span>
                  <span className="stat-value">{result.skipped}</span>
                </div>
                {result.errors > 0 && (
                  <div className="stat error">
                    <span className="stat-label">Errors:</span>
                    <span className="stat-value">{result.errors}</span>
                  </div>
                )}
              </div>

              {result.errorDetails && result.errorDetails.length > 0 && (
                <div className="resize-covers-errors">
                  <h4>Errors:</h4>
                  <ul>
                    {result.errorDetails.map((err, idx) => (
                      <li key={idx}>
                        Album {err.albumId} ({err.title}): {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="resize-covers-modal-error">
              <h3>Migration Failed</h3>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="resize-covers-modal-footer">
          {!result && !error && !isRunning && (
            <>
              <button
                className="btn-secondary"
                onClick={handleClose}
                disabled={isRunning}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleMigrate}
                disabled={isRunning}
              >
                Start Migration
              </button>
            </>
          )}

          {(result || error) && (
            <button className="btn-primary" onClick={handleClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResizeCoversMigrationModal;

