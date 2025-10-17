import React, { useState } from 'react';
import { Modal, Button, Row, Col, Badge } from 'react-bootstrap';
import { BsX, BsPencil, BsTrash, BsMusicNote, BsCalendar, BsTag, BsFlag, BsDisc } from 'react-icons/bs';
import musicService from '../services/musicService';
import './MusicDetailCard.css';

const MusicDetailCard = ({ cd, onClose, onEdit, onDelete, onSearch }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${cd.title}"? This action cannot be undone.`)) {
      onDelete();
    }
  };

  const getArtistDisplay = () => {
    if (Array.isArray(cd.artist)) {
      return cd.artist.join(', ');
    }
    return cd.artist || 'Unknown Artist';
  };

  const getCoverImage = () => {
    return musicService.getImageUrl(cd.cover);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getConditionBadge = (condition) => {
    const variants = {
      'M': 'success',
      'NM': 'primary',
      'VG+': 'warning',
      'VG': 'secondary'
    };
    return variants[condition] || 'secondary';
  };

  const getConditionText = (condition) => {
    const texts = {
      'M': 'Mint',
      'NM': 'Near Mint',
      'VG+': 'Very Good Plus',
      'VG': 'Very Good'
    };
    return texts[condition] || condition;
  };

  const handleSearch = (searchType, value) => {
    if (onSearch) {
      // Format as predicate based on search type
      let predicate = '';
      if (searchType === 'artist') {
        predicate = `artist:"${value}"`;
      } else if (searchType === 'genre') {
        predicate = `genre:"${value}"`;
      } else {
        predicate = value; // fallback to plain value
      }
      onSearch(predicate);
      onClose();
    }
  };

  return (
    <Modal show={true} onHide={onClose} size="lg" centered style={{ zIndex: 10100 }}>
      <Modal.Header closeButton>
        <Modal.Title>
          <BsMusicNote className="me-2" />
          {cd.title}
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        <Row>
          <Col md={4}>
            <div className="cd-cover-container">
              {getCoverImage() ? (
                <img 
                  src={getCoverImage()} 
                  alt={`${cd.title} cover`}
                  className="cd-cover-image"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className="cd-cover-placeholder"
                style={{ display: getCoverImage() ? 'none' : 'flex' }}
              >
                <BsMusicNote size={64} />
              </div>
            </div>
          </Col>
          
          <Col md={8}>
            <div className="cd-details">
              <h4 className="cd-title">{cd.title}</h4>
              <p className="cd-artist clickable-artist" onClick={() => handleSearch('artist', getArtistDisplay())}>
                <strong>Artist:</strong> {getArtistDisplay()}
              </p>
              
              {/* Compact metadata grid */}
              <div className="metadata-section">
                <Row className="g-2">
                  {cd.releaseYear && (
                    <Col xs={6} md={4}>
                      <div className="metadata-item">
                        <BsCalendar className="metadata-icon" />
                        <span className="metadata-label">Year:</span>
                        <span className="metadata-value">{cd.releaseYear}</span>
                      </div>
                    </Col>
                  )}
                  
                  {cd.country && (
                    <Col xs={6} md={4}>
                      <div className="metadata-item">
                        <BsFlag className="metadata-icon" />
                        <span className="metadata-label">Country:</span>
                        <span className="metadata-value">{cd.country}</span>
                      </div>
                    </Col>
                  )}
                  
                  {cd.format && (
                    <Col xs={6} md={4}>
                      <div className="metadata-item">
                        <BsDisc className="metadata-icon" />
                        <span className="metadata-label">Format:</span>
                        <span className="metadata-value">{cd.format}</span>
                      </div>
                    </Col>
                  )}
                  
                  {cd.releaseGroupFirstReleaseDate && (
                    <Col xs={12} md={4}>
                      <div className="metadata-item">
                        <BsCalendar className="metadata-icon" />
                        <span className="metadata-label">Original:</span>
                        <span className="metadata-value">{cd.releaseGroupFirstReleaseDate}</span>
                      </div>
                    </Col>
                  )}
                </Row>
              </div>
              
              {cd.editionNotes && (
                <div className="edition-notes">
                  <strong>Edition Notes:</strong> {cd.editionNotes}
                </div>
              )}
              
              {cd.genres && cd.genres.length > 0 && (
                <div className="tags-section">
                  <div className="tags-label">Genres:</div>
                  <div className="tags-container">
                    {cd.genres.map((genre, index) => (
                      <Badge 
                        key={index} 
                        bg="secondary" 
                        className="clickable-badge"
                        onClick={() => handleSearch('genre', genre)}
                      >
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Col>
        </Row>

        {/* Ownership Information */}
        {(cd.ownership?.condition || cd.ownership?.purchasedAt || cd.ownership?.priceChf || cd.ownership?.notes) && (
          <div className="mt-4">
            <h6>Ownership Information</h6>
            <Row>
              {cd.ownership?.condition && (
                <Col md={3}>
                  <p className="cd-info">
                    <strong>Condition:</strong>
                    <Badge bg={getConditionBadge(cd.ownership.condition)} className="ms-1">
                      {getConditionText(cd.ownership.condition)}
                    </Badge>
                  </p>
                </Col>
              )}
              
              {cd.ownership?.purchasedAt && (
                <Col md={3}>
                  <p className="cd-info">
                    <strong>Purchased:</strong> {new Date(cd.ownership.purchasedAt).toLocaleDateString()}
                  </p>
                </Col>
              )}
              
              {cd.ownership?.priceChf && (
                <Col md={3}>
                  <p className="cd-info">
                    <strong>Price:</strong> CHF {cd.ownership.priceChf}
                  </p>
                </Col>
              )}
              
              {cd.ownership?.notes && (
                <Col md={12}>
                  <p className="cd-info">
                    <strong>Notes:</strong> {cd.ownership.notes}
                  </p>
                </Col>
              )}
            </Row>
          </div>
        )}

        {/* Additional Information */}
        {(cd.producer?.length > 0 || cd.engineer?.length > 0 || cd.recordingLocation || cd.labels?.length > 0 || cd.catalogNumber || cd.barcode || cd.recordingQuality) && (
          <div className="info-section">
            <h6 className="section-title">Additional Information</h6>
            <Row className="g-3">
              {cd.labels && cd.labels.length > 0 && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Label{cd.labels.length > 1 ? 's' : ''}:</strong> {cd.labels.join(', ')}
                  </div>
                </Col>
              )}
              
              {cd.catalogNumber && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Catalog #:</strong> {cd.catalogNumber}
                  </div>
                </Col>
              )}
              
              {cd.barcode && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Barcode:</strong> {cd.barcode}
                  </div>
                </Col>
              )}
              
              {cd.recordingQuality && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Quality:</strong> 
                    <Badge bg="info" className="ms-2">
                      {cd.recordingQuality}
                    </Badge>
                  </div>
                </Col>
              )}
              
              {cd.producer && cd.producer.length > 0 && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Producer{cd.producer.length > 1 ? 's' : ''}:</strong> {cd.producer.join(', ')}
                  </div>
                </Col>
              )}
              
              {cd.engineer && cd.engineer.length > 0 && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Engineer{cd.engineer.length > 1 ? 's' : ''}:</strong> {cd.engineer.join(', ')}
                  </div>
                </Col>
              )}
              
              {cd.recordingLocation && (
                <Col md={12}>
                  <div className="info-item">
                    <strong>Recorded at:</strong> {cd.recordingLocation}
                  </div>
                </Col>
              )}
            </Row>
          </div>
        )}

        {/* Technical Details */}
        {(cd.language || cd.isrcCodes?.length > 0) && (
          <div className="info-section">
            <h6 className="section-title">Technical Details</h6>
            <Row className="g-3">
              {cd.language && (
                <Col md={6}>
                  <div className="info-item">
                    <strong>Language:</strong> {cd.language.toUpperCase()}
                  </div>
                </Col>
              )}
              
              {cd.isrcCodes && cd.isrcCodes.length > 0 && (
                <Col md={12}>
                  <div className="info-item">
                    <strong>ISRC Codes:</strong> {cd.isrcCodes.slice(0, 5).join(', ')}
                    {cd.isrcCodes.length > 5 && ` (+${cd.isrcCodes.length - 5} more)`}
                  </div>
                </Col>
              )}
            </Row>
          </div>
        )}

        {/* External Links */}
        {cd.urls && Object.keys(cd.urls).length > 0 && (
          <div className="info-section">
            <h6 className="section-title">External Links</h6>
            <div className="external-links">
              {Object.entries(cd.urls).map(([type, url]) => (
                <a 
                  key={type} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-secondary me-2 mb-2"
                >
                  {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Annotation */}
        {cd.annotation && (
          <div className="info-section">
            <h6 className="section-title">Album Notes</h6>
            <div className="annotation-text">
              {cd.annotation}
            </div>
          </div>
        )}

        {/* Track Listing */}
        {cd.discs && cd.discs.length > 0 && (
          <div className="info-section">
            <h6 className="section-title">Track Listing</h6>
            {cd.discs.map((disc, discIndex) => (
              <div key={discIndex} className="disc-tracks mb-3">
                {cd.discs.length > 1 && (
                  <h6 className="disc-title">Disc {disc.number}</h6>
                )}
                <div className="track-list">
                  {disc.tracks.map((track, trackIndex) => (
                    <div key={trackIndex} className="track-item">
                      <span className="track-number">{track.no}.</span>
                      <span className="track-title">{track.title}</span>
                      {track.durationSec && (
                        <span className="track-duration">
                          {formatDuration(track.durationSec)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="info-section">
          <div className="text-muted small">
            <p className="mb-1">Added: {new Date(cd.createdAt).toLocaleDateString()}</p>
            {cd.updatedAt !== cd.createdAt && (
              <p className="mb-0">Updated: {new Date(cd.updatedAt).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="outline-primary" onClick={onEdit}>
          <BsPencil className="me-1" />
          Edit
        </Button>
        <Button 
          variant="outline-danger" 
          onClick={handleDelete}
        >
          <BsTrash className="me-1" />
          Delete
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default MusicDetailCard;
