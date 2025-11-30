import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert, Badge, Form } from 'react-bootstrap';
import { BsCheck, BsX, BsBook } from 'react-icons/bs';
import bookService from '../services/bookService';
import './VolumeSelector.css';

const VolumeSelector = ({ show, onHide, seriesName, onVolumesSelected, templateBook }) => {
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedVolumes, setSelectedVolumes] = useState(new Set());
  const [enriching, setEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });
  const [existingBooks, setExistingBooks] = useState(new Map()); // Map of seriesNumber -> book
  const [copyOwnerInfo, setCopyOwnerInfo] = useState(true);

  useEffect(() => {
    if (show && seriesName) {
      loadVolumes();
      // Set copy owner checkbox to checked by default when dialog opens
      setCopyOwnerInfo(true);
    }
  }, [show, seriesName, templateBook]);

  const loadVolumes = async () => {
    setLoading(true);
    setError('');
    setSelectedVolumes(new Set());
    
    try {
      // Use the same language as the template book, or default to 'any'
      const language = templateBook?.language || 'any';
      // Normalize language codes (fr, fre, fra -> fr, en, eng -> en)
      const normalizedLanguage = language === 'fre' || language === 'fra' ? 'fr' :
                                 language === 'eng' ? 'en' :
                                 language === 'ger' ? 'de' :
                                 language === 'spa' ? 'es' :
                                 language === 'ita' ? 'it' :
                                 language;
      
      // Load both volumes and existing books in parallel
      const [results, existing] = await Promise.all([
        bookService.searchSeriesVolumes(seriesName, { maxVolumes: 50, language: normalizedLanguage }),
        bookService.getBooksBySeries(seriesName).catch(() => []) // Don't fail if this errors
      ]);
      
      // Create a map of existing books by series number
      const existingMap = new Map();
      existing.forEach(book => {
        if (book.seriesNumber != null) {
          existingMap.set(book.seriesNumber, book);
        }
      });
      setExistingBooks(existingMap);
      
      setVolumes(results);
      
      // Pre-select volumes that come after the template book's volume number
      // But exclude volumes that are already in collection (unless borrowed)
      if (templateBook && templateBook.seriesNumber) {
        const nextVolumeNumber = templateBook.seriesNumber + 1;
        const toSelect = results
          .filter(v => {
            if (v.seriesNumber < nextVolumeNumber) return false;
            const existingBook = existingMap.get(v.seriesNumber);
            // Only exclude if it exists and is not borrowed
            if (existingBook && existingBook.titleStatus !== 'borrowed') return false;
            return true;
          })
          .map(v => v.seriesNumber);
        setSelectedVolumes(new Set(toSelect));
      }
    } catch (err) {
      setError('Failed to load volumes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleVolume = (seriesNumber) => {
    // Don't allow toggling if volume is already in collection and not borrowed
    const existingBook = existingBooks.get(seriesNumber);
    if (existingBook && !existingBook.borrowed) {
      return; // Don't allow selection
    }
    
    const newSelected = new Set(selectedVolumes);
    if (newSelected.has(seriesNumber)) {
      newSelected.delete(seriesNumber);
    } else {
      newSelected.add(seriesNumber);
    }
    setSelectedVolumes(newSelected);
  };

  const selectAll = () => {
    // Only select volumes that are not already in collection (or are borrowed)
    const allNumbers = volumes
      .filter(v => {
        const existingBook = existingBooks.get(v.seriesNumber);
        // Include if not existing, or if existing but borrowed
        return !existingBook || existingBook.titleStatus === 'borrowed';
      })
      .map(v => v.seriesNumber)
      .filter(n => n != null);
    setSelectedVolumes(new Set(allNumbers));
  };

  const deselectAll = () => {
    setSelectedVolumes(new Set());
  };

  const handleAddSelected = async () => {
    if (selectedVolumes.size === 0) {
      setError('Please select at least one volume');
      return;
    }

    setEnriching(true);
    setError('');
    
    try {
      // Filter out volumes that are already in collection (unless borrowed)
      const volumesToAdd = volumes.filter(v => {
        if (!selectedVolumes.has(v.seriesNumber)) return false;
        const existingBook = existingBooks.get(v.seriesNumber);
        // Only add if not existing, or if existing but borrowed
        return !existingBook || existingBook.titleStatus === 'borrowed';
      });
      setEnrichmentProgress({ current: 0, total: volumesToAdd.length });

      // Enrich volumes in parallel with concurrency limit
      const BATCH_SIZE = 5; // Process 5 volumes at a time
      const enrichedVolumes = [];
      
      for (let i = 0; i < volumesToAdd.length; i += BATCH_SIZE) {
        const batch = volumesToAdd.slice(i, i + BATCH_SIZE);
        setEnrichmentProgress({ current: i, total: volumesToAdd.length });
        
        const batchResults = await Promise.allSettled(
          batch.map(async (volume) => {
            try {
              const enriched = await bookService.enrichBook(volume);
              
              // Copy owner information from template book if checkbox is checked
              if (copyOwnerInfo && templateBook) {
                // Copy owner - preserve null/undefined, but convert empty string to null
                if (templateBook.owner !== undefined) {
                  enriched.owner = templateBook.owner || null;
                }
                if (templateBook.readDate) {
                  enriched.readDate = templateBook.readDate;
                }
                console.log(`[VolumeSelector] Copied owner info to volume ${enriched.seriesNumber}:`, {
                  owner: enriched.owner,
                  borrowed: enriched.borrowed,
                  templateOwner: templateBook.owner
                });
              }
              
              // Copy bookType from template book (series volumes share the same type)
              if (templateBook?.bookType) {
                enriched.bookType = templateBook.bookType;
              }
              
              return { success: true, data: enriched };
            } catch (err) {
              console.warn(`Failed to enrich volume ${volume.seriesNumber}:`, err);
              // Still add the volume even if enrichment fails
              const volumeWithOwner = { ...volume };
              // Copy owner information even if enrichment fails
              if (copyOwnerInfo && templateBook) {
                // Copy owner - preserve null/undefined, but convert empty string to null
                if (templateBook.owner !== undefined) {
                  volumeWithOwner.owner = templateBook.owner || null;
                }
                if (templateBook.borrowed !== undefined) {
                  volumeWithOwner.borrowed = templateBook.borrowed;
                }
                if (templateBook.borrowedDate) {
                  volumeWithOwner.borrowedDate = templateBook.borrowedDate;
                }
                if (templateBook.returnedDate) {
                  volumeWithOwner.returnedDate = templateBook.returnedDate;
                }
                if (templateBook.borrowedNotes) {
                  volumeWithOwner.borrowedNotes = templateBook.borrowedNotes;
                }
              }
              
              // Copy bookType from template book (series volumes share the same type)
              if (templateBook?.bookType) {
                volumeWithOwner.bookType = templateBook.bookType;
              }
              return { success: false, data: volumeWithOwner };
            }
          })
        );
        
        // Process batch results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            enrichedVolumes.push(result.value.data);
          } else {
            // If the promise itself was rejected, use the original volume
            const volumeIndex = enrichedVolumes.length;
            if (volumeIndex < volumesToAdd.length) {
              const volumeWithOwner = { ...volumesToAdd[volumeIndex] };
              if (copyOwnerInfo && templateBook) {
                if (templateBook.owner !== undefined) {
                  volumeWithOwner.owner = templateBook.owner || null;
                }
              }
              enrichedVolumes.push(volumeWithOwner);
            }
          }
        });
        
        setEnrichmentProgress({ current: Math.min(i + BATCH_SIZE, volumesToAdd.length), total: volumesToAdd.length });
      }

      // Call the callback with enriched volumes
      if (onVolumesSelected) {
        await onVolumesSelected(enrichedVolumes);
      }
      
      onHide();
    } catch (err) {
      setError('Failed to process volumes: ' + err.message);
    } finally {
      setEnriching(false);
      setEnrichmentProgress({ current: 0, total: 0 });
    }
  };

  const getCoverImage = (volume) => {
    if (volume.coverUrl) return volume.coverUrl;
    if (volume.cover) return bookService.getImageUrl(volume.cover);
    return null;
  };

  return (
    <Modal 
      show={show} 
      onHide={onHide} 
      size="lg" 
      centered 
      style={{ zIndex: 10100 }}
      className="volume-selector-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          <BsBook className="me-2" />
          Select Volumes: {seriesName}
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="volume-selector-body">
        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-warning mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <p>Searching for volumes...</p>
          </div>
        )}

        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        )}

        {!loading && volumes.length === 0 && !error && (
          <Alert variant="info" className="mb-3">
            No volumes found for this series. You can still add volumes manually.
          </Alert>
        )}

        {!loading && volumes.length > 0 && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3 volume-selector-header">
              <div>
                <strong>{volumes.length} volume{volumes.length !== 1 ? 's' : ''} found</strong>
                {selectedVolumes.size > 0 && (
                  <span className="ms-2 text-warning">
                    ({selectedVolumes.size} selected)
                  </span>
                )}
              </div>
              <div>
                <Button variant="outline-secondary" size="sm" onClick={selectAll} className="me-2">
                  Select All
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
              </div>
            </div>

            {templateBook && (
              <div className="mb-3">
                <Form.Check
                  type="checkbox"
                  label={templateBook.owner 
                    ? `Copy owner information from template book (${templateBook.owner})`
                    : 'Copy owner information from template book'}
                  checked={copyOwnerInfo}
                  onChange={(e) => setCopyOwnerInfo(e.target.checked)}
                  disabled={enriching}
                />
              </div>
            )}

            {enriching && (
              <Alert variant="info" className="mb-3">
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Enriching volumes... ({enrichmentProgress.current}/{enrichmentProgress.total})
              </Alert>
            )}

            <div className="volumes-grid-container">
              <div className="volumes-grid">
              {volumes.map((volume) => {
                const isSelected = selectedVolumes.has(volume.seriesNumber);
                const coverUrl = getCoverImage(volume);
                const existingBook = existingBooks.get(volume.seriesNumber);
                const isAlreadyInCollection = existingBook && existingBook.titleStatus !== 'borrowed';
                const isBorrowed = existingBook && existingBook.titleStatus === 'borrowed';
                const isDisabled = isAlreadyInCollection;
                
                return (
                  <div
                    key={volume.seriesNumber || volume.title}
                    className={`volume-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => !enriching && !isDisabled && toggleVolume(volume.seriesNumber)}
                    style={{ 
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.6 : 1
                    }}
                  >
                    <div className="volume-checkbox">
                      {isSelected && <BsCheck />}
                    </div>
                    {coverUrl ? (
                      <img src={coverUrl} alt={volume.title} className="volume-cover" />
                    ) : (
                      <div className="volume-cover-placeholder">
                        <BsBook size={32} />
                      </div>
                    )}
                    <div className="volume-info">
                      <div className="volume-number">#{volume.seriesNumber}</div>
                      <div className="volume-title" title={volume.title}>
                        {volume.title || `Volume ${volume.seriesNumber}`}
                      </div>
                      {volume.authors && volume.authors.length > 0 && (
                        <div className="volume-authors">
                          {Array.isArray(volume.authors) ? volume.authors.join(', ') : volume.authors}
                        </div>
                      )}
                      <div className="d-flex flex-wrap justify-content-center gap-1 mt-1">
                        {volume.publishedYear && (
                          <Badge bg="secondary" className="volume-year">
                            {volume.publishedYear}
                          </Badge>
                        )}
                        {isAlreadyInCollection && (
                          <Badge bg="info" className="volume-status">
                            Already in collection
                          </Badge>
                        )}
                        {isBorrowed && (
                          <Badge bg="warning" text="dark" className="volume-status">
                            Borrowed
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </>
        )}
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={enriching}>
          Cancel
        </Button>
        <Button
          variant="warning"
          onClick={handleAddSelected}
          disabled={enriching || selectedVolumes.size === 0}
          style={{ backgroundColor: '#fbbf24', borderColor: '#fbbf24', color: '#1a202c' }}
        >
          {enriching ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Processing...
            </>
          ) : (
            <>
              Add {selectedVolumes.size} Volume{selectedVolumes.size !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default VolumeSelector;

