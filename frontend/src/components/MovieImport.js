import React, { useState } from 'react';
import './MovieImport.css';

const MovieImport = ({ onFileUpload, onError }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'text/csv' || droppedFile.name.toLowerCase().endsWith('.csv')) {
        setFile(droppedFile);
      } else {
        onError('Please select a CSV file');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      onError('Please select a CSV file');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError('Please select a CSV file');
      return;
    }

    setIsUploading(true);
    
    try {
      await onFileUpload(file);
    } catch (error) {
      onError(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="movie-import">
      <div className="import-header">
        <h2>Import Movies from CSV</h2>
        <p>Upload a CSV file to import multiple movies at once. The CSV should have columns for title, original_title, comments, price, and format.</p>
      </div>

      <form onSubmit={handleSubmit} className="import-form">
        <div 
          className={`file-drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'file-selected' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="csv-file"
            accept=".csv"
            onChange={handleFileChange}
            className="file-input"
          />
          <label htmlFor="csv-file" className="file-label">
            {file ? (
              <div className="file-selected-content">
                <div className="file-icon">📄</div>
                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">{formatFileSize(file.size)}</div>
                </div>
                <button 
                  type="button" 
                  className="remove-file"
                  onClick={() => setFile(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="file-drop-content">
                <div className="file-icon">📁</div>
                <div className="drop-text">
                  <strong>Click to select</strong> or drag and drop your CSV file here
                </div>
                <div className="file-requirements">
                  Maximum file size: 10MB
                </div>
              </div>
            )}
          </label>
        </div>

        <div className="import-actions">
          <button 
            type="submit" 
            disabled={!file || isUploading}
            className="import-button"
          >
            {isUploading ? 'Uploading...' : 'Start Import'}
          </button>
        </div>
      </form>

      <div className="import-info">
        <h3>CSV Format Requirements</h3>
        <div className="format-requirements">
          <div className="requirement">
            <strong>Required columns:</strong>
            <ul>
              <li>title - The movie title</li>
            </ul>
          </div>
          <div className="requirement">
            <strong>Optional columns:</strong>
            <ul>
              <li>original_title - Original title of the movie</li>
              <li>comments - Your personal comments</li>
              <li>price - Purchase price</li>
              <li>acquired_date - Date when you acquired the movie</li>
              <li>format - Media format (Blu-ray, DVD, etc.)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieImport;