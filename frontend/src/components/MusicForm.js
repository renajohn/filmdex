import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Button, Row, Col, Alert, Accordion, Card, Table } from 'react-bootstrap';
import { BsX, BsUpload, BsMusicNote, BsPlus, BsTrash, BsPencil, BsGripVertical } from 'react-icons/bs';
import apiService from '../services/api';
import musicService from '../services/musicService';

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
  const [editingTrack, setEditingTrack] = useState(null); // { discIndex, trackIndex, data }
  const [showTrackDialog, setShowTrackDialog] = useState(false);
  const [draggedTrack, setDraggedTrack] = useState(null); // { discIndex, trackIndex }
  const [dropTarget, setDropTarget] = useState(null); // { discIndex, trackIndex } - where track will drop

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
      
      // Normalize discs data - handle both 'no' and 'trackNumber' fields
      const normalizedDiscs = (cd.discs || []).map(disc => ({
        ...disc,
        tracks: (disc.tracks || []).map(track => ({
          trackNumber: track.trackNumber || track.no || 0,
          title: track.title || '',
          durationSec: track.durationSec || null,
          isrc: track.isrc || '',
          musicbrainzRecordingId: track.musicbrainzRecordingId || null,
          musicbrainzTrackId: track.musicbrainzTrackId || null,
          toc: track.toc || null
        }))
      }));

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
        discs: normalizedDiscs,
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

  // Track Management Functions
  const addDisc = () => {
    const newDiscNumber = formData.discs.length + 1;
    setFormData(prev => ({
      ...prev,
      discs: [...prev.discs, { number: newDiscNumber, tracks: [] }]
    }));
  };

  const deleteDisc = (discIndex) => {
    setFormData(prev => ({
      ...prev,
      discs: prev.discs.filter((_, idx) => idx !== discIndex).map((disc, idx) => ({
        ...disc,
        number: idx + 1
      }))
    }));
  };

  const addTrack = (discIndex) => {
    setEditingTrack({
      discIndex,
      trackIndex: -1,
      data: {
        title: '',
        durationSec: null,
        isrc: '',
        musicbrainzRecordingId: null,
        musicbrainzTrackId: null
      }
    });
    setShowTrackDialog(true);
  };

  const editTrack = (discIndex, trackIndex) => {
    const track = formData.discs[discIndex].tracks[trackIndex];
    setEditingTrack({
      discIndex,
      trackIndex,
      data: { ...track }
    });
    setShowTrackDialog(true);
  };

  const saveTrack = () => {
    if (!editingTrack) return;

    const { discIndex, trackIndex, data } = editingTrack;

    setFormData(prev => {
      const newDiscs = [...prev.discs];
      const disc = { ...newDiscs[discIndex] };
      
      if (trackIndex === -1) {
        // Adding new track - append to end
        disc.tracks = [...disc.tracks, data];
      } else {
        // Editing existing track
        disc.tracks = disc.tracks.map((t, idx) => idx === trackIndex ? data : t);
      }
      
      // Renumber all tracks based on position
      disc.tracks = disc.tracks.map((track, idx) => ({
        ...track,
        trackNumber: idx + 1
      }));
      
      newDiscs[discIndex] = disc;
      return { ...prev, discs: newDiscs };
    });

    setShowTrackDialog(false);
    setEditingTrack(null);
  };

  const deleteTrack = (discIndex, trackIndex) => {
    setFormData(prev => {
      const newDiscs = [...prev.discs];
      const disc = { ...newDiscs[discIndex] };
      disc.tracks = disc.tracks
        .filter((_, idx) => idx !== trackIndex)
        .map((track, idx) => ({ ...track, trackNumber: idx + 1 }));
      newDiscs[discIndex] = disc;
      return { ...prev, discs: newDiscs };
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseDuration = (timeString) => {
    if (!timeString) return null;
    const parts = timeString.split(':');
    if (parts.length !== 2) return null;
    const mins = parseInt(parts[0]);
    const secs = parseInt(parts[1]);
    if (isNaN(mins) || isNaN(secs)) return null;
    return mins * 60 + secs;
  };

  // Track Drag and Drop handlers
  const handleTrackDragStart = (e, discIndex, trackIndex) => {
    setDraggedTrack({ discIndex, trackIndex });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget);
    e.currentTarget.style.opacity = '0.5';
  };

  const handleTrackDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedTrack(null);
    setDropTarget(null);
  };

  const handleTrackDragOver = (e, discIndex, trackIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Only show drop target if dragging within same disc
    if (draggedTrack && draggedTrack.discIndex === discIndex) {
      setDropTarget({ discIndex, trackIndex });
    }
  };

  const handleTrackDrop = (e, targetDiscIndex, targetTrackIndex) => {
    e.preventDefault();
    
    if (!draggedTrack) return;
    if (draggedTrack.discIndex !== targetDiscIndex) return; // Only allow reordering within same disc
    if (draggedTrack.trackIndex === targetTrackIndex) return; // No change
    
    setFormData(prev => {
      const newDiscs = [...prev.discs];
      const disc = { ...newDiscs[targetDiscIndex] };
      const tracks = [...disc.tracks];
      
      // Remove dragged track
      const [draggedItem] = tracks.splice(draggedTrack.trackIndex, 1);
      
      // Insert at new position
      tracks.splice(targetTrackIndex, 0, draggedItem);
      
      // Renumber all tracks based on new positions
      disc.tracks = tracks.map((track, idx) => ({
        ...track,
        trackNumber: idx + 1
      }));
      
      newDiscs[targetDiscIndex] = disc;
      return { ...prev, discs: newDiscs };
    });
    
    setDropTarget(null);
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
      const result = await musicService.uploadCover(cd.id, file);
      
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
      // Full URLs (http/https) or API paths are already complete
      if (coverPreview.startsWith('http') || coverPreview.startsWith('/api/images/')) {
        return coverPreview;
      }
      // Legacy /images/ paths (convert to API endpoint for ingress compatibility)
      if (coverPreview.startsWith('/images/')) {
        return coverPreview.replace('/images/', '/api/images/');
      }
      return `/api/images/${coverPreview}`;
    }
    return null;
  };

  return (
    <>
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
            <Col md={12}>
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

          {/* Tracks Section */}
          <hr className="my-3" />
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="mb-0">Tracks</h6>
            <Button variant="outline-primary" size="sm" onClick={addDisc}>
              <BsPlus size={18} /> Add Disc
            </Button>
          </div>

          {formData.discs.length === 0 ? (
            <Alert variant="info" className="mb-3">
              <div className="text-center py-2">
                <BsMusicNote size={24} className="mb-2" />
                <p className="mb-0">No tracks added yet. Click "Add Disc" to start adding tracks.</p>
              </div>
            </Alert>
          ) : (
            <Accordion defaultActiveKey="0" className="mb-3">
              {formData.discs.map((disc, discIndex) => (
                <Accordion.Item key={discIndex} eventKey={discIndex.toString()}>
                  <Accordion.Header>
                    Disc {disc.number} ({disc.tracks.length} {disc.tracks.length === 1 ? 'track' : 'tracks'})
                  </Accordion.Header>
                  <Accordion.Body>
                    <div className="d-flex justify-content-end mb-2 gap-2">
                      <Button 
                        variant="outline-success" 
                        size="sm" 
                        onClick={() => addTrack(discIndex)}
                      >
                        <BsPlus size={18} /> Add Track
                      </Button>
                      <Button 
                        variant="outline-danger" 
                        size="sm" 
                        onClick={() => {
                          if (window.confirm(`Delete Disc ${disc.number}?`)) {
                            deleteDisc(discIndex);
                          }
                        }}
                      >
                        <BsTrash /> Delete Disc
                      </Button>
                    </div>

                    {disc.tracks.length === 0 ? (
                      <div className="text-center text-muted py-3">
                        No tracks yet. Click "Add Track" to add tracks to this disc.
                      </div>
                    ) : (
                      <>
                        <div className="text-muted mb-2" style={{ fontSize: '0.75rem' }}>
                          <BsGripVertical size={12} className="me-1" />
                          Drag tracks to reorder
                        </div>
                        <Table striped bordered hover size="sm" style={{ fontSize: '0.875rem' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '30px' }}></th>
                              <th style={{ width: '40px' }}>#</th>
                              <th>Title</th>
                              <th style={{ width: '80px' }}>Duration</th>
                              <th style={{ width: '120px' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {disc.tracks.map((track, trackIndex) => {
                              const isDragging = draggedTrack?.discIndex === discIndex && draggedTrack?.trackIndex === trackIndex;
                              const isDropTarget = dropTarget?.discIndex === discIndex && dropTarget?.trackIndex === trackIndex;
                              
                              return (
                            <tr 
                              key={trackIndex}
                              draggable
                              onDragStart={(e) => handleTrackDragStart(e, discIndex, trackIndex)}
                              onDragEnd={handleTrackDragEnd}
                              onDragOver={(e) => handleTrackDragOver(e, discIndex, trackIndex)}
                              onDrop={(e) => handleTrackDrop(e, discIndex, trackIndex)}
                              style={{ 
                                cursor: 'move',
                                backgroundColor: isDragging 
                                  ? 'rgba(96, 165, 250, 0.1)' 
                                  : undefined,
                                transition: 'all 0.2s ease',
                                borderLeft: isDragging 
                                  ? '3px solid rgba(96, 165, 250, 0.8)' 
                                  : undefined,
                                borderTop: isDropTarget && !isDragging
                                  ? '3px solid rgba(34, 197, 94, 0.9)'
                                  : undefined,
                                boxShadow: isDropTarget && !isDragging
                                  ? '0 -2px 8px rgba(34, 197, 94, 0.3)'
                                  : undefined
                              }}
                            >
                                <td style={{ 
                                  textAlign: 'center', 
                                  color: 'rgba(255, 255, 255, 0.4)',
                                  userSelect: 'none',
                                  padding: '0.25rem'
                                }}>
                                  <BsGripVertical size={14} />
                                </td>
                                <td style={{ userSelect: 'none' }}>{trackIndex + 1}</td>
                                <td style={{ userSelect: 'none' }}>{track.title}</td>
                                <td style={{ userSelect: 'none' }}>{formatDuration(track.durationSec)}</td>
                                <td>
                                  <div className="d-flex gap-1">
                                    <Button
                                      variant="outline-primary"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        editTrack(discIndex, trackIndex);
                                      }}
                                    >
                                      <BsPencil />
                                    </Button>
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Delete track "${track.title}"?`)) {
                                          deleteTrack(discIndex, trackIndex);
                                        }
                                      }}
                                    >
                                      <BsTrash />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </>
                    )}
                  </Accordion.Body>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
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

    {/* Track Edit Dialog */}
    {showTrackDialog && editingTrack && (
      <Modal 
        show={showTrackDialog} 
        onHide={() => {
          setShowTrackDialog(false);
          setEditingTrack(null);
        }} 
        centered 
        style={{ zIndex: 10200 }}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingTrack.trackIndex === -1 ? 'Add Track' : 'Edit Track'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Title *</Form.Label>
              <Form.Control
                type="text"
                value={editingTrack.data.title}
                onChange={(e) => setEditingTrack(prev => ({
                  ...prev,
                  data: { ...prev.data, title: e.target.value }
                }))}
                placeholder="Enter track title"
                autoFocus
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Duration (mm:ss)</Form.Label>
              <Form.Control
                type="text"
                value={formatDuration(editingTrack.data.durationSec)}
                onChange={(e) => {
                  const duration = parseDuration(e.target.value);
                  setEditingTrack(prev => ({
                    ...prev,
                    data: { ...prev.data, durationSec: duration }
                  }));
                }}
                placeholder="e.g., 3:45"
              />
              <Form.Text className="text-muted">
                Format: minutes:seconds (e.g., 3:45)
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>ISRC</Form.Label>
              <Form.Control
                type="text"
                value={editingTrack.data.isrc || ''}
                onChange={(e) => setEditingTrack(prev => ({
                  ...prev,
                  data: { ...prev.data, isrc: e.target.value }
                }))}
                placeholder="e.g., USRC17607839"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button 
            variant="secondary" 
            onClick={() => {
              setShowTrackDialog(false);
              setEditingTrack(null);
            }}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={saveTrack}
            disabled={!editingTrack.data.title.trim()}
          >
            {editingTrack.trackIndex === -1 ? 'Add Track' : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Modal>
    )}
  </>
  );
};

export default MusicForm;

