import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Tabs, Tab, Form, Alert, Table, Badge } from 'react-bootstrap';
import { BsX, BsSearch, BsUpcScan, BsPlus, BsPencil, BsChevronDown, BsChevronRight } from 'react-icons/bs';
import musicService from '../services/musicService';
import AlbumMetadataForm from './AlbumMetadataForm';
import './AddMusicDialog.css';

// Lazy cover component: fetch one front cover per group after render
const LazyGroupCover = ({ releases, title }) => {
  const [url, setUrl] = useState(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (loadedRef.current || !releases || releases.length === 0) return;
      loadedRef.current = true;
      // Try up to 5 releases in the group to find any cover (prefer front, fallback to back)
      const maxToTry = Math.min(5, releases.length);
      for (let i = 0; i < maxToTry; i++) {
        const rel = releases[i];
        const releaseId = rel?.musicbrainzReleaseId || rel?.id;
        if (!releaseId) continue;
        const meta = await musicService.getCoverArt(releaseId);
        if (cancelled) return;
        const front = meta?.front;
        const back = meta?.back;
        const candidate =
          (front?.thumbnails?.['500'] || front?.thumbnails?.['250'] || front?.url) ||
          (back?.thumbnails?.['500'] || back?.thumbnails?.['250'] || back?.url) ||
          null;
        if (candidate) {
          setUrl(candidate);
          break;
        }
      }
    };
    // Slight delay to prioritize UI thread
    const t = setTimeout(load, 50);
    return () => { cancelled = true; clearTimeout(t); };
  }, [releases]);

  if (!url) {
    return (
      <div className="group-cover group-cover-placeholder">
        <BsSearch size={32} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${title} cover`}
      className="group-cover"
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
};

const AddMusicDialog = ({ show, onHide, onAddCd, onAddCdFromMusicBrainz, onAddCdByBarcode, onReviewMetadata, defaultTitleStatus, onAlbumAdded: onAlbumAddedFromParent, onAddStart, onAddError }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchArtist, setSearchArtist] = useState('');
  const [searchBy, setSearchBy] = useState('title'); // 'title', 'catalog', 'barcode'
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [groupedResults, setGroupedResults] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const searchInputRef = useRef(null);
  
  // New state for metadata form
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [selectedReleaseGroup, setSelectedReleaseGroup] = useState([]);

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (show && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 100);
    }
  }, [show]);

  // Group search results by artist + title + format
  const groupSearchResults = (results) => {
    // Log all unique formats in the results
    const allFormats = [...new Set(results.map(r => r.format || 'Unknown'))];
    console.log('All formats in search results:', allFormats);
    
    // Filter out Digital format only
    const filteredResults = results.filter(release => {
      const format = release.format || 'Unknown';
      const isDigital = format.toLowerCase().includes('digital');
      return !isDigital;
    });
    
    console.log(`Filtered ${results.length} releases to ${filteredResults.length} (removed Digital)`);
    
    const groups = new Map();
    
    filteredResults.forEach(release => {
      const artistName = Array.isArray(release.artist) 
        ? release.artist.join(', ') 
        : release.artist;
      const format = release.format || 'Unknown';
      const key = `${artistName}|||${release.title}|||${format}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          artist: artistName,
          title: release.title,
          format: format,
          cover: null,
          releases: []
        });
      }
      
      const group = groups.get(key);
      group.releases.push(release);
    });
    
    // Convert to array and sort: CD format first, then by artist, title
    const grouped = Array.from(groups.values()).sort((a, b) => {
      // CD format first
      const aIsCD = a.format === 'CD';
      const bIsCD = b.format === 'CD';
      if (aIsCD && !bIsCD) return -1;
      if (!aIsCD && bIsCD) return 1;
      
      // Then sort by format name
      const formatCompare = a.format.localeCompare(b.format);
      if (formatCompare !== 0) return formatCompare;
      
      // Then by artist
      const artistCompare = a.artist.localeCompare(b.artist);
      if (artistCompare !== 0) return artistCompare;
      
      // Finally by title
      return a.title.localeCompare(b.title);
    });
    
    // Log grouped formats
    const groupedFormats = [...new Set(grouped.map(g => g.format))];
    console.log('Formats after grouping:', groupedFormats);
    console.log('Total groups:', grouped.length);
    
    return grouped;
  };

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();
    const trimmedArtist = searchArtist.trim();
    const trimmedValue = searchValue.trim();
    
    if (searchBy === 'title' && !trimmedQuery) {
      setError('Please enter an album title');
      return;
    }
    
    if ((searchBy === 'catalog' || searchBy === 'barcode') && !trimmedValue) {
      setError(`Please enter a ${searchBy === 'catalog' ? 'catalog number' : 'barcode'}`);
      return;
    }

    setSearching(true);
    setError('');
    
    try {
      let results;
      
      if (searchBy === 'catalog') {
        results = await musicService.searchByCatalogNumber(trimmedValue);
      } else if (searchBy === 'barcode') {
        results = await musicService.searchByBarcode(trimmedValue);
      } else {
        // Title search
        const query = trimmedQuery && trimmedArtist
          ? `${trimmedQuery} AND artist:${trimmedArtist}`
          : trimmedQuery || `artist:${trimmedArtist}`;
        
        results = await musicService.searchMusicBrainz(query);
      }
      
      setSearchResults(results);
      
      // Group results to reduce clutter
      const grouped = groupSearchResults(results);
      setGroupedResults(grouped);
      
      // Expand all groups initially if there are few results
      if (grouped.length <= 3) {
        setExpandedGroups(new Set(grouped.map((_, idx) => idx)));
      } else {
        setExpandedGroups(new Set());
      }
    } catch (err) {
      setError('Search failed: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectRelease = async (release, allReleasesInGroup = null) => {
    try {
      // Set the selected release and group for the metadata form
      setSelectedRelease(release);
      setSelectedReleaseGroup(allReleasesInGroup || []);
      
      // Show the metadata form instead of calling onReviewMetadata
      setShowMetadataForm(true);
    } catch (err) {
      console.error('Error in handleSelectRelease:', err);
      setError('Failed to load release details: ' + err.message);
    }
  };

  const toggleGroup = (groupIndex) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupIndex)) {
      newExpanded.delete(groupIndex);
    } else {
      newExpanded.add(groupIndex);
    }
    setExpandedGroups(newExpanded);
  };

  const handleManualEntry = () => {
    console.log('Manual entry button clicked');
    // For manual entry, we still use the old workflow (MusicForm)
    onHide();
    // Open form with empty data for manual entry
    if (onReviewMetadata) {
      console.log('Calling onReviewMetadata(null)');
      onReviewMetadata(null);
    } else {
      console.log('onReviewMetadata is not defined');
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchArtist('');
    setSearchBy('title');
    setSearchValue('');
    setSearchResults([]);
    setGroupedResults([]);
    setExpandedGroups(new Set());
    setError('');
    setShowMetadataForm(false);
    setSelectedRelease(null);
    setSelectedReleaseGroup([]);
    onHide();
  };

  const handleMetadataFormClose = () => {
    setShowMetadataForm(false);
    setSelectedRelease(null);
    setSelectedReleaseGroup([]);
  };

  const handleAlbumAdded = (album) => {
    // Close the metadata form and the main dialog
    setShowMetadataForm(false);
    setSelectedRelease(null);
    setSelectedReleaseGroup([]);
    onHide();
    
    // Album has been added successfully - no need to open edit dialog
    if (onAlbumAddedFromParent) {
      onAlbumAddedFromParent(album);
    }
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  return (
    <>
      <Modal show={show} onHide={handleClose} size="lg" centered style={{ zIndex: 10100 }} className="add-music-dialog">
      <Modal.Header closeButton className="add-music-dialog-header">
        <Modal.Title>Add New Album</Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="add-music-dialog-body">
        {/* Search Interface */}
        <div className="search-section mb-3">
          <h6 className="add-album-section-title mb-3">
            <BsSearch className="me-2" />
            Search for Albums on MusicBrainz
          </h6>
          
          {/* Search Type Selector */}
          <div className="search-type-selector mb-3">
            <button 
              className={`search-type-btn ${searchBy === 'title' ? 'active' : ''}`}
              onClick={() => setSearchBy('title')}
            >
              Album Title
            </button>
            <button 
              className={`search-type-btn ${searchBy === 'catalog' ? 'active' : ''}`}
              onClick={() => setSearchBy('catalog')}
            >
              Catalog Number
            </button>
            <button 
              className={`search-type-btn ${searchBy === 'barcode' ? 'active' : ''}`}
              onClick={() => setSearchBy('barcode')}
            >
              Barcode
            </button>
          </div>
          
          {/* Search Inputs */}
          {searchBy === 'title' ? (
            <div className="row g-2 mb-3">
              <div className="col-12 col-md-5">
                <Form.Control
                  ref={searchInputRef}
                  type="text"
                  placeholder="Album title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, handleSearch)}
                  className="search-input"
                />
              </div>
              <div className="col-12 col-md-5">
                <Form.Control
                  type="text"
                  placeholder="Artist (optional)..."
                  value={searchArtist}
                  onChange={(e) => setSearchArtist(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, handleSearch)}
                  className="search-input"
                />
              </div>
              <div className="col-12 col-md-2">
                <Button 
                  onClick={handleSearch}
                  disabled={searching}
                  className="search-btn w-100"
                >
                  {searching ? (
                    <span className="spinner-border spinner-border-sm" />
                  ) : (
                    <>
                      <BsSearch className="me-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="row g-2 mb-3">
              <div className="col-12 col-md-10">
                <Form.Control
                  type="text"
                  placeholder={searchBy === 'catalog' ? 'Enter catalog number...' : 'Enter barcode...'}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, handleSearch)}
                  className="search-input"
                />
              </div>
              <div className="col-12 col-md-2">
                <Button 
                  onClick={handleSearch}
                  disabled={searching}
                  className="search-btn w-100"
                >
                  {searching ? (
                    <span className="spinner-border spinner-border-sm" />
                  ) : (
                    <>
                      <BsSearch className="me-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          {/* Grouped Search Results */}
          {groupedResults.length > 0 && (
            <div className="grouped-search-results">
              <div className="results-header mb-3">
                <h6 className="results-title">
                  Search Results ({searchResults.length} {searchResults.length === 1 ? 'release' : 'releases'} in {groupedResults.length} {groupedResults.length === 1 ? 'album' : 'albums'})
                </h6>
              </div>
              
              {groupedResults.map((group, groupIndex) => {
                const isExpanded = expandedGroups.has(groupIndex);
                const hasMultipleVersions = group.releases.length > 1;
                
                return (
                  <div key={groupIndex} className="result-group mb-3">
                    {/* Group Card */}
                    <div 
                      className={`group-header-card ${hasMultipleVersions ? '' : 'single-version'} ${isExpanded ? 'expanded' : ''}`}
                    >
                      {/* Group Header */}
                      <div 
                        className="group-header-content"
                        onClick={hasMultipleVersions ? () => toggleGroup(groupIndex) : undefined}
                        style={{ cursor: hasMultipleVersions ? 'pointer' : 'default' }}
                      >
                        <LazyGroupCover releases={group.releases} title={group.title} />
                        
                        <div className="group-info">
                          <div className="group-title">{group.title}</div>
                          <div className="group-artist">{group.artist}</div>
                          <div className="group-format">
                            <Badge bg="secondary" className="format-badge">{group.format}</Badge>
                            {hasMultipleVersions && (
                              <span className="group-count ms-2">
                                {group.releases.length} versions
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {hasMultipleVersions ? (
                          <div className="group-toggle">
                            {isExpanded ? <BsChevronDown size={20} /> : <BsChevronRight size={20} />}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="select-release-btn-header"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRelease(group.releases[0], group.releases);
                            }}
                          >
                            <BsPencil className="me-1" />
                            Review & Add
                          </Button>
                        )}
                      </div>
                      
                      {/* Releases Table - Inside the card, only show if multiple versions */}
                      {hasMultipleVersions && isExpanded && (
                        <div className="releases-table-container">
                          <Table className="releases-table" hover>
                            <thead>
                              <tr>
                                <th>Year</th>
                                <th>Country</th>
                                <th>Label</th>
                                <th>Catalog</th>
                                <th>Barcode</th>
                                <th>Format</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.releases.map((release, releaseIndex) => (
                                <tr key={releaseIndex}>
                                  <td>{release.releaseYear || '-'}</td>
                                  <td>{release.country || '-'}</td>
                                  <td className="text-truncate" style={{ maxWidth: '150px' }}>
                                    {release.labels && release.labels.length > 0 ? release.labels.join(', ') : '-'}
                                  </td>
                                  <td>{release.catalogNumber || '-'}</td>
                                  <td className="text-truncate" style={{ maxWidth: '120px' }}>
                                    {release.barcode || '-'}
                                  </td>
                                  <td>{release.format || 'CD'}</td>
                                  <td>
                                    <Button
                                      size="sm"
                                      className="select-release-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectRelease(release, group.releases);
                                      }}
                                    >
                                      <BsPencil className="me-1" />
                                      Review & Add
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual Entry Option */}
        <div className="manual-entry-section">
          <div className="manual-entry-content">
            <h6 className="manual-entry-section-title mb-2">Can't find your album?</h6>
            <p className="text-muted mb-2">
              Manually enter album information without searching external databases.
            </p>
            <Button 
              variant="outline-secondary"
              onClick={handleManualEntry}
              className="manual-entry-btn"
            >
              <BsPencil className="me-2" />
              Manual Entry
            </Button>
          </div>
        </div>
      </Modal.Body>
    </Modal>

    {/* Album Metadata Form */}
    <AlbumMetadataForm
      show={showMetadataForm}
      onHide={handleMetadataFormClose}
      release={selectedRelease}
      allReleasesInGroup={selectedReleaseGroup}
      onAlbumAdded={handleAlbumAdded}
      defaultTitleStatus={defaultTitleStatus}
      onAddStart={onAddStart}
      onAddError={onAddError}
    />
    </>
  );
};

export default AddMusicDialog;