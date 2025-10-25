import React, { useState } from 'react';
import { BsX, BsDownload } from 'react-icons/bs';
import './AlbumCsvExportDialog.css';

const AlbumCsvExportDialog = ({ isOpen, onClose, onExport }) => {
  const [selectedColumns, setSelectedColumns] = useState({
    artist: true,
    title: true,
    release_year: true,
    labels: true,
    catalog_number: true,
    barcode: true,
    country: true,
    edition_notes: true,
    genres: true,
    tags: true,
    rating: true,
    total_duration: true,
    format: true,
    packaging: true,
    status: true,
    release_events: true,
    recording_quality: true,
    musicbrainz_release_id: true,
    musicbrainz_release_group_id: true,
    release_group_first_release_date: true,
    release_group_type: true,
    release_group_secondary_types: true,
    ownership_condition: true,
    ownership_notes: true,
    ownership_purchased_at: true,
    ownership_price_chf: true,
    producer: true,
    engineer: true,
    recording_location: true,
    language: true,
    apple_music_url: true,
    urls: true,
    isrc_codes: true,
    annotation: true,
    title_status: true
  });

  const columnLabels = {
    artist: 'Artist',
    title: 'Title',
    release_year: 'Release Year',
    labels: 'Labels',
    catalog_number: 'Catalog Number',
    barcode: 'Barcode',
    country: 'Country',
    edition_notes: 'Edition Notes',
    genres: 'Genres',
    tags: 'Tags',
    rating: 'Rating',
    total_duration: 'Total Duration (seconds)',
    format: 'Format',
    packaging: 'Packaging',
    status: 'Status',
    release_events: 'Release Events',
    recording_quality: 'Recording Quality',
    musicbrainz_release_id: 'MusicBrainz Release ID',
    musicbrainz_release_group_id: 'MusicBrainz Release Group ID',
    release_group_first_release_date: 'Release Group First Release Date',
    release_group_type: 'Release Group Type',
    release_group_secondary_types: 'Release Group Secondary Types',
    ownership_condition: 'Ownership Condition',
    ownership_notes: 'Ownership Notes',
    ownership_purchased_at: 'Purchased At',
    ownership_price_chf: 'Price (CHF)',
    producer: 'Producer',
    engineer: 'Engineer',
    recording_location: 'Recording Location',
    language: 'Language',
    apple_music_url: 'Apple Music URL',
    urls: 'Other URLs',
    isrc_codes: 'ISRC Codes',
    annotation: 'Annotation',
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
    <div className="album-csv-export-overlay">
      <div className="album-csv-export-dialog">
        <div className="album-csv-export-header">
          <h2>Export Albums to CSV</h2>
          <button 
            className="album-csv-export-close" 
            onClick={onClose}
            aria-label="Close dialog"
          >
            <BsX />
          </button>
        </div>
        
        <div className="album-csv-export-content">
          <p className="album-csv-export-description">
            Select which columns you want to include in your CSV export. 
            This export is designed for users migrating away from MusicDex.
          </p>
          
          <div className="album-csv-export-controls">
            <button 
              className="album-csv-export-control-btn"
              onClick={handleSelectAll}
            >
              Select All
            </button>
            <button 
              className="album-csv-export-control-btn"
              onClick={handleSelectNone}
            >
              Select None
            </button>
          </div>
          
          <div className="album-csv-export-columns">
            {Object.keys(columnLabels).map(column => (
              <label key={column} className="album-csv-export-column-item">
                <input
                  type="checkbox"
                  checked={selectedColumns[column]}
                  onChange={() => handleColumnToggle(column)}
                />
                <span className="album-csv-export-column-label">
                  {columnLabels[column]}
                </span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="album-csv-export-footer">
          <button 
            className="album-csv-export-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="album-csv-export-export-btn"
            onClick={handleExport}
            disabled={!Object.values(selectedColumns).some(selected => selected)}
          >
            <BsDownload className="album-csv-export-icon" />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlbumCsvExportDialog;

