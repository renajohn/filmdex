import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BsX, BsCheckCircle, BsExclamationTriangle, BsArrowClockwise } from 'react-icons/bs';
import apiService from '../services/api';
import './BackfillModal.css';

const BackfillModal = ({ isOpen, onClose, onComplete, onIgnore }) => {
  const [currentStep, setCurrentStep] = useState('description'); // description, progress, result
  const [backfillStatus, setBackfillStatus] = useState(null);
  const [progress, setProgress] = useState({ processed: 0, total: 0, updated: 0, failed: 0 });
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [pollInterval, setPollInterval] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchBackfillStatus();
    }
    
    // Cleanup on unmount
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isOpen, pollInterval]);

  const fetchBackfillStatus = async () => {
    try {
      const response = await apiService.getBackfillStatus();
      setBackfillStatus(response.data);
    } catch (error) {
      console.error('Error fetching backfill status:', error);
      setError('Failed to fetch backfill status');
    }
  };

  const handleStartBackfill = async (force = false) => {
    try {
      setIsRunning(true);
      setCurrentStep('progress');
      setError(null);
      
      const response = await apiService.startBackfill({ force });
      
      if (response.success) {
        // Start polling for progress after a short delay
        setTimeout(() => {
          pollProgress();
        }, 500);
      } else {
        setError(response.error || 'Failed to start backfill process');
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error starting backfill:', error);
      setError('Failed to start backfill process');
      setIsRunning(false);
    }
  };

  const pollProgress = () => {
    const interval = setInterval(async () => {
      try {
        const response = await apiService.getBackfillProgress();
        if (response.success) {
          const data = response.data;
          setProgress({
            processed: data.processed || 0,
            total: data.total || 0,
            updated: data.updated || 0,
            failed: data.failed || 0
          });
          
          // Check if completed
          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(interval);
            setPollInterval(null);
            setIsRunning(false);
            setCurrentStep('result');
            setResult({
              total: data.total || 0,
              updated: data.updated || 0,
              failed: data.failed || 0,
              failedMovies: data.failedMovies || []
            });
            if (onComplete) {
              onComplete(data);
            }
          }
        }
      } catch (error) {
        console.error('Error polling progress:', error);
        clearInterval(interval);
        setPollInterval(null);
        setIsRunning(false);
        setError('Failed to get progress updates');
      }
    }, 1000); // Poll every 1 second for better responsiveness

    setPollInterval(interval);

    // Cleanup interval after 10 minutes
    setTimeout(() => {
      clearInterval(interval);
      setPollInterval(null);
      if (isRunning) {
        setIsRunning(false);
        setError('Backfill process timed out');
      }
    }, 600000);
  };

  const handleRetryFailed = async () => {
    if (!result || !result.failedMovies || result.failedMovies.length === 0) {
      return;
    }

    try {
      setIsRunning(true);
      setCurrentStep('progress');
      setError(null);
      
      const failedIds = result.failedMovies.map(movie => movie.id);
      const response = await apiService.retryFailedMovies(failedIds);
      
      if (response.success) {
        setResult(response.data);
        setIsRunning(false);
        setCurrentStep('result');
      } else {
        setError('Failed to retry failed movies');
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error retrying failed movies:', error);
      setError('Failed to retry failed movies');
      setIsRunning(false);
    }
  };

  const handleClose = () => {
    // Clear any active polling
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    
    setCurrentStep('description');
    setProgress({ processed: 0, total: 0, updated: 0, failed: 0 });
    setResult(null);
    setError(null);
    setIsRunning(false);
    onClose();
  };

  const renderDescriptionStep = () => (
    <div className="backfill-step">
      <h2>Update Recommended Ages</h2>
      <div className="backfill-description">
        <p>
          This update will analyze all your movies to determine the recommended age 
          using official certifications from different countries (Switzerland, France, 
          Germany, United Kingdom, Netherlands, United States).
        </p>
        <p>
          The process uses an intelligent approach that takes the median of available ages 
          to provide a balanced recommendation.
        </p>
        {backfillStatus && backfillStatus.moviesWithoutAge === 0 && (
          <p className="force-notice">
            <strong>All movies have been processed.</strong> Use "Force Re-backfill" to 
            re-process all movies and update their age recommendations.
          </p>
        )}
        {backfillStatus && (
          <div className="backfill-stats">
            <div className="stat-item">
              <span className="stat-label">Total movies:</span>
              <span className="stat-value">{backfillStatus.totalMovies}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">With age:</span>
              <span className="stat-value">{backfillStatus.moviesWithAge}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Without age:</span>
              <span className="stat-value">{backfillStatus.moviesWithoutAge}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Progress:</span>
              <span className="stat-value">{backfillStatus.completionPercentage}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="backfill-actions">
        <button 
          className="btn btn-secondary" 
          onClick={handleClose}
        >
          Later
        </button>
        {onIgnore && (
          <button 
            className="btn btn-outline-secondary" 
            onClick={() => {
              if (onIgnore) {
                onIgnore();
              }
              handleClose();
            }}
          >
            Ignore
          </button>
        )}
        {backfillStatus && backfillStatus.moviesWithoutAge === 0 ? (
          <button 
            className="btn btn-warning" 
            onClick={() => handleStartBackfill(true)}
          >
            Force Re-backfill
          </button>
        ) : (
          <button 
            className="btn btn-primary" 
            onClick={() => handleStartBackfill(false)}
            disabled={!backfillStatus}
          >
            Start Update
          </button>
        )}
      </div>
    </div>
  );

  const renderProgressStep = () => (
    <div className="backfill-step">
      <h2>Update in progress...</h2>
      <div className="backfill-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ 
              width: progress.total > 0 ? `${(progress.processed / progress.total) * 100}%` : '0%' 
            }}
          />
        </div>
        <div className="progress-text">
          {progress.processed} / {progress.total} movies processed
          {progress.total > 0 && (
            <span className="progress-percentage">
              ({Math.round((progress.processed / progress.total) * 100)}%)
            </span>
          )}
        </div>
        <div className="progress-stats">
          <div className="stat-item">
            <BsCheckCircle className="stat-icon success" />
            <span>{progress.updated} updated</span>
          </div>
          <div className="stat-item">
            <BsExclamationTriangle className="stat-icon error" />
            <span>{progress.failed} failed</span>
          </div>
        </div>
      </div>
      {error && (
        <div className="error-message">
          <BsExclamationTriangle />
          {error}
        </div>
      )}
    </div>
  );

  const renderResultStep = () => (
    <div className="backfill-step">
      <h2>Update completed</h2>
      <div className="backfill-result">
        <div className="result-stats">
          <div className="stat-item">
            <span className="stat-label">Total processed:</span>
            <span className="stat-value">{result.total}</span>
          </div>
          <div className="stat-item success">
            <BsCheckCircle className="stat-icon" />
            <span className="stat-label">Updated:</span>
            <span className="stat-value">{result.updated}</span>
          </div>
          <div className="stat-item error">
            <BsExclamationTriangle className="stat-icon" />
            <span className="stat-label">Failed:</span>
            <span className="stat-value">{result.failed}</span>
          </div>
        </div>
        
        {result.failedMovies && result.failedMovies.length > 0 && (
          <div className="failed-movies">
            <h3>Failed movies:</h3>
            <div className="failed-list">
              {result.failedMovies.slice(0, 10).map((movie, index) => (
                <div key={index} className="failed-item">
                  <span className="movie-title">{movie.title}</span>
                  <span className="error-message">{movie.error}</span>
                </div>
              ))}
              {result.failedMovies.length > 10 && (
                <div className="more-failed">
                  ... and {result.failedMovies.length - 10} others
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="backfill-actions">
        {result.failedMovies && result.failedMovies.length > 0 && (
          <button 
            className="btn btn-secondary" 
            onClick={handleRetryFailed}
          >
            <BsArrowClockwise />
            Retry Failed
          </button>
        )}
        <button 
          className="btn btn-primary" 
          onClick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="backfill-modal-overlay">
      <div className="backfill-modal">
        <button className="close-button" onClick={handleClose}>
          <BsX />
        </button>
        
        {currentStep === 'description' && renderDescriptionStep()}
        {currentStep === 'progress' && renderProgressStep()}
        {currentStep === 'result' && renderResultStep()}
      </div>
    </div>,
    document.body
  );
};

export default BackfillModal;
