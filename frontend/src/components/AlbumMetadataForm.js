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
  const [formData, setFormData] = useState({
    ownership: {
      condition: '',
      notes: '',
      purchasedAt: '',
      priceChf: ''
    }
  });
  const [loading, setLoading] = useState(false);

  // Extract available cover art options from all releases in the group
  const availableCovers = React.useMemo(() => {
    console.log('AlbumMetadataForm - Processing covers:', {
      release: release?.title,
      releaseCoverArt: release?.coverArt,
      allReleasesInGroup: allReleasesInGroup?.length,
      groupCovers: allReleasesInGroup?.map(r => ({ title: r.title, coverArt: r.coverArt }))
    });
    
    const covers = [];
    
    // First, add covers from all releases in the group
    if (allReleasesInGroup && allReleasesInGroup.length > 0) {
      allReleasesInGroup.forEach(r => {
        console.log('Processing release:', r.title, 'coverArt:', r.coverArt);
        
        // Handle both old format (string) and new format (object)
        if (typeof r.coverArt === 'string' && r.coverArt) {
          // Old format - single cover art URL
          covers.push({
            url: r.coverArt,
            type: 'front',
            release: r,
            country: r.country,
            year: r.releaseYear,
            catalogNumber: r.catalogNumber
          });
        } else if (r.coverArt && typeof r.coverArt === 'object') {
          // New format - object with front/back
          if (r.coverArt.front) {
            covers.push({
              url: r.coverArt.front,
              type: 'front',
              release: r,
              country: r.country,
              year: r.releaseYear,
              catalogNumber: r.catalogNumber
            });
          }
          if (r.coverArt.back) {
            covers.push({
              url: r.coverArt.back,
              type: 'back',
              release: r,
              country: r.country,
              year: r.releaseYear,
              catalogNumber: r.catalogNumber
            });
          }
        }
      });
    }
    
    // If no covers from group, try the selected release
    if (covers.length === 0 && release) {
      console.log('No covers from group, trying selected release:', release.title, 'coverArt:', release.coverArt);
      
      if (typeof release.coverArt === 'string' && release.coverArt) {
        // Old format - single cover art URL
        covers.push({
          url: release.coverArt,
          type: 'front',
          release,
          country: release.country,
          year: release.releaseYear,
          catalogNumber: release.catalogNumber
        });
      } else if (release.coverArt && typeof release.coverArt === 'object') {
        // New format - object with front/back
        if (release.coverArt.front) {
          covers.push({
            url: release.coverArt.front,
            type: 'front',
            release,
            country: release.country,
            year: release.releaseYear,
            catalogNumber: release.catalogNumber
          });
        }
        if (release.coverArt.back) {
          covers.push({
            url: release.coverArt.back,
            type: 'back',
            release,
            country: release.country,
            year: release.releaseYear,
            catalogNumber: release.catalogNumber
          });
        }
      }
    }

    // Remove duplicates based on URL
    const uniqueCovers = covers.filter((cover, index, self) => 
      index === self.findIndex(c => c.url === cover.url)
    );

    console.log('AlbumMetadataForm - Final covers:', uniqueCovers.length, uniqueCovers);
    return uniqueCovers;
  }, [allReleasesInGroup, release]);

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
        if (!imageDimensions[cover.url]) {
          const dims = await loadImageDimensions(cover.url);
          dimensions[cover.url] = dims;
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
      url: cover.url,
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
        coverArtData.frontCoverUrl = selectedCover.url;
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
        coverArtData.backCoverUrl = selectedCover.url;
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
        <Modal.Title>Add Album Metadata</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          {/* Album Info Display (Read-only) */}
          <Card className="mb-4 dark-card">
            <Card.Header className="dark-card-header">
              <h5 className="text-light">Album Information</h5>
            </Card.Header>
            <Card.Body className="dark-card-body">
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label><strong>Title</strong></Form.Label>
                    <Form.Control 
                      type="text" 
                      value={release.title || ''} 
                      readOnly 
                      className="readonly-field"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label><strong>Artist</strong></Form.Label>
                    <Form.Control 
                      type="text" 
                      value={Array.isArray(release.artist) ? release.artist.join(', ') : release.artist || ''} 
                      readOnly 
                      className="readonly-field"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label><strong>Format</strong></Form.Label>
                    <Form.Control 
                      type="text" 
                      value={release.format || ''} 
                      readOnly 
                      className="readonly-field"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label><strong>Country</strong></Form.Label>
                    <Form.Control 
                      type="text" 
                      value={release.country || ''} 
                      readOnly 
                      className="readonly-field"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label><strong>Year</strong></Form.Label>
                    <Form.Control 
                      type="text" 
                      value={release.releaseYear || ''} 
                      readOnly 
                      className="readonly-field"
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* Cover Art Selection */}
          <Card className="mb-4 dark-card">
            <Card.Header className="dark-card-header">
              <h5 className="text-light">Cover Art</h5>
            </Card.Header>
            <Card.Body className="dark-card-body">
              {sortedCovers.length > 0 && (
                <div className="cover-selection mb-4">
                  {/* Front Cover Selection */}
                  <div className="cover-type-section mb-4">
                    <Form.Label className="text-light">Select Front Cover:</Form.Label>
                    <div className="cover-thumbnails">
                      {sortedCovers.filter(cover => cover.type === 'front').map((cover, index) => {
                        const originalIndex = sortedCovers.findIndex(c => c.url === cover.url);
                        return (
                          <div 
                            key={originalIndex}
                            className={`cover-thumbnail ${selectedFrontCoverIndex === originalIndex ? 'selected' : ''}`}
                            onClick={() => handleFrontCoverSelect(originalIndex)}
                          >
                            <Image 
                              src={cover.url} 
                              alt={`Front cover ${index + 1}`}
                              thumbnail
                              className="cover-image cover-clickable"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCoverClick(cover, 'Front');
                              }}
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
                              <small className="text-muted cover-dimensions">
                                {formatImageSize(
                                  imageDimensions[cover.url]?.width || 0,
                                  imageDimensions[cover.url]?.height || 0
                                )}
                              </small>
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
                        const originalIndex = sortedCovers.findIndex(c => c.url === cover.url);
                        return (
                          <div 
                            key={originalIndex}
                            className={`cover-thumbnail ${selectedBackCoverIndex === originalIndex ? 'selected' : ''}`}
                            onClick={() => handleBackCoverSelect(originalIndex)}
                          >
                            <Image 
                              src={cover.url} 
                              alt={`Back cover ${index + 1}`}
                              thumbnail
                              className="cover-image cover-clickable"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCoverClick(cover, 'Back');
                              }}
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
                              <small className="text-muted cover-dimensions">
                                {formatImageSize(
                                  imageDimensions[cover.url]?.width || 0,
                                  imageDimensions[cover.url]?.height || 0
                                )}
                              </small>
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
