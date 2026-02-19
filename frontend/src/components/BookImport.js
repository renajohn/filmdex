import React, { useState } from 'react';
import './BookImport.css';

const BookImport = ({ onFileUpload, onError }) => {
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
    <div className="book-import">
      <div className="import-header">
        <h2>Import Books from CSV</h2>
        <p>Upload a CSV file to import multiple books at once. The CSV should have columns for title, authors, ISBN, publisher, format, and other book details.</p>
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
              <li>title - The book title</li>
            </ul>
          </div>
          <div className="requirement">
            <strong>Optional columns:</strong>
            <ul>
              <li>authors - Author names (comma separated)</li>
              <li>isbn - ISBN-10 or ISBN-13</li>
              <li>isbn13 - ISBN-13 (alternative to isbn)</li>
              <li>publisher - Publisher name</li>
              <li>published_year - Year of publication</li>
              <li>language - Language code (e.g., en, fr, de)</li>
              <li>format - Format (e.g., Hardcover, Paperback, Audiobook, eBook)</li>
              <li>series - Series name</li>
              <li>series_number - Number in series</li>
              <li>genres - Genres (comma separated)</li>
              <li>page_count - Number of pages</li>
              <li>rating - Your rating (1-5)</li>
              <li>owner - Owner name</li>
              <li>title_status - Status (owned, borrowed, wish)</li>
              <li>read_date - Date you finished reading</li>
              <li>notes - Your personal notes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookImport;