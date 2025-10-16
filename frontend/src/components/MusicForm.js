import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Button, Row, Col, Alert } from 'react-bootstrap';
import { BsX, BsUpload, BsMusicNote } from 'react-icons/bs';
import apiService from '../services/api';

const MusicForm = ({ cd = null, onSave, onCancel }) => {
  const fileInputRef = useRef(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverPreview, setCoverPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadMessageType, setUploadMessageType] = useState('success');
  const [availableCovers, setAvailableCovers] = useState([]);
  const [selectedCoverIndex, setSelectedCoverIndex] = useState(0);
  const [formData, setFormData] = useState({
    title: '',
    artist: [],
    releaseYear: '',
    labels: [],
    catalogNumber: '',
    barcode: '',
    country: '',
    format: 'CD',
    editionNotes: '',
    genres: [],
    moods: [],
    recordingQuality: '',
    producer: [],
    engineer: [],
    recordingLocation: '',
    language: '',
    annotation: '',
    ownership: {
      condition: '',
      notes: '',
      purchasedAt: '',
      priceChf: ''
    },
    // Fields that should be preserved but not edited
    cover: null,
    discs: [],
    musicbrainzReleaseId: null,
    musicbrainzReleaseGroupId: null,
    releaseGroupFirstReleaseDate: null,
    releaseGroupType: null,
    releaseGroupSecondaryTypes: [],
    urls: null,
    isrcCodes: []
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (cd) {
      // Set available covers if this is a new album being inserted
      if (cd.availableCovers && !cd.id) {
        setAvailableCovers(cd.availableCovers);
        // Find index of current cover if it exists
        const currentCoverIndex = cd.availableCovers.findIndex(c => c.url === cd.cover);
        const selectedIndex = currentCoverIndex >= 0 ? currentCoverIndex : 0;
        setSelectedCoverIndex(selectedIndex);
        
        // Set the initial cover preview
        if (cd.availableCovers[selectedIndex]) {
          setCoverPreview(cd.availableCovers[selectedIndex].url);
        }
      } else {
        setAvailableCovers([]);
        // Set cover preview from cd.cover if available
        if (cd.cover) {
          setCoverPreview(cd.cover);
        }
      }
      
      setFormData({
        title: cd.title || '',
        artist: Array.isArray(cd.artist) ? cd.artist : (cd.artist ? [cd.artist] : []),
        releaseYear: cd.releaseYear || '',
        labels: Array.isArray(cd.labels) ? cd.labels : (cd.labels ? [cd.labels] : []),
        catalogNumber: cd.catalogNumber || '',
        barcode: cd.barcode || '',
        country: cd.country || '',
        format: cd.format || 'CD',
        editionNotes: cd.editionNotes || '',
        genres: Array.isArray(cd.genres) ? cd.genres : (cd.genres ? [cd.genres] : []),
        moods: Array.isArray(cd.moods) ? cd.moods : (cd.moods ? [cd.moods] : []),
        recordingQuality: cd.recordingQuality || '',
        producer: Array.isArray(cd.producer) ? cd.producer : (cd.producer ? [cd.producer] : []),
        engineer: Array.isArray(cd.engineer) ? cd.engineer : (cd.engineer ? [cd.engineer] : []),
        recordingLocation: cd.recordingLocation || '',
        language: cd.language || '',
        annotation: cd.annotation || '',
        ownership: {
          condition: cd.ownership?.condition || '',
          notes: cd.ownership?.notes || '',
          purchasedAt: cd.ownership?.purchasedAt || '',
          priceChf: cd.ownership?.priceChf || ''
        },
        // Preserve fields that shouldn't be edited
        cover: cd.cover || null,
        discs: cd.discs || [],
        musicbrainzReleaseId: cd.musicbrainzReleaseId || null,
        musicbrainzReleaseGroupId: cd.musicbrainzReleaseGroupId || null,
        releaseGroupFirstReleaseDate: cd.releaseGroupFirstReleaseDate || null,
        releaseGroupType: cd.releaseGroupType || null,
        releaseGroupSecondaryTypes: cd.releaseGroupSecondaryTypes || [],
        urls: cd.urls || null,
        isrcCodes: cd.isrcCodes || []
      });
      
      // Set cover preview if available
      if (cd.cover) {
        setCoverPreview(cd.cover);
      }
    }
  }, [cd]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleArrayInputChange = (field, value) => {
    const array = value.split(',').map(item => item.trim()).filter(item => item);
    handleInputChange(field, array);
  };

  const handleOwnershipChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ownership: {
        ...prev.ownership,
        [field]: value
      }
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (!formData.artist.length) {
      newErrors.artist = 'At least one artist is required';
    }
    
    if (formData.releaseYear && (isNaN(formData.releaseYear) || formData.releaseYear < 1900 || formData.releaseYear > new Date().getFullYear() + 1)) {
      newErrors.releaseYear = 'Please enter a valid year';
    }
    
    if (formData.ownership.priceChf && (isNaN(formData.ownership.priceChf) || formData.ownership.priceChf < 0)) {
      newErrors.priceChf = 'Please enter a valid price';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    
    try {
      const submitData = {
        ...formData,
        releaseYear: formData.releaseYear ? parseInt(formData.releaseYear) : null,
        ownership: {
          ...formData.ownership,
          priceChf: formData.ownership.priceChf ? parseFloat(formData.ownership.priceChf) : null
        }
      };
      
      await onSave(submitData);
    } catch (error) {
      console.error('Error saving album:', error);
    } finally {
      setLoading(false);
    }
  };

  const getArrayDisplayValue = (array) => {
    return Array.isArray(array) ? array.join(', ') : '';
  };

  const uploadCoverFile = async (file) => {
    if (!file) return;

    // Clear any previous messages
    setUploadMessage(null);

    if (!cd || !cd.id) {
      setUploadMessageType('warning');
      setUploadMessage('Please save the album first before uploading a cover');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadMessageType('danger');
      setUploadMessage('Only JPEG, PNG, and WebP images are allowed');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadMessageType('danger');
      setUploadMessage('File size must be less than 10MB');
      return;
    }

    setUploadingCover(true);

    try {
      const formData = new FormData();
      formData.append('cover', file);

      const response = await fetch(`/api/music/cds/${cd.id}/upload-cover`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload cover');
      }

      const result = await response.json();
      
      // Update the cover preview and form data
      setCoverPreview(result.coverPath);
      setFormData(prev => ({
        ...prev,
        cover: result.coverPath
      }));

      setUploadMessageType('success');
      setUploadMessage('Cover uploaded successfully!');
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setUploadMessage(null);
      }, 3000);
    } catch (error) {
      console.error('Error uploading cover:', error);
      setUploadMessageType('danger');
      setUploadMessage('Failed to upload cover: ' + error.message);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCoverUpload = async (event) => {
    const file = event.target.files[0];
    await uploadCoverFile(file);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadCoverFile(files[0]);
    }
  };

  const getCoverImageUrl = () => {
    if (coverPreview) {
      if (coverPreview.startsWith('http') || coverPreview.startsWith('/images/')) {
        return coverPreview;
      }
      return `/images/${coverPreview}`;
    }
    return null;
  };

  return (
    <Modal show={true} onHide={onCancel} size="lg" centered style={{ zIndex: 10100 }}>
      {/* Floating Upload Message */}
      {uploadMessage && (
        <Alert 
          variant={uploadMessageType} 
          dismissible 
          onClose={() => setUploadMessage(null)}
          style={{ 
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10101,
            minWidth: '300px',
            maxWidth: '500px',
            margin: '0 auto',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            fontSize: '0.875rem'
          }}
        >
          {uploadMessage}
        </Alert>
      )}
      
      <Modal.Header closeButton>
        <Modal.Title>{cd ? 'Edit Album' : 'Add New Album'}</Modal.Title>
      </Modal.Header>
      
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {/* Cover Art Picker - Only show when inserting new album with multiple covers */}
          {availableCovers.length > 1 && cd && !cd.id && (
            <Form.Group className="mb-4">
              <Form.Label style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                Available Covers ({availableCovers.length})
              </Form.Label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '12px',
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '4px'
              }}>
                {availableCovers.map((cover, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedCoverIndex(index);
                      setCoverPreview(cover.url);
                      setFormData(prev => ({ ...prev, cover: cover.url }));
                    }}
                    style={{
                      position: 'relative',
                      cursor: 'pointer',
                      border: selectedCoverIndex === index 
                        ? '3px solid rgba(96, 165, 250, 0.9)' 
                        : '2px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      aspectRatio: '1',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedCoverIndex === index 
                        ? '0 0 0 1px rgba(96, 165, 250, 0.3)' 
                        : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCoverIndex !== index) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCoverIndex !== index) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                  >
                    <img 
                      src={cover.url} 
                      alt={`Cover ${index + 1}`}
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    {selectedCoverIndex === index && (
                      <div style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        backgroundColor: 'rgba(96, 165, 250, 0.95)',
                        color: 'white',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                      }}>
                        ✓
                      </div>
                    )}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      color: 'white',
                      padding: '6px 4px',
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      fontWeight: '500'
                    }}>
                      {cover.country || 'Unknown'}
                      {cover.year && ` • ${cover.year}`}
                    </div>
                  </div>
                ))}
              </div>
            </Form.Group>
          )}
          
          <Row>
            {/* Cover Display and Upload */}
            {cd && (
              <Col md={4} className="mb-3">
                <Form.Group>
                  <Form.Label>Album Cover</Form.Label>
                  <div 
                    className="cover-upload-container" 
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    style={{ 
                      width: '100%',
                      aspectRatio: '1',
                      border: isDragging 
                        ? '2px dashed rgba(96, 165, 250, 0.8)' 
                        : '2px dashed rgba(255, 255, 255, 0.2)', 
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      backgroundColor: isDragging 
                        ? 'rgba(96, 165, 250, 0.1)' 
                        : 'rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (!isDragging) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isDragging) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleCoverUpload}
                      style={{ display: 'none' }}
                    />
                    {getCoverImageUrl() ? (
                      <>
                        <img 
                          src={getCoverImageUrl()} 
                          alt="Album Cover"
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover'
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        {isDragging && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'rgba(0, 0, 0, 0.7)',
                              color: 'rgba(96, 165, 250, 0.9)',
                              pointerEvents: 'none'
                            }}
                          >
                            <div style={{ textAlign: 'center' }}>
                              <BsUpload size={48} />
                              <div style={{ fontSize: '0.875rem', marginTop: '8px', fontWeight: '500' }}>
                                Drop to replace
                              </div>
                            </div>
                          </div>
                        )}
                        <div 
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            padding: '8px',
                            fontSize: '0.75rem',
                            textAlign: 'center',
                            display: isDragging ? 'none' : 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <BsUpload size={12} />
                          {uploadingCover ? 'Uploading...' : 'Change Cover'}
                        </div>
                      </>
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        color: isDragging ? 'rgba(96, 165, 250, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                        pointerEvents: 'none'
                      }}>
                        {isDragging ? (
                          <>
                            <BsUpload size={48} />
                            <div style={{ fontSize: '0.875rem', marginTop: '8px', fontWeight: '500' }}>
                              Drop image here
                            </div>
                          </>
                        ) : (
                          <>
                            <BsMusicNote size={48} />
                            <div style={{ fontSize: '0.75rem', marginTop: '8px' }}>
                              <BsUpload size={12} className="me-1" />
                              Click or drop to upload
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Form.Text className="text-muted d-block mt-2" style={{ fontSize: '0.75rem' }}>
                    JPEG, PNG, WebP (max 10MB)
                  </Form.Text>
                </Form.Group>
              </Col>
            )}
            
            <Col md={cd ? 8 : 12}>
              <Row>
                <Col md={12}>
                  <Form.Group className="mb-3">
                    <Form.Label>Title *</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      isInvalid={!!errors.title}
                      placeholder="Enter album title"
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.title}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                
                <Col md={12}>
                  <Form.Group className="mb-3">
                    <Form.Label>Artist(s) *</Form.Label>
                    <Form.Control
                      type="text"
                      value={getArrayDisplayValue(formData.artist)}
                      onChange={(e) => handleArrayInputChange('artist', e.target.value)}
                      isInvalid={!!errors.artist}
                      placeholder="Enter artists (comma-separated)"
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.artist}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>

                <Col md={3}>
                  <Form.Group className="mb-3">
                    <Form.Label>Release Year</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.releaseYear}
                      onChange={(e) => handleInputChange('releaseYear', e.target.value)}
                      isInvalid={!!errors.releaseYear}
                      placeholder="e.g., 1995"
                      min="1900"
                      max={new Date().getFullYear() + 1}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.releaseYear}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                
                <Col md={3}>
                  <Form.Group className="mb-3">
                    <Form.Label>Country</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.country}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      placeholder="e.g., US, UK, DE"
                    />
                  </Form.Group>
                </Col>
                
                <Col md={3}>
                  <Form.Group className="mb-3">
                    <Form.Label>Format</Form.Label>
                    <Form.Select
                      value={formData.format}
                      onChange={(e) => handleInputChange('format', e.target.value)}
                    >
                      <option value="CD">CD</option>
                      <option value="Vinyl">Vinyl</option>
                      <option value="Cassette">Cassette</option>
                      <option value="Digital Media">Digital Media</option>
                      <option value="Other">Other</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                
                <Col md={3}>
                  <Form.Group className="mb-3">
                    <Form.Label>Recording Quality</Form.Label>
                    <Form.Select
                      value={formData.recordingQuality}
                      onChange={(e) => handleInputChange('recordingQuality', e.target.value)}
                    >
                      <option value="">Select quality</option>
                      <option value="demo">Demo</option>
                      <option value="reference">Reference</option>
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
            </Col>
          </Row>

          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Labels</Form.Label>
                <Form.Control
                  type="text"
                  value={getArrayDisplayValue(formData.labels)}
                  onChange={(e) => handleArrayInputChange('labels', e.target.value)}
                  placeholder="e.g., Parlophone"
                />
              </Form.Group>
            </Col>
            
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Catalog Number</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.catalogNumber}
                  onChange={(e) => handleInputChange('catalogNumber', e.target.value)}
                  placeholder="[none]"
                />
              </Form.Group>
            </Col>
            
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Barcode</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => handleInputChange('barcode', e.target.value)}
                  placeholder="e.g., 077774647529"
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={12}>
              <Form.Group className="mb-3">
                <Form.Label>Edition Notes</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.editionNotes}
                  onChange={(e) => handleInputChange('editionNotes', e.target.value)}
                  placeholder="e.g., 2011 remaster, pre-emphasis"
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Genres</Form.Label>
                <Form.Control
                  type="text"
                  value={getArrayDisplayValue(formData.genres)}
                  onChange={(e) => handleArrayInputChange('genres', e.target.value)}
                  placeholder="e.g., rock, classical, jazz"
                />
              </Form.Group>
            </Col>
            
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Moods</Form.Label>
                <Form.Control
                  type="text"
                  value={getArrayDisplayValue(formData.moods)}
                  onChange={(e) => handleArrayInputChange('moods', e.target.value)}
                  placeholder="e.g., calm, energetic, night"
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Producer(s)</Form.Label>
                <Form.Control
                  type="text"
                  value={getArrayDisplayValue(formData.producer)}
                  onChange={(e) => handleArrayInputChange('producer', e.target.value)}
                  placeholder="e.g., George Martin"
                />
              </Form.Group>
            </Col>
            
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Engineer(s)</Form.Label>
                <Form.Control
                  type="text"
                  value={getArrayDisplayValue(formData.engineer)}
                  onChange={(e) => handleArrayInputChange('engineer', e.target.value)}
                  placeholder="e.g., Geoff Emerick"
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Recording Location</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.recordingLocation}
                  onChange={(e) => handleInputChange('recordingLocation', e.target.value)}
                  placeholder="e.g., Abbey Road"
                />
              </Form.Group>
            </Col>
            
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Language</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.language}
                  onChange={(e) => handleInputChange('language', e.target.value)}
                  placeholder="e.g., eng"
                  maxLength={3}
                />
              </Form.Group>
            </Col>
            
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Annotation</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.annotation}
                  onChange={(e) => handleInputChange('annotation', e.target.value)}
                  placeholder="Album notes"
                />
              </Form.Group>
            </Col>
          </Row>

          <hr className="my-3" />
          <h6 className="mb-3">Ownership</h6>
          
          <Row>
            <Col md={3}>
              <Form.Group className="mb-3">
                <Form.Label>Condition</Form.Label>
                <Form.Select
                  value={formData.ownership.condition}
                  onChange={(e) => handleOwnershipChange('condition', e.target.value)}
                >
                  <option value="">-</option>
                  <option value="M">Mint (M)</option>
                  <option value="NM">Near Mint (NM)</option>
                  <option value="VG+">Very Good Plus (VG+)</option>
                  <option value="VG">Very Good (VG)</option>
                </Form.Select>
              </Form.Group>
            </Col>
            
            <Col md={3}>
              <Form.Group className="mb-3">
                <Form.Label>Purchase Date</Form.Label>
                <Form.Control
                  type="date"
                  value={formData.ownership.purchasedAt}
                  onChange={(e) => handleOwnershipChange('purchasedAt', e.target.value)}
                />
              </Form.Group>
            </Col>
            
            <Col md={2}>
              <Form.Group className="mb-3">
                <Form.Label>Price (CHF)</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  value={formData.ownership.priceChf}
                  onChange={(e) => handleOwnershipChange('priceChf', e.target.value)}
                  isInvalid={!!errors.priceChf}
                  placeholder="0.00"
                  min="0"
                />
                <Form.Control.Feedback type="invalid">
                  {errors.priceChf}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Notes</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.ownership.notes}
                  onChange={(e) => handleOwnershipChange('notes', e.target.value)}
                  placeholder="Ownership notes"
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? 'Saving...' : (cd ? 'Update Album' : 'Add Album')}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default MusicForm;

