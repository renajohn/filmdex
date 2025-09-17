import React, { useState } from 'react';
import MovieImport from '../components/MovieImport';
import UnmatchedMovies from '../components/UnmatchedMovies';
import ColumnMappingModal from '../components/ColumnMappingModal';
import apiService from '../services/api';
import './ImportPage.css';

const ImportPage = () => {
  const [currentStep, setCurrentStep] = useState('upload'); // 'upload', 'mapping', 'processing', 'resolve', 'complete'
  const [importId, setImportId] = useState(null);
  const [error, setError] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [filePath, setFilePath] = useState(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [importStats, setImportStats] = useState(null);

  const handleFileUpload = async (file) => {
    try {
      setError(null);
      const response = await apiService.uploadCsv(file);
      setCsvHeaders(response.headers);
      setFilePath(response.filePath);
      setShowMappingModal(true);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleMappingConfirm = async (columnMapping) => {
    try {
      setShowMappingModal(false);
      setCurrentStep('processing');
      setError(null);
      
      const response = await apiService.processCsv(filePath, columnMapping);
      setImportId(response.importId);
      
      // Start polling for status updates
      pollImportStatus(response.importId);
    } catch (error) {
      setError(error.message);
      setCurrentStep('upload');
    }
  };

  const handleMappingCancel = () => {
    setShowMappingModal(false);
    setCsvHeaders([]);
    setFilePath(null);
    setCurrentStep('upload');
  };

  const pollImportStatus = async (id) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await apiService.makeRequest(`/import/${id}`);
        if (response.ok) {
          const status = await response.json();
          
          if (status.status === 'COMPLETED') {
            setImportStats({
              totalMovies: status.totalMovies || 0,
              processedMovies: status.processedMovies || 0,
              unmatchedMovies: status.unmatchedMovies?.length || 0
            });
            setCurrentStep('complete');
            clearInterval(pollInterval);
          } else if (status.status === 'PENDING_RESOLUTION') {
            console.log('Import status changed to PENDING_RESOLUTION:', {
              totalMovies: status.totalMovies,
              processedMovies: status.processedMovies,
              unmatchedMovies: status.unmatchedMovies?.length,
              unmatchedMoviesList: status.unmatchedMovies
            });
            setImportStats({
              totalMovies: status.totalMovies || 0,
              processedMovies: status.processedMovies || 0,
              unmatchedMovies: status.unmatchedMovies?.length || 0
            });
            // Keep in processing state but show resolve UI
            clearInterval(pollInterval);
          } else if (status.status === 'FAILED') {
            setError('Import failed. Please try again.');
            setCurrentStep('upload');
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Error polling import status:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (currentStep === 'processing') {
        setError('Import is taking longer than expected. Please check the status manually.');
        setCurrentStep('resolve');
      }
    }, 300000);
  };

  const handleImportComplete = async () => {
    // Get final import stats
    if (importId) {
      try {
        const response = await apiService.makeRequest(`/import/${importId}`);
        if (response.ok) {
          const status = await response.json();
          setImportStats({
            totalMovies: status.totalMovies || 0,
            processedMovies: status.processedMovies || 0,
            autoResolvedMovies: status.autoResolvedMovies || 0,
            manualResolvedMovies: status.manualResolvedMovies || 0,
            unmatchedMovies: status.unmatchedMovies?.length || 0
          });
        }
      } catch (error) {
        console.error('Error getting final import stats:', error);
      }
    }
    setCurrentStep('complete');
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
    setCurrentStep('upload');
  };

  const handleStartOver = () => {
    setCurrentStep('upload');
    setImportId(null);
    setError(null);
    setCsvHeaders([]);
    setFilePath(null);
    setShowMappingModal(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <MovieImport
            onFileUpload={handleFileUpload}
            onError={handleError}
          />
        );
      
      case 'processing':
        // Check if we have unmatched movies to resolve
        console.log('Processing step - checking for unmatched movies:', {
          importStats,
          unmatchedMovies: importStats?.unmatchedMovies,
          shouldShowResolve: importStats && importStats.unmatchedMovies > 0
        });
        if (importStats && importStats.unmatchedMovies > 0) {
          return (
            <UnmatchedMovies
              importId={importId}
              onImportComplete={handleImportComplete}
              setCurrentStep={setCurrentStep}
            />
          );
        }
        
        return (
          <div className="processing-step">
            <div className="processing-content">
              <div className="spinner"></div>
              <h3>Processing your CSV file...</h3>
              <p>We're enriching your movie data with information from TMDB and OMDB.</p>
              <p>This may take a few minutes depending on the number of movies.</p>
            </div>
          </div>
        );
      
      
      case 'complete':
        return (
          <div className="complete-step">
            <div className="complete-content">
              <div className="success-icon">✅</div>
              <h3>Import Complete!</h3>
              
              {importStats && (
                <div className="import-stats">
                  <h4>Import Summary</h4>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-number">{importStats.totalMovies}</div>
                      <div className="stat-label">Total Movies</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-number">{importStats.processedMovies}</div>
                      <div className="stat-label">Successfully Imported</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-number">{importStats.autoResolvedMovies}</div>
                      <div className="stat-label">Auto-Resolved</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-number">{importStats.manualResolvedMovies}</div>
                      <div className="stat-label">Manually Resolved</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-number">{importStats.unmatchedMovies}</div>
                      <div className="stat-label">Skipped</div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="complete-actions">
                <button 
                  onClick={() => window.location.href = '/'} 
                  className="btn btn-primary"
                >
                  View Collection
                </button>
                <button onClick={handleStartOver} className="btn btn-secondary">
                  Import Another File
                </button>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="import-page">
      <div className="import-container">
        <div className="import-header">
          <h1>Import Movies</h1>
          <div className="step-indicator">
            <div className={`step ${currentStep === 'upload' ? 'active' : ''} ${['upload', 'mapping', 'processing', 'complete'].indexOf(currentStep) > 0 ? 'completed' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">Upload CSV</span>
            </div>
            <div className={`step ${currentStep === 'mapping' ? 'active' : ''} ${['mapping', 'processing', 'complete'].indexOf(currentStep) > 0 ? 'completed' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Map Columns</span>
            </div>
            <div className={`step ${currentStep === 'processing' ? 'active' : ''} ${currentStep === 'complete' ? 'completed' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Processing</span>
            </div>
            <div className={`step ${currentStep === 'complete' ? 'active' : ''}`}>
              <span className="step-number">4</span>
              <span className="step-label">Complete</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <div className="error-content">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
              <button onClick={() => setError(null)} className="error-close">×</button>
            </div>
          </div>
        )}

        <div className="import-content">
          {renderStep()}
        </div>
      </div>

      <ColumnMappingModal
        isOpen={showMappingModal}
        onClose={handleMappingCancel}
        sheetHeaders={csvHeaders}
        onConfirm={handleMappingConfirm}
        onCancel={handleMappingCancel}
      />
    </div>
  );
};

export default ImportPage;
