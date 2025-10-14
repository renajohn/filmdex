import React, { useState } from 'react';
import { BsX, BsDownload } from 'react-icons/bs';
import './CsvExportDialog.css';

const CsvExportDialog = ({ isOpen, onClose, onExport }) => {
  const [selectedColumns, setSelectedColumns] = useState({
    title: true,
    original_title: true,
    original_language: true,
    genre: true,
    director: true,
    cast: true,
    release_date: true,
    format: true,
    imdb_rating: true,
    rotten_tomato_rating: true,
    tmdb_rating: true,
    tmdb_id: true,
    imdb_id: true,
    price: true,
    runtime: true,
    plot: true,
    comments: true,
    acquired_date: true,
    budget: true,
    revenue: true,
    trailer_key: true,
    trailer_site: true,
    status: true,
    popularity: true,
    vote_count: true,
    media_type: true,
    recommended_age: true,
    title_status: true
  });

  const columnLabels = {
    title: 'Title',
    original_title: 'Original Title',
    original_language: 'Original Language',
    genre: 'Genre',
    director: 'Director',
    cast: 'Cast',
    release_date: 'Release Date',
    format: 'Format',
    imdb_rating: 'IMDB Rating',
    rotten_tomato_rating: 'Rotten Tomato Rating',
    tmdb_rating: 'TMDB Rating',
    tmdb_id: 'TMDB ID',
    imdb_id: 'IMDB ID',
    price: 'Price',
    runtime: 'Runtime (minutes)',
    plot: 'Plot',
    comments: 'Comments',
    acquired_date: 'Acquired Date',
    budget: 'Budget',
    revenue: 'Revenue',
    trailer_key: 'Trailer Key',
    trailer_site: 'Trailer Site',
    status: 'Status',
    popularity: 'Popularity',
    vote_count: 'Vote Count',
    media_type: 'Media Type',
    recommended_age: 'Recommended Age',
    title_status: 'Title Status'
  };

  const handleColumnToggle = (column) => {
    setSelectedColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  const handleSelectAll = () => {
    const allSelected = Object.keys(selectedColumns).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setSelectedColumns(allSelected);
  };

  const handleSelectNone = () => {
    const noneSelected = Object.keys(selectedColumns).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {});
    setSelectedColumns(noneSelected);
  };

  const handleExport = () => {
    const columnsToExport = Object.keys(selectedColumns).filter(key => selectedColumns[key]);
    onExport(columnsToExport);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="csv-export-overlay">
      <div className="csv-export-dialog">
        <div className="csv-export-header">
          <h2>Export Movies to CSV</h2>
          <button 
            className="csv-export-close" 
            onClick={onClose}
            aria-label="Close dialog"
          >
            <BsX />
          </button>
        </div>
        
        <div className="csv-export-content">
          <p className="csv-export-description">
            Select which columns you want to include in your CSV export. 
            This export is designed for users migrating away from Filmdex.
          </p>
          
          <div className="csv-export-controls">
            <button 
              className="csv-export-control-btn"
              onClick={handleSelectAll}
            >
              Select All
            </button>
            <button 
              className="csv-export-control-btn"
              onClick={handleSelectNone}
            >
              Select None
            </button>
          </div>
          
          <div className="csv-export-columns">
            {Object.keys(columnLabels).map(column => (
              <label key={column} className="csv-export-column-item">
                <input
                  type="checkbox"
                  checked={selectedColumns[column]}
                  onChange={() => handleColumnToggle(column)}
                />
                <span className="csv-export-column-label">
                  {columnLabels[column]}
                </span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="csv-export-footer">
          <button 
            className="csv-export-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="csv-export-export-btn"
            onClick={handleExport}
            disabled={!Object.values(selectedColumns).some(selected => selected)}
          >
            <BsDownload className="csv-export-icon" />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default CsvExportDialog;
