import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Tabs, Tab, Form, Alert, Table, Badge } from 'react-bootstrap';
import { BsX, BsSearch, BsUpcScan, BsPlus, BsPencil, BsChevronDown, BsChevronRight, BsCamera } from 'react-icons/bs';
import musicService from '../services/musicService';
import LazyGroupCover from './LazyGroupCover';
import { downscaleImage } from '../utils/downscaleImage';
import { decodeBarcode } from '../utils/decodeBarcode';
import AlbumMetadataForm from './AlbumMetadataForm';
import './AddMusicDialog.css';

interface MusicRelease {
  id?: string;
  musicbrainzReleaseId?: string;
  title?: string;
  artist?: string | string[];
  format?: string;
  country?: string;
  releaseYear?: string | number;
  labels?: string[];
  catalogNumber?: string;
  barcode?: string;
  [key: string]: any;
}

interface GroupedResult {
  artist: string;
  title: string;
  format: string;
  cover: string | null;
  releases: MusicRelease[];
}

interface CoverArtMeta {
  front?: {
    thumbnails?: Record<string, string>;
    url?: string;
  };
  back?: {
    thumbnails?: Record<string, string>;
    url?: string;
  };
}

interface ScanSummary {
  artist?: string | null;
  title?: string | null;
  year?: number | null;
  format?: string | null;
}

interface ScanResponse {
  llm_result?: ScanSummary;
  results?: MusicRelease[];
  confidence?: 'high' | 'low';
}

interface AddMusicDialogProps {
  show: boolean;
  onHide: () => void;
  onAddCd?: (cdData: any) => void;
  onAddCdFromMusicBrainz?: (releaseId: string, additionalData: any) => void;
  onAddCdByBarcode?: (barcode: string, additionalData: any) => void;
  onReviewMetadata?: (release: any, allReleasesInGroup?: any) => void;
  defaultTitleStatus?: string;
  onAlbumAdded?: (album: any) => void;
  onAddStart?: () => void;
  onAddError?: (error: Error) => void;
}

const AddMusicDialog: React.FC<AddMusicDialogProps> = ({ show, onHide, onAddCd, onAddCdFromMusicBrainz, onAddCdByBarcode, onReviewMetadata, defaultTitleStatus, onAlbumAdded: onAlbumAddedFromParent, onAddStart, onAddError }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchArtist, setSearchArtist] = useState('');
  const [searchBy, setSearchBy] = useState('photo'); // 'photo', 'title', 'catalog', 'barcode'
  const [scanning, setScanning] = useState(false);
  const [addingReleaseId, setAddingReleaseId] = useState<string | null>(null);
  const [decodingBarcode, setDecodingBarcode] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<MusicRelease[]>([]);
  const [groupedResults, setGroupedResults] = useState<GroupedResult[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // New state for metadata form
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<MusicRelease | null>(null);
  const [selectedReleaseGroup, setSelectedReleaseGroup] = useState<MusicRelease[]>([]);

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (show && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [show]);

  // Group search results by artist + title + format
  const groupSearchResults = (results: MusicRelease[]): GroupedResult[] => {
    // Log all unique formats in the results
    const allFormats = [...new Set(results.map((r: MusicRelease) => r.format || 'Unknown'))];
    console.log('All formats in search results:', allFormats);

    // Filter out Digital format only
    const filteredResults = results.filter((release: MusicRelease) => {
      const format = release.format || 'Unknown';
      const isDigital = format.toLowerCase().includes('digital');
      return !isDigital;
    });
    
    console.log(`Filtered ${results.length} releases to ${filteredResults.length} (removed Digital)`);
    
    const groups = new Map();
    
    filteredResults.forEach((release: MusicRelease) => {
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

  /**
   * Runs a search from explicit values rather than from state, so a caller that
   * just decoded a barcode can search with it without waiting for a re-render.
   */
  const runSearch = async (
    mode: string,
    value: string,
    query: string = '',
    artist: string = ''
  ) => {
    const trimmedValue = value.trim();
    const trimmedQuery = query.trim();
    const trimmedArtist = artist.trim();

    setSearching(true);
    setError('');
    
    try {
      let results: MusicRelease[];

      if (mode === 'catalog') {
        results = await musicService.searchByCatalogNumber(trimmedValue) as MusicRelease[];
      } else if (mode === 'barcode') {
        results = await musicService.searchByBarcode(trimmedValue) as MusicRelease[];
      } else {
        // Title/Artist search. Quoting the terms keeps Lucene from choking on
        // names like "AC/DC" or titles like "Live: 1975"; inside quotes only the
        // quote and the backslash still need escaping.
        const quote = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;
        const terms: string[] = [];
        if (trimmedQuery) terms.push(quote(trimmedQuery));
        if (trimmedArtist) terms.push(`artist:${quote(trimmedArtist)}`);
        const query = terms.join(' AND ');

        results = await musicService.searchMusicBrainz(query) as MusicRelease[];
      }

      setSearchResults(results);
      setHasSearched(true);

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
      setError('Search failed: ' + (err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();
    const trimmedArtist = searchArtist.trim();
    const trimmedValue = searchValue.trim();

    // Allow searching by album title OR artist (artist-only search supported)
    if (searchBy === 'title' && !trimmedQuery && !trimmedArtist) {
      setError('Please enter an album title or artist');
      return;
    }

    if ((searchBy === 'catalog' || searchBy === 'barcode') && !trimmedValue) {
      setError(`Please enter a ${searchBy === 'catalog' ? 'catalog number' : 'barcode'}`);
      return;
    }

    await runSearch(searchBy, trimmedValue, trimmedQuery, trimmedArtist);
  };

  /** Opens the camera/picker. Must be called synchronously from a tap. */
  const openCamera = () => {
    setSearchBy('photo');
    photoInputRef.current?.click();
  };

  /**
   * Photo path: pick (or shoot) a sleeve, downscale it in the browser, and scan.
   *
   * The scan starts on selection -- no extra "Scan" tap -- because the whole
   * point is adding a CD in as few taps as possible. Downscaling client-side
   * keeps a 4MB phone photo from crossing the network.
   */
  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setError('');
    setScanSummary(null);

    try {
      const { base64, mimeType } = await downscaleImage(file);
      const scan = await musicService.scanAlbumCover(base64, mimeType) as ScanResponse;

      const results = scan?.results || [];
      setSearchResults(results);
      setGroupedResults(groupSearchResults(results));
      setHasSearched(true);
      setScanSummary(scan?.llm_result || null);

      // Prefill the text fields so a failed scan can be corrected by hand
      // instead of retyping everything.
      if (scan?.llm_result?.title) setSearchQuery(scan.llm_result.title);
      if (scan?.llm_result?.artist) setSearchArtist(scan.llm_result.artist);

      const grouped = groupSearchResults(results);
      setExpandedGroups(grouped.length <= 3 ? new Set(grouped.map((_, idx) => idx)) : new Set());
    } catch (err) {
      setError((err as Error).message || 'Could not identify album from the photo');
    } finally {
      setScanning(false);
      // A file input keeps its value, so picking the same photo again would not
      // fire another change event.
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  /**
   * Read the barcode off a photo, then search with it.
   *
   * A barcode pins the exact edition, which a cover photo cannot do -- two
   * pressings share the same artwork. Decoding from a still rather than a live
   * feed keeps this working over plain HTTP, where getUserMedia is blocked.
   */
  const handleBarcodePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDecodingBarcode(true);
    setError('');

    try {
      const barcode = await decodeBarcode(file);

      if (!barcode) {
        setError('No barcode found in that photo. Try again closer, or type it in.');
        return;
      }

      // Show what was read so a misread can be corrected by hand.
      setSearchValue(barcode);
      await runSearch('barcode', barcode);
    } catch (err) {
      setError((err as Error).message || 'Could not read the barcode');
    } finally {
      setDecodingBarcode(false);
      if (barcodeInputRef.current) barcodeInputRef.current.value = '';
    }
  };

  /**
   * One-tap add: store the release as-is, straight from the result list.
   *
   * The metadata screen has no required field -- the server picks the Cover Art
   * Archive artwork itself -- so it stays available through Review for when you
   * do want to set a price or pick among several covers.
   */
  const handleQuickAdd = async (release: MusicRelease) => {
    const releaseId = release?.musicbrainzReleaseId || release?.id;
    if (!releaseId || addingReleaseId) return;

    setAddingReleaseId(releaseId);
    setError('');

    try {
      const album = await musicService.addAlbumFromMusicBrainz(releaseId, {
        titleStatus: defaultTitleStatus || undefined
      });

      if (onAlbumAddedFromParent) onAlbumAddedFromParent(album);
      handleClose();
    } catch (err) {
      // Keep the result list up so another edition can be tried right away.
      setError((err as Error).message || 'Failed to add album');
    } finally {
      setAddingReleaseId(null);
    }
  };

  const handleSelectRelease = async (release: MusicRelease, allReleasesInGroup: MusicRelease[] | null = null) => {
    try {
      // Set the selected release and group for the metadata form
      setSelectedRelease(release);
      setSelectedReleaseGroup(allReleasesInGroup || []);
      
      // Show the metadata form instead of calling onReviewMetadata
      setShowMetadataForm(true);
    } catch (err) {
      console.error('Error in handleSelectRelease:', err);
      setError('Failed to load release details: ' + (err as Error).message);
    }
  };

  const toggleGroup = (groupIndex: number) => {
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
    setSearchBy('photo');
    setSearchValue('');
    setSearchResults([]);
    setGroupedResults([]);
    setHasSearched(false);
    setScanSummary(null);
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

  const handleAlbumAdded = (album: any) => {
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

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
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
        {/* Always mounted: openCamera() clicks it from within the user's tap,
            which would be impossible if it appeared only after a state change. */}
        <input
          ref={photoInputRef}
          data-testid="album-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          onChange={handlePhotoSelected}
          className="photo-scan-input"
        />

        <input
          ref={barcodeInputRef}
          data-testid="barcode-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          onChange={handleBarcodePhoto}
          className="photo-scan-input"
        />

        {/* Search Interface */}
        <div className="search-section mb-3">
          <h6 className="add-album-section-title mb-3">
            <BsSearch className="me-2" />
            Search for Albums on MusicBrainz
          </h6>
          
          {/* Search Type Selector */}
          <div className="search-type-selector mb-3">
            <button
              className={`search-type-btn ${searchBy === 'photo' ? 'active' : ''}`}
              onClick={openCamera}
            >
              <BsCamera className="me-1" />
              Photo
            </button>
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
          {searchBy === 'photo' ? (
            <div className="photo-scan-section mb-3">
              <Button
                onClick={openCamera}
                disabled={scanning}
                className="search-btn w-100 photo-scan-btn"
              >
                {scanning ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Reading the cover...
                  </>
                ) : (
                  <>
                    <BsCamera className="me-2" />
                    Take a photo of the cover
                  </>
                )}
              </Button>
              {scanSummary && (
                <div className="photo-scan-summary mt-2">
                  Read from the cover:{' '}
                  <strong>{[scanSummary.artist, scanSummary.title].filter(Boolean).join(' - ')}</strong>
                  {scanSummary.year ? ` (${scanSummary.year})` : ''}
                </div>
              )}
            </div>
          ) : searchBy === 'title' ? (
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
                  inputMode={searchBy === 'barcode' ? 'numeric' : 'text'}
                  autoComplete="off"
                  autoCapitalize={searchBy === 'barcode' ? 'off' : 'characters'}
                  placeholder={searchBy === 'catalog' ? 'Enter catalog number...' : 'Enter barcode...'}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, handleSearch)}
                  className="search-input"
                />
              </div>
              {searchBy === 'barcode' && (
                <div className="col-12">
                  <Button
                    variant="outline-light"
                    className="w-100 barcode-scan-btn"
                    disabled={decodingBarcode || searching}
                    onClick={() => barcodeInputRef.current?.click()}
                  >
                    {decodingBarcode ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Reading the barcode...
                      </>
                    ) : (
                      <>
                        <BsUpcScan className="me-2" />
                        Scan the barcode
                      </>
                    )}
                  </Button>
                </div>
              )}
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
          {hasSearched && !searching && !scanning && groupedResults.length === 0 && (
            <div className="search-empty-state text-center py-4">
              <BsSearch size={28} className="mb-2 opacity-50" />
              <div>No matching release found.</div>
              <small className="text-muted">
                Try the artist name as well, or a barcode; you can also add the album by hand.
              </small>
            </div>
          )}

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
                          <div className="release-actions" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              className="quick-add-btn"
                              disabled={addingReleaseId !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickAdd(group.releases[0]);
                              }}
                            >
                              {addingReleaseId === (group.releases[0]?.musicbrainzReleaseId || group.releases[0]?.id) ? (
                                <span className="spinner-border spinner-border-sm" />
                              ) : (
                                <>
                                  <BsPlus className="me-1" />
                                  Add
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              className="select-release-btn-header"
                              disabled={addingReleaseId !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectRelease(group.releases[0], group.releases);
                              }}
                            >
                              <BsPencil className="me-1" />
                              Review
                            </Button>
                          </div>
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
                                    <div className="release-actions">
                                      <Button
                                        size="sm"
                                        className="quick-add-btn"
                                        disabled={addingReleaseId !== null}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickAdd(release);
                                        }}
                                      >
                                        {addingReleaseId === (release.musicbrainzReleaseId || release.id) ? (
                                          <span className="spinner-border spinner-border-sm" />
                                        ) : (
                                          <>
                                            <BsPlus className="me-1" />
                                            Add
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline-secondary"
                                        className="select-release-btn"
                                        disabled={addingReleaseId !== null}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectRelease(release, group.releases);
                                        }}
                                      >
                                        <BsPencil className="me-1" />
                                        Review
                                      </Button>
                                    </div>
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