import React, { useState, useEffect } from 'react';
import { Modal, Button, Row, Col, Badge } from 'react-bootstrap';
import { BsPencil, BsTrash, BsMusicNote, BsCalendar, BsFlag, BsDisc, BsApple } from 'react-icons/bs';
import musicService from '../services/musicService';
import CoverModal from './CoverModal';
import './MusicDetailCard.css';

interface CdOwnership {
  condition?: string;
  purchasedAt?: string;
  priceChf?: number | string;
  notes?: string;
}

interface CdTrack {
  no?: number | string;
  title: string;
  durationSec?: number;
}

interface CdDisc {
  number: number;
  tracks: CdTrack[];
}

interface CdData {
  id: number | string;
  title: string;
  artist: string | string[];
  cover?: string;
  backCover?: string;
  releaseYear?: string | number;
  country?: string;
  format?: string;
  releaseGroupFirstReleaseDate?: string;
  editionNotes?: string;
  genres?: string[];
  producer?: string[];
  engineer?: string[];
  recordingLocation?: string;
  labels?: string[];
  catalogNumber?: string;
  barcode?: string;
  recordingQuality?: string;
  language?: string;
  isrcCodes?: string[];
  annotation?: string;
  discs?: CdDisc[];
  ownership?: CdOwnership;
  urls?: { appleMusic?: string; [key: string]: string | undefined };
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface CoverModalData {
  coverUrl: string;
  title: string;
  artist: string | string[];
  coverType: string;
}

interface MusicDetailCardProps {
  cd: CdData;
  onClose: () => void;
  onEdit?: (() => void) | null;
  onDelete: () => void;
  onSearch?: ((predicate: string) => void) | null;
  onListenNextChange?: (() => void) | null;
}

const MusicDetailCard: React.FC<MusicDetailCardProps> = ({ cd, onClose, onEdit, onDelete, onSearch, onListenNextChange }) => {
  const [showCoverModal, setShowCoverModal] = useState<boolean>(false);
  const [coverModalData, setCoverModalData] = useState<CoverModalData>({ coverUrl: '', title: '', artist: '', coverType: '' });
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const deleteBtnRef = React.useRef<HTMLButtonElement>(null);
  const [openingApple, setOpeningApple] = useState<boolean>(false);
  const [appleUrl, setAppleUrl] = useState<string | null>(null);
  const [isInListenNext, setIsInListenNext] = useState<boolean>(false);
  const [togglingListenNext, setTogglingListenNext] = useState<boolean>(false);

  // Only initialize from an already-cached Apple link; do not resolve automatically on open
  useEffect(() => {
    const cached = cd?.urls?.appleMusic;
    const isAppleLink = typeof cached === 'string' && /https?:\/\/(music|itunes)\.apple\.com\//.test(cached);
    setAppleUrl(isAppleLink ? cached : null);
  }, [cd?.id, cd?.urls?.appleMusic]);

  // Load Listen Next status
  useEffect(() => {
    const loadListenNextStatus = async () => {
      try {
        const listenNextAlbums = await musicService.getListenNextAlbums() as CdData[];
        setIsInListenNext(listenNextAlbums.some((album: CdData) => album.id === cd.id));
      } catch (error) {
        console.error('Error loading Listen Next status:', error);
      }
    };

    if (cd?.id) {
      loadListenNextStatus();
    }
  }, [cd?.id]);

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
  };

  const getArtistDisplay = (): string => {
    if (Array.isArray(cd.artist)) {
      return cd.artist.join(', ');
    }
    return cd.artist || 'Unknown Artist';
  };

  const getCoverImage = (): string | null => {
    return musicService.getImageUrl(cd.cover);
  };

  const getBackCoverImage = (): string | null => {
    return musicService.getImageUrl(cd.backCover);
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getConditionBadge = (condition: string): string => {
    const variants: Record<string, string> = {
      'M': 'success',
      'NM': 'primary',
      'VG+': 'warning',
      'VG': 'secondary'
    };
    return variants[condition] || 'secondary';
  };

  const getConditionText = (condition: string): string => {
    const texts: Record<string, string> = {
      'M': 'Mint',
      'NM': 'Near Mint',
      'VG+': 'Very Good Plus',
      'VG': 'Very Good'
    };
    return texts[condition] || condition;
  };

  const handleSearch = (searchType: string, value: string) => {
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

  const handleCoverClick = (coverUrl: string | null, coverType: string) => {
    if (coverUrl) {
      setCoverModalData({
        coverUrl: coverUrl,
        title: cd.title,
        artist: cd.artist,
        coverType: coverType
      });
      setShowCoverModal(true);
    }
  };

  const handleListenNextToggle = async () => {
    if (togglingListenNext) return;

    setTogglingListenNext(true);
    try {
      await musicService.toggleListenNext(cd.id);
      setIsInListenNext(!isInListenNext);
      // Refresh the listen next banner immediately
      if (onListenNextChange) {
        onListenNextChange();
      }
    } catch (error) {
      console.error('Error toggling Listen Next:', error);
    } finally {
      setTogglingListenNext(false);
    }
  };

  const handleCloseCoverModal = () => {
    setShowCoverModal(false);
  };

  // Reset confirm state when dialog closes
  const handleClose = () => {
    setConfirmDelete(false);
    onClose();
  };

  // Reset confirm state when clicking anywhere outside the delete button
  React.useEffect(() => {
    if (!confirmDelete) return;
    const handleDocClick = (e: MouseEvent) => {
      if (deleteBtnRef.current && !deleteBtnRef.current.contains(e.target as Node)) {
        setConfirmDelete(false);
      }
    };
    document.addEventListener('click', handleDocClick, true);
    return () => document.removeEventListener('click', handleDocClick, true);
  }, [confirmDelete]);

  return (
    <Modal
      show={true}
      onHide={handleClose}
      size={"md" as any}
      centered
      style={{ zIndex: 10100 }}
      className="music-detail-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          <BsMusicNote className="me-2" />
          {cd.title}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {getCoverImage() || getBackCoverImage() ? (
          <Row>
            <Col md={3}>
              <div className="cd-covers-container">
                {/* Front Cover */}
                <div className="cd-cover-container">
                  <h6 className="cover-label">Front Cover</h6>
                  {getCoverImage() ? (
                    <img
                      src={getCoverImage()!}
                      alt={`${cd.title} front cover`}
                      className="cd-cover-image cd-cover-clickable"
                      onClick={() => handleCoverClick(getCoverImage(), 'Front')}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        if (target.nextSibling) {
                          (target.nextSibling as HTMLElement).style.display = 'flex';
                        }
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

                {/* Back Cover */}
                {getBackCoverImage() && (
                  <div className="cd-cover-container">
                    <h6 className="cover-label">Back Cover</h6>
                    <img
                      src={getBackCoverImage()!}
                      alt={`${cd.title} back cover`}
                      className="cd-cover-image cd-cover-clickable"
                      onClick={() => handleCoverClick(getBackCoverImage(), 'Back')}
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </Col>

            <Col md={9}>
              <div className="cd-details">
                <p className="cd-artist clickable-artist" onClick={() => handleSearch('artist', getArtistDisplay())}>
                  <strong>Artist:</strong> {getArtistDisplay()}
                </p>

              {/* Compact metadata grid */}
              <div className="metadata-section">
                <Row>
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
                    {cd.genres.map((genre: string, index: number) => (
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

              {/* Additional Information - moved to right side when covers are present */}
              {(cd.producer && cd.producer.length > 0 || cd.engineer && cd.engineer.length > 0 || cd.recordingLocation || cd.labels && cd.labels.length > 0 || cd.catalogNumber || cd.barcode || cd.recordingQuality) && (
                <div className="info-section">
                  <h4>Additional Information</h4>
                  <Row>
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
                          <strong>Recording Location:</strong> {cd.recordingLocation}
                        </div>
                      </Col>
                    )}
                  </Row>
                </div>
              )}

              {/* External Links */}
              {cd.urls && Object.keys(cd.urls).length > 0 && (
                <div className="info-section">
                  <h4>External Links</h4>
                  <div className="external-links">
                    {Object.entries(cd.urls).map(([label, url], index) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-light btn-sm me-2 mb-2"
                      >
                        {label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Col>
        </Row>
        ) : (
          // No cover images - full width layout
          <div className="cd-details">
            <p className="cd-artist clickable-artist" onClick={() => handleSearch('artist', getArtistDisplay())}>
              <strong>Artist:</strong> {getArtistDisplay()}
            </p>

            {/* Compact metadata grid */}
            <div className="metadata-section">
              <Row>
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
                  {cd.genres.map((genre: string, index: number) => (
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

            {/* Additional Information - full width when no covers */}
            {(cd.producer && cd.producer.length > 0 || cd.engineer && cd.engineer.length > 0 || cd.recordingLocation || cd.labels && cd.labels.length > 0 || cd.catalogNumber || cd.barcode || cd.recordingQuality) && (
              <div className="info-section">
                <h4>Additional Information</h4>
                <Row>
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
                        <strong>Recording Location:</strong> {cd.recordingLocation}
                      </div>
                    </Col>
                  )}
                </Row>
              </div>
            )}

            {/* External Links - full width when no covers */}
            {cd.urls && Object.keys(cd.urls).length > 0 && (
              <div className="info-section">
                <h4>External Links</h4>
                <div className="external-links">
                  {Object.entries(cd.urls).map(([label, url], index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline-light btn-sm me-2 mb-2"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ownership Information */}
        {(cd.ownership?.condition || cd.ownership?.purchasedAt || cd.ownership?.priceChf || cd.ownership?.notes) && (
          <div className="mt-4">
            <h4>Ownership Information</h4>
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

        {/* Technical Details */}
        {(cd.language || (cd.isrcCodes && cd.isrcCodes.length > 0)) && (
          <div className="info-section">
            <h4>Technical Details</h4>
            <Row>
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



        {/* Annotation */}
        {cd.annotation && (
          <div className="info-section">
            <h4>Album Notes</h4>
            <div className="annotation-text">
              {cd.annotation}
            </div>
          </div>
        )}

        {/* Track Listing */}
        {cd.discs && cd.discs.length > 0 && (
          <div className="info-section">
            <h4>Track Listing</h4>
            {cd.discs.map((disc: CdDisc, discIndex: number) => (
              <div key={discIndex} className="disc-tracks mb-3">
                {cd.discs!.length > 1 && (
                  <h6 className="disc-title">Disc {disc.number}</h6>
                )}
                <div className="track-list">
                  {disc.tracks.map((track: CdTrack, trackIndex: number) => (
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
            <p className="mb-1">Added: {new Date(cd.createdAt as string).toLocaleDateString()}</p>
            {cd.updatedAt !== cd.createdAt && (
              <p className="mb-0">Updated: {new Date(cd.updatedAt as string).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="primary"
          disabled={openingApple}
          onClick={() => {
            try {
              setOpeningApple(true);
              const cached = cd?.urls?.appleMusic;
              const isAppleLink = typeof cached === 'string' && /https?:\/\/(music|itunes)\.apple\.com\//.test(cached);
              const urlToOpen = appleUrl || (isAppleLink ? cached : null);
              if (urlToOpen) {
                musicService.openAppleMusic(urlToOpen);
                setOpeningApple(false);
              } else {
                // Fallback: fire async fetch but don't await to keep gesture; open when ready
                musicService.getAppleMusicUrl(cd.id)
                  .then((result: unknown) => musicService.openAppleMusic((result as { url: string }).url))
                  .finally(() => setOpeningApple(false));
              }
            } catch (e) {
              console.error('Failed to open Apple Music:', e);
              setOpeningApple(false);
            }
          }}
        >
          {openingApple ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Opening Apple Music...
            </>
          ) : (
            <>
              <BsApple className="me-1" />
              Open in Apple Music
            </>
          )}
        </Button>
        <Button
          variant={isInListenNext ? "warning" : "outline-warning"}
          onClick={handleListenNextToggle}
          disabled={togglingListenNext}
        >
          <span style={{ fontSize: '16px', marginRight: '4px' }}>
            {isInListenNext ? '\uD83C\uDFA7' : '\uD83C\uDFA7'}
          </span>
          {isInListenNext ? 'Remove from Listen Next' : 'Add to Listen Next'}
        </Button>
        {onEdit && (
          <Button variant="outline-primary" onClick={onEdit}>
            <BsPencil className="me-1" />
            Edit
          </Button>
        )}
        <Button
          ref={deleteBtnRef}
          variant={confirmDelete ? 'danger' : 'outline-danger'}
          onClick={handleDelete}
        >
          <BsTrash className="me-1" />
          {confirmDelete ? 'Are you sure?' : 'Delete'}
        </Button>
      </Modal.Footer>

      {/* Cover Zoom Modal */}
      <CoverModal
        isOpen={showCoverModal}
        onClose={handleCloseCoverModal}
        coverUrl={coverModalData.coverUrl}
        title={coverModalData.title}
        artist={coverModalData.artist}
        coverType={coverModalData.coverType}
      />
    </Modal>
  );
};

export default MusicDetailCard;
