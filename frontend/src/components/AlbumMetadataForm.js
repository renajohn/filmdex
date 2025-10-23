import React, { useState, useRef, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Alert, Card, Image } from 'react-bootstrap';
import { BsX, BsUpload, BsCheck } from 'react-icons/bs';
import musicService from '../services/musicService';
import CoverModal from './CoverModal';
import './AlbumMetadataForm.css';

const AlbumMetadataForm = ({ 
  show, 
  onHide, 
  release, 
  allReleasesInGroup = [], 
  onAlbumAdded,
  defaultTitleStatus,
  onAddStart,
  onAddError
}) => {
  const fileInputRef = useRef(null);
  const backCoverInputRef = useRef(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadMessageType, setUploadMessageType] = useState('success');
  const [selectedFrontCoverIndex, setSelectedFrontCoverIndex] = useState(null);
  const [selectedBackCoverIndex, setSelectedBackCoverIndex] = useState(null);
  const [customCoverPreview, setCustomCoverPreview] = useState(null);
  const [customBackCoverPreview, setCustomBackCoverPreview] = useState(null);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [modalCoverData, setModalCoverData] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({});
  const [sortedCovers, setSortedCovers] = useState([]);
  const [releaseCoverMap, setReleaseCoverMap] = useState({}); // { releaseId: { front: {display, full, sizes}, back: {...} } }
  const [coversLoading, setCoversLoading] = useState(false);
  const [formData, setFormData] = useState({
    ownership: {
      condition: '',
      notes: '',
      purchasedAt: '',
      priceChf: ''
    }
  });
  const [loading, setLoading] = useState(false);

  // Extract available cover art options from fetched cover map (fallback to any embedded)
  const availableCovers = React.useMemo(() => {
    console.log('AlbumMetadataForm - Processing covers:', {
      release: release?.title,
      allReleasesInGroup: allReleasesInGroup?.length
    });
    
    const covers = [];
    
    // Prefer fetched cover art map
    const group = Array.isArray(allReleasesInGroup) && allReleasesInGroup.length > 0 ? allReleasesInGroup : (release ? [release] : []);
    group.forEach(r => {
      const releaseId = r?.musicbrainzReleaseId || r?.id;
      const meta = releaseId ? releaseCoverMap[releaseId] : null;
      if (meta?.front) {
        covers.push({
          url: meta.front.display,
          fullUrl: meta.front.full,
          sizes: meta.front.sizes,
          type: 'front',
          release: r,
          country: r.country,
          year: r.releaseYear,
          catalogNumber: r.catalogNumber
        });
      }
      if (meta?.back) {
        covers.push({
          url: meta.back.display,
          fullUrl: meta.back.full,
          sizes: meta.back.sizes,
          type: 'back',
          release: r,
          country: r.country,
          year: r.releaseYear,
          catalogNumber: r.catalogNumber
        });
      }
    });

    // Remove duplicates based on URL
    const uniqueCovers = covers.filter((cover, index, self) => 
      index === self.findIndex(c => c.url === cover.url)
    );

    console.log('AlbumMetadataForm - Final covers:', uniqueCovers.length, uniqueCovers);
    return uniqueCovers;
  }, [allReleasesInGroup, release, releaseCoverMap]);

  // Lazily fetch cover art for the selected release and up to 8 in the group
  useEffect(() => {
    const fetchCovers = async () => {
      try {
        setCoversLoading(true);
        const candidates = [];
        if (release?.musicbrainzReleaseId) candidates.push(release.musicbrainzReleaseId);
        if (Array.isArray(allReleasesInGroup)) {
          allReleasesInGroup.forEach(r => {
            const id = r?.musicbrainzReleaseId || r?.id;
            if (id) candidates.push(id);
          });
        }
        const uniqueIds = Array.from(new Set(candidates));
        const missing = uniqueIds.filter(id => !(id in releaseCoverMap));
        if (missing.length === 0) return;
        const results = await Promise.allSettled(missing.map(id => musicService.getCoverArt(id)));
        const nextMap = { ...releaseCoverMap };
        results.forEach((res, idx) => {
          const id = missing[idx];
          if (res.status === 'fulfilled' && res.value) {
            const frontMeta = res.value?.front;
            const backMeta = res.value?.back;
            const front = frontMeta ? {
              display: frontMeta.thumbnails?.['500'] || frontMeta.thumbnails?.['250'] || frontMeta.url || null,
              full: frontMeta.thumbnails?.['1200'] || frontMeta.url || null,
              sizes: Object.keys(frontMeta.thumbnails || {})
            } : null;
            const back = backMeta ? {
              display: backMeta.thumbnails?.['500'] || backMeta.thumbnails?.['250'] || backMeta.url || null,
              full: backMeta.thumbnails?.['1200'] || backMeta.url || null,
              sizes: Object.keys(backMeta.thumbnails || {})
            } : null;
            if (front || back) nextMap[id] = { front, back };
          }
        });
        setReleaseCoverMap(nextMap);
      } finally {
        setCoversLoading(false);
      }
    };
    fetchCovers();
  }, [release, allReleasesInGroup]);

  // Sort covers by size after dimensions are loaded
  useEffect(() => {
    if (availableCovers.length > 0 && Object.keys(imageDimensions).length > 0) {
      const sorted = [...availableCovers].sort((a, b) => {
        const aDims = imageDimensions[a.url] || { width: 0, height: 0 };
        const bDims = imageDimensions[b.url] || { width: 0, height: 0 };
        const aArea = aDims.width * aDims.height;
        const bArea = bDims.width * bDims.height;
        return bArea - aArea; // Sort largest first
      });
      console.log('Sorted covers by dimensions:', sorted.map(c => ({ type: c.type, url: c.url, area: (imageDimensions[c.url]?.width || 0) * (imageDimensions[c.url]?.height || 0) })));
      setSortedCovers(sorted);
    } else if (availableCovers.length > 0) {
      // If no dimensions loaded yet, use original order
      console.log('Using original cover order (no dimensions yet):', availableCovers.map(c => ({ type: c.type, url: c.url })));
      setSortedCovers(availableCovers);
    }
  }, [availableCovers, imageDimensions]);

  // Auto-select first front and back covers when available (largest first)
  useEffect(() => {
    if (sortedCovers.length > 0) {
      // Find largest front cover (first in sorted list)
      const frontCovers = sortedCovers.filter(cover => cover.type === 'front');
      if (frontCovers.length > 0 && selectedFrontCoverIndex === null) {
        const largestFrontCover = frontCovers[0]; // First (largest) front cover
        const largestFrontIndex = sortedCovers.findIndex(c => c.url === largestFrontCover.url);
        console.log('Auto-selecting front cover:', largestFrontCover.url, 'at index:', largestFrontIndex);
        setSelectedFrontCoverIndex(largestFrontIndex);
      }

      // Find largest back cover (first in sorted list)
      const backCovers = sortedCovers.filter(cover => cover.type === 'back');
      if (backCovers.length > 0 && selectedBackCoverIndex === null) {
        const largestBackCover = backCovers[0]; // First (largest) back cover
        const largestBackIndex = sortedCovers.findIndex(c => c.url === largestBackCover.url);
        console.log('Auto-selecting back cover:', largestBackCover.url, 'at index:', largestBackIndex);
        setSelectedBackCoverIndex(largestBackIndex);
      }
    }
  }, [sortedCovers, selectedFrontCoverIndex, selectedBackCoverIndex]);

  // Load image dimensions for covers
  const loadImageDimensions = (imageUrl) => {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
      };
      img.src = imageUrl;
    });
  };

  // Load dimensions for all available covers
  useEffect(() => {
    const loadAllDimensions = async () => {
      const dimensions = {};
      for (const cover of availableCovers) {
        const key = cover.fullUrl || cover.url;
        if (!imageDimensions[key]) {
          const dims = await loadImageDimensions(key);
          dimensions[key] = dims;
        }
      }
      if (Object.keys(dimensions).length > 0) {
        setImageDimensions(prev => ({ ...prev, ...dimensions }));
      }
    };

    if (availableCovers.length > 0) {
      loadAllDimensions();
    }
  }, [availableCovers]);

  const formatImageSize = (width, height) => {
    if (width === 0 || height === 0) return 'Loading...';
    
    // Cap display at 1200px as mentioned
    const displayWidth = Math.min(width, 1200);
    const displayHeight = Math.min(height, 1200);
    
    return `${displayWidth}×${displayHeight}px`;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ownership: {
        ...prev.ownership,
        [field]: value
      }
    }));
  };

  const handleFrontCoverSelect = (index) => {
    setSelectedFrontCoverIndex(index);
    setCustomCoverPreview(null);
  };

  const handleBackCoverSelect = (index) => {
    setSelectedBackCoverIndex(index);
    setCustomBackCoverPreview(null);
  };

  const handleCoverClick = (cover, coverType) => {
    setModalCoverData({
      url: cover.fullUrl || cover.url,
      title: release.title,
      artist: release.artist,
      coverType: coverType
    });
    setShowCoverModal(true);
  };

  const handleCustomCoverUpload = async (event, type = 'front') => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadMessage('Please select an image file');
      setUploadMessageType('danger');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadMessage('File size must be less than 10MB');
      setUploadMessageType('danger');
      return;
    }

    setUploadingCover(true);
    setUploadMessage(null);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        if (type === 'front') {
          setCustomCoverPreview(e.target.result);
          setSelectedFrontCoverIndex(-1); // -1 indicates custom cover
        } else {
          setCustomBackCoverPreview(e.target.result);
          setSelectedBackCoverIndex(-1); // -1 indicates custom cover
        }
      };
      reader.readAsDataURL(file);

      setUploadMessage(`${type === 'front' ? 'Front' : 'Back'} cover art ready for upload`);
      setUploadMessageType('success');
    } catch (error) {
      console.error('Error processing cover art:', error);
      setUploadMessage('Error processing cover art');
      setUploadMessageType('danger');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('AlbumMetadataForm: Starting album submission...');
    setLoading(true);
    
    // Notify parent to show overlay and close dialog immediately
    try {
      if (onAddStart) onAddStart();
    } catch (_) {}
    try {
      onHide();
    } catch (_) {}

    try {
      let albumData = {
        ...release,
        ownership: formData.ownership
      };

      // Prepare cover art data to send to backend
      let coverArtData = {};
      
      // Handle front cover art
      if (selectedFrontCoverIndex === -1) {
        // Handle custom front cover
        if (customCoverPreview && fileInputRef.current?.files[0]) {
          coverArtData.customFrontCover = fileInputRef.current.files[0];
        }
      } else if (selectedFrontCoverIndex >= 0 && sortedCovers[selectedFrontCoverIndex]) {
        // Handle selected front cover art from available options
        const selectedCover = sortedCovers[selectedFrontCoverIndex];
        coverArtData.frontCoverUrl = selectedCover.fullUrl || selectedCover.url;
      }

      // Handle back cover art
      if (selectedBackCoverIndex === -1) {
        // Handle custom back cover
        if (customBackCoverPreview && backCoverInputRef.current?.files[0]) {
          coverArtData.customBackCover = backCoverInputRef.current.files[0];
        }
      } else if (selectedBackCoverIndex >= 0 && sortedCovers[selectedBackCoverIndex]) {
        // Handle selected back cover art from available options
        const selectedCover = sortedCovers[selectedBackCoverIndex];
        coverArtData.backCoverUrl = selectedCover.fullUrl || selectedCover.url;
      }

      console.log('AlbumMetadataForm: Cover art data:', coverArtData);
      console.log('AlbumMetadataForm: Calling addAlbumFromMusicBrainz with releaseId:', release.musicbrainzReleaseId);

      // Add the album with cover art information
      const newAlbum = await musicService.addAlbumFromMusicBrainz(
        release.musicbrainzReleaseId, 
        {
          ...formData.ownership,
          coverArtData: coverArtData,
          titleStatus: defaultTitleStatus || undefined
        }
      );

      console.log('AlbumMetadataForm: Album added successfully:', newAlbum);

      // If custom covers were selected, upload them now
      try {
        if (selectedFrontCoverIndex === -1 && fileInputRef.current?.files[0]) {
          await musicService.uploadCover(newAlbum.id, fileInputRef.current.files[0]);
        }
        if (selectedBackCoverIndex === -1 && backCoverInputRef.current?.files[0]) {
          await musicService.uploadBackCover(newAlbum.id, backCoverInputRef.current.files[0]);
        }
      } catch (uploadErr) {
        console.error('AlbumMetadataForm: Error uploading custom cover(s):', uploadErr);
      }

      // Fetch updated album so DB cover paths are reflected
      let finalAlbum = newAlbum;
      try {
        finalAlbum = await musicService.getAlbumById(newAlbum.id);
      } catch (fetchErr) {
        console.warn('AlbumMetadataForm: Failed to fetch album after uploads, using created album:', fetchErr);
      }

      // Notify parent that album was added
      if (onAlbumAdded) {
        onAlbumAdded(finalAlbum);
      }

    } catch (error) {
      console.error('AlbumMetadataForm: Error adding album:', error);
      setUploadMessage('Failed to add album: ' + error.message);
      setUploadMessageType('danger');
      try {
        if (onAddError) onAddError(error);
      } catch (_) {}
    } finally {
      console.log('AlbumMetadataForm: Setting loading to false');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      ownership: {
        condition: '',
        notes: '',
        purchasedAt: '',
        priceChf: ''
      }
    });
    setSelectedFrontCoverIndex(null);
    setSelectedBackCoverIndex(null);
    setCustomCoverPreview(null);
    setCustomBackCoverPreview(null);
    setShowCoverModal(false);
    setModalCoverData(null);
    setImageDimensions({});
    setSortedCovers([]);
    setUploadMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (backCoverInputRef.current) {
      backCoverInputRef.current.value = '';
    }
    onHide();
  };

  if (!release) return null;

  console.log('AlbumMetadataForm render - release:', release);
  console.log('AlbumMetadataForm render - allReleasesInGroup:', allReleasesInGroup);
  console.log('AlbumMetadataForm render - availableCovers:', availableCovers);

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <div className="album-info-inline">
                <div className="album-info-main">
                  <span className="album-title">{release.title || '-'}</span>
                  <span className="album-sep">—</span>
                  <span className="album-artist">{Array.isArray(release.artist) ? release.artist.join(', ') : release.artist || '-'}</span>
                </div>
                <div className="album-info-meta">
                  <span>{release.format || '-'}</span>
                  <span className="dot">•</span>
                  <span>{release.country || '-'}</span>
                  <span className="dot">•</span>
                  <span>{release.releaseYear || '-'}</span>
                </div>
              </div>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          {/* Album Info Display (super compact, inline) */}
         
          {/* Cover Art Selection */}
          <Card className="mb-4 dark-card">
            <Card.Header className="dark-card-header">
              <h5 className="text-light">Cover Art</h5>
            </Card.Header>
            <Card.Body className="dark-card-body">
              {coversLoading && (
                <div className="text-muted mb-3">Loading cover thumbnails…</div>
              )}
              {sortedCovers.length > 0 && (
                <div className="cover-selection mb-4">
                  {/* Front Cover Selection */}
                  <div className="cover-type-section mb-4">
                    <Form.Label className="text-light">Select Front Cover:</Form.Label>
                    <div className="cover-thumbnails">
                      {sortedCovers.filter(cover => cover.type === 'front').map((cover, index) => {
                        const keyUrl = cover.fullUrl || cover.url;
                        const originalIndex = sortedCovers.findIndex(c => (c.fullUrl || c.url) === keyUrl);
                        return (
                          <div 
                            key={originalIndex}
                            className={`cover-thumbnail ${selectedFrontCoverIndex === originalIndex ? 'selected' : ''}`}
                            onClick={() => handleFrontCoverSelect(originalIndex)}
                          >
                            <Image 
                              src={cover.fullUrl || cover.url} 
                              alt={`Front cover ${index + 1}`}
                              thumbnail
                              className="cover-image cover-clickable loading"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCoverClick(cover, 'Front');
                              }}
                              onLoad={(e) => { e.target.classList.remove('loading'); }}
                            />
                            {selectedFrontCoverIndex === originalIndex && (
                              <div className="selected-indicator">
                                <BsCheck />
                              </div>
                            )}
                            <div className="cover-info">
                              <small className="text-light">Front</small>
                              <small className="text-muted">{cover.country} {cover.year}</small>
                              {cover.catalogNumber && <small className="text-muted">{cover.catalogNumber}</small>}
                              <div className="text-muted">
                                <small className="cover-dimensions me-2">
                                  {formatImageSize(
                                    imageDimensions[keyUrl]?.width || 0,
                                    imageDimensions[keyUrl]?.height || 0
                                  )}
                                </small>
                                
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Back Cover Selection */}
                  <div className="cover-type-section mb-4">
                    <Form.Label className="text-light">Select Back Cover:</Form.Label>
                    <div className="cover-thumbnails">
                      {sortedCovers.filter(cover => cover.type === 'back').map((cover, index) => {
                        const keyUrl = cover.fullUrl || cover.url;
                        const originalIndex = sortedCovers.findIndex(c => (c.fullUrl || c.url) === keyUrl);
                        return (
                          <div 
                            key={originalIndex}
                            className={`cover-thumbnail ${selectedBackCoverIndex === originalIndex ? 'selected' : ''}`}
                            onClick={() => handleBackCoverSelect(originalIndex)}
                          >
                            <Image 
                              src={cover.fullUrl || cover.url} 
                              alt={`Back cover ${index + 1}`}
                              thumbnail
                              className="cover-image cover-clickable loading"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCoverClick(cover, 'Back');
                              }}
                              onLoad={(e) => { e.target.classList.remove('loading'); }}
                            />
                            {selectedBackCoverIndex === originalIndex && (
                              <div className="selected-indicator">
                                <BsCheck />
                              </div>
                            )}
                            <div className="cover-info">
                              <small className="text-light">Back</small>
                              <small className="text-muted">{cover.country} {cover.year}</small>
                              {cover.catalogNumber && <small className="text-muted">{cover.catalogNumber}</small>}
                              <div className="text-muted">
                                <small className="cover-dimensions me-2">
                                  {formatImageSize(
                                    imageDimensions[keyUrl]?.width || 0,
                                    imageDimensions[keyUrl]?.height || 0
                                  )}
                                </small>
                                
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Cover Upload */}
              <div className="custom-cover-upload">
                <Form.Label className="text-light">Or Upload Custom Cover Art:</Form.Label>
                <div className="upload-area">
                  <div className="upload-buttons">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleCustomCoverUpload(e, 'front')}
                      style={{ display: 'none' }}
                    />
                    <Button
                      variant="outline-light"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="upload-button me-2"
                    >
                      <BsUpload className="me-2" />
                      {uploadingCover ? 'Processing...' : 'Front Cover'}
                    </Button>
                    
                    <input
                      ref={backCoverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleCustomCoverUpload(e, 'back')}
                      style={{ display: 'none' }}
                    />
                    <Button
                      variant="outline-light"
                      onClick={() => backCoverInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="upload-button"
                    >
                      <BsUpload className="me-2" />
                      {uploadingCover ? 'Processing...' : 'Back Cover'}
                    </Button>
                  </div>
                  
                  {(customCoverPreview || customBackCoverPreview) && (
                    <div className="custom-cover-previews mt-3">
                      {customCoverPreview && (
                        <div className="custom-cover-preview me-3">
                          <Image 
                            src={customCoverPreview} 
                            alt="Custom front cover preview"
                            thumbnail
                            className="cover-image"
                          />
                          <div className="selected-indicator">
                            <BsCheck />
                          </div>
                          <div className="cover-info">
                            <small className="text-light">Front</small>
                          </div>
                        </div>
                      )}
                      {customBackCoverPreview && (
                        <div className="custom-cover-preview">
                          <Image 
                            src={customBackCoverPreview} 
                            alt="Custom back cover preview"
                            thumbnail
                            className="cover-image"
                          />
                          <div className="selected-indicator">
                            <BsCheck />
                          </div>
                          <div className="cover-info">
                            <small className="text-light">Back</small>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {uploadMessage && (
                <Alert variant={uploadMessageType} className="mt-2">
                  {uploadMessage}
                </Alert>
              )}
            </Card.Body>
          </Card>

          {/* Ownership Information */}
          <Card className="mb-4 dark-card">
            <Card.Header className="dark-card-header">
              <h5 className="text-light">Ownership Information</h5>
            </Card.Header>
            <Card.Body className="dark-card-body">
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Purchase Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={formData.ownership.purchasedAt}
                      onChange={(e) => handleInputChange('purchasedAt', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Price (CHF)</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.ownership.priceChf}
                      onChange={(e) => handleInputChange('priceChf', e.target.value)}
                      placeholder="0.00"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Condition</Form.Label>
                    <Form.Select
                      value={formData.ownership.condition}
                      onChange={(e) => handleInputChange('condition', e.target.value)}
                    >
                      <option value="">Select condition</option>
                      <option value="Mint">Mint</option>
                      <option value="Near Mint">Near Mint</option>
                      <option value="Very Good">Very Good</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Poor">Poor</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Notes</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={formData.ownership.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      placeholder="Additional notes..."
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={handleSubmit} 
          disabled={loading}
        >
          {loading ? 'Adding Album...' : 'Add Album'}
        </Button>
      </Modal.Footer>
      
      {/* Cover Modal */}
      {modalCoverData && (
        <CoverModal
          isOpen={showCoverModal}
          onClose={() => setShowCoverModal(false)}
          coverUrl={modalCoverData.url}
          title={modalCoverData.title}
          artist={modalCoverData.artist}
          coverType={modalCoverData.coverType}
        />
      )}
    </Modal>
  );
};

export default AlbumMetadataForm;
