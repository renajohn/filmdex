import React, { useState, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { BsPencil, BsTrash, BsMusicNote, BsApple, BsTags, BsPlayFill, BsHeadphones, BsBoxArrowUpRight, BsChevronRight } from 'react-icons/bs';
import musicService from '../services/musicService';
import CoverModal from './CoverModal';
import AlbumStory from './AlbumStory';
import { discCredits, type TrackPerformer } from '../utils/trackCredits';
import { canUsePicard, openInPicard } from '../utils/picard';
import { openListen } from '../utils/navidrome';
import { playingTime, ripSummary, urlLabel } from '../utils/albumHead';
import TrackDetails from './TrackDetails';
import type { RipTracks } from '../services/musicService';
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
  isrc?: string | null;
  musicbrainzRecordingId?: string | null;
  work?: string | null;
  artist?: string[];
  composers?: string[];
  performers?: TrackPerformer[];
}

interface CdDisc {
  number: number;
  tracks: CdTrack[];
}

interface CdData {
  musicbrainzReleaseId?: string | null;
  id: number | string;
  title: string;
  artist: string | string[];
  cover?: string;
  backCover?: string;
  releaseYear?: string | number;
  country?: string;
  format?: string;
  releaseGroupFirstReleaseDate?: string | number;
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

const CONDITIONS: Record<string, string> = {
  'M': 'Mint',
  'NM': 'Near Mint',
  'VG+': 'Very Good Plus',
  'VG': 'Very Good'
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </>
);

const MusicDetailCard: React.FC<MusicDetailCardProps> = ({ cd, onClose, onEdit, onDelete, onSearch, onListenNextChange }) => {
  const [showCoverModal, setShowCoverModal] = useState<boolean>(false);
  const [coverModalData, setCoverModalData] = useState<CoverModalData>({ coverUrl: '', title: '', artist: '', coverType: '' });
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const deleteBtnRef = React.useRef<HTMLButtonElement>(null);
  const [openingApple, setOpeningApple] = useState<boolean>(false);
  const [appleUrl, setAppleUrl] = useState<string | null>(null);
  const [isInListenNext, setIsInListenNext] = useState<boolean>(false);
  const [togglingListenNext, setTogglingListenNext] = useState<boolean>(false);
  const [showMusicians, setShowMusicians] = useState<boolean>(false);
  const [showIds, setShowIds] = useState<boolean>(false);
  const [showEdition, setShowEdition] = useState<boolean>(false);
  // A front cover whose file would not load: the placeholder takes its place.
  const [coverBroken, setCoverBroken] = useState<boolean>(false);
  // The track whose details are open under its row, as "disc-position".
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  // Undefined while Navidrome is asked for this CD's rip, read as the album opens.
  const [rip, setRip] = useState<RipTracks | null | undefined>(undefined);
  const [ripError, setRipError] = useState<string | null>(null);

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

  const handleOpenAppleMusic = () => {
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

  // The rip, for the Listen button and the tracks' details.
  useEffect(() => {
    let current = true;
    setSelectedTrack(null);
    setCoverBroken(false);
    setRip(undefined);
    setRipError(null);
    musicService.getNavidromeTracks(cd.id)
      .then(result => { if (current) setRip(result); })
      .catch((error: Error) => { if (current) setRipError(error.message); });
    return () => { current = false; };
  }, [cd.id]);

  /** Opens a track's details, or closes them when they are open. */
  const toggleTrack = (key: string) => {
    setSelectedTrack(selectedTrack === key ? null : key);
  };

  const ripAlbum = rip?.found ? rip.album : undefined;

  const discsCredits = (cd.discs || []).map((disc: CdDisc) =>
    discCredits(disc.tracks, Array.isArray(cd.artist) ? cd.artist : [cd.artist]));

  // What the head says of the CD as an object: its format, size and length in one murmur…
  const discs = cd.discs || [];
  const trackCount = discs.reduce((count, disc) => count + disc.tracks.length, 0);
  const length = playingTime(discs.reduce((total, disc) =>
    total + disc.tracks.reduce((sum, track) => sum + (track.durationSec || 0), 0), 0));
  const shape = [
    cd.format,
    discs.length > 1 ? `${discs.length} discs` : null,
    trackCount > 0 ? `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}` : null,
    length || null,
  ].filter(Boolean).join(' · ');

  // …and of its edition: the year and country together, the first release only when it is another year.
  const released = [cd.releaseYear, cd.country].filter(Boolean).join(' · ');
  // The date can come back as a bare year, a number, from older imports.
  const firstRelease = cd.releaseGroupFirstReleaseDate ? String(cd.releaseGroupFirstReleaseDate) : '';
  const original = firstRelease && firstRelease.slice(0, 4) !== String(cd.releaseYear ?? '') ? firstRelease : null;

  const ownership = cd.ownership || {};
  const added = new Date(cd.createdAt as string).toLocaleDateString();
  const updated = cd.updatedAt ? new Date(cd.updatedAt as string).toLocaleDateString() : null;
  const owned = [
    ownership.condition ? CONDITIONS[ownership.condition] || ownership.condition : null,
    ownership.purchasedAt ? `bought ${new Date(ownership.purchasedAt).toLocaleDateString()}` : null,
    ownership.priceChf ? `CHF ${ownership.priceChf}` : null,
  ].filter(Boolean).join(' · ');

  const links = Object.entries(cd.urls || {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const summary = rip?.found ? ripSummary(rip) : null;

  // The rip as Navidrome holds it: its state first, the format and the count of files in a murmur.
  let ripText: React.ReactNode;
  if (ripError) ripText = <span className="album-head-muted">Could not read Navidrome: {ripError}</span>;
  else if (rip === undefined) ripText = <span className="album-head-muted">Reading Navidrome…</span>;
  else if (!summary) ripText = <span className="album-head-muted">Not ripped yet.</span>;
  else ripText = (
    <>
      <span className={summary.state === 'lossless' ? 'album-head-lossless' : 'album-head-lossy'}>
        {summary.state === 'lossless' ? 'Lossless' : 'Lossy'}
      </span>
      <span className="album-head-muted">
        {' · '}{summary.format}
        {trackCount > 0 && ` · ${summary.files} of ${trackCount} tracks`}
      </span>
    </>
  );

  const frontCover = coverBroken ? null : getCoverImage();
  const backCover = getBackCoverImage();

  return (
    <Modal
      show={true}
      onHide={handleClose}
      size={"md" as any}
      centered
      fullscreen="md-down"
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
        {/* The head: the cover, who and what, how to listen, then the facts of this edition. */}
        <div className="album-head">
          <div className="album-head-covers">
            {frontCover ? (
              <img
                src={frontCover}
                alt={`${cd.title} front cover`}
                className="album-head-cover"
                onClick={() => handleCoverClick(frontCover, 'Front')}
                onError={() => setCoverBroken(true)}
              />
            ) : (
              <div className="album-head-cover album-head-cover-empty" aria-hidden="true">
                <BsMusicNote size={40} />
              </div>
            )}
            {backCover && (
              <img
                src={backCover}
                alt={`${cd.title} back cover`}
                title="Back cover"
                className="album-head-back"
                onClick={() => handleCoverClick(backCover, 'Back')}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>

          <div className="album-head-identity">
            <button type="button" className="album-head-artist album-head-filter" onClick={() => handleSearch('artist', getArtistDisplay())}>
              {getArtistDisplay()}
            </button>
            {shape && <div className="album-head-shape">{shape}</div>}

            <div className="album-head-actions">
              {ripAlbum ? (
                <Button variant="primary" size="sm" onClick={() => openListen(ripAlbum)}>
                  <BsPlayFill className="me-1" />
                  Listen
                </Button>
              ) : rip === undefined && !ripError ? (
                <Button variant="primary" size="sm" disabled>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Listen
                </Button>
              ) : (
                <Button variant="outline-light" size="sm" disabled={openingApple} onClick={handleOpenAppleMusic}>
                  {openingApple ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Opening Apple Music…
                    </>
                  ) : (
                    <>
                      <BsApple className="me-1" />
                      Apple Music
                    </>
                  )}
                </Button>
              )}
              <Button
                variant={isInListenNext ? 'warning' : 'outline-secondary'}
                size="sm"
                onClick={handleListenNextToggle}
                disabled={togglingListenNext}
              >
                <BsHeadphones className="me-1" />
                {isInListenNext ? 'In Listen Next' : 'Listen Next'}
              </Button>
            </div>
          </div>

          <dl className="album-head-facts">
            {released && <Field label="Released">{released}</Field>}
            {original && <Field label="First release">{original}</Field>}
            {cd.labels && cd.labels.length > 0 && (
              <Field label={cd.labels.length > 1 ? 'Labels' : 'Label'}>{cd.labels.join(', ')}</Field>
            )}
            {cd.editionNotes && (
              <Field label="Edition">
                <button
                  type="button"
                  className={`album-head-clamp${showEdition ? '' : ' album-head-clamped'}`}
                  aria-expanded={showEdition}
                  title={showEdition ? undefined : 'Show the whole note'}
                  onClick={() => setShowEdition(open => !open)}
                >
                  {cd.editionNotes}
                </button>
              </Field>
            )}
            {rip?.configured !== false && <Field label="Navidrome">{ripText}</Field>}
            {cd.genres && cd.genres.length > 0 && (
              <Field label="Genres">
                {cd.genres.map((genre: string, index: number) => (
                  <React.Fragment key={genre}>
                    {index > 0 && ', '}
                    <button type="button" className="album-head-filter" onClick={() => handleSearch('genre', genre)}>{genre}</button>
                  </React.Fragment>
                ))}
              </Field>
            )}
            {cd.producer && cd.producer.length > 0 && (
              <Field label={cd.producer.length > 1 ? 'Producers' : 'Producer'}>{cd.producer.join(', ')}</Field>
            )}
            {cd.engineer && cd.engineer.length > 0 && (
              <Field label={cd.engineer.length > 1 ? 'Engineers' : 'Engineer'}>{cd.engineer.join(', ')}</Field>
            )}
            {cd.recordingLocation && <Field label="Recorded at">{cd.recordingLocation}</Field>}
            {cd.recordingQuality && <Field label="Quality">{cd.recordingQuality}</Field>}
            {cd.language && <Field label="Language">{cd.language.toUpperCase()}</Field>}
            {(owned || ownership.notes) && (
              <Field label="Owned">
                {owned}
                {ownership.notes && <span className="album-head-note">{ownership.notes}</span>}
              </Field>
            )}
            {(cd.musicbrainzReleaseId || links.length > 0) && (
              <Field label="Links">
                <span className="album-head-links">
                  {cd.musicbrainzReleaseId && (
                    <a
                      className="album-head-link"
                      href={`https://musicbrainz.org/release/${cd.musicbrainzReleaseId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MusicBrainz
                      <BsBoxArrowUpRight aria-hidden="true" />
                    </a>
                  )}
                  {links.map(([key, url]) => (
                    <a key={key} className="album-head-link" href={url} target="_blank" rel="noopener noreferrer">
                      {urlLabel(key)}
                      <BsBoxArrowUpRight aria-hidden="true" />
                    </a>
                  ))}
                  {cd.musicbrainzReleaseId && canUsePicard() && (
                    <button
                      type="button"
                      className="album-head-link"
                      onClick={() => openInPicard(cd.musicbrainzReleaseId!)}
                      title="Load this exact edition in MusicBrainz Picard, open on this computer"
                    >
                      <BsTags aria-hidden="true" />
                      Tag in Picard
                    </button>
                  )}
                </span>
              </Field>
            )}
            <Field label="In DexVault">
              <span className="album-head-muted">
                added {added}
                {updated && updated !== added && ` · updated ${updated}`}
              </span>
            </Field>
            <dt>IDs</dt>
            <dd>
              <button
                type="button"
                className="album-head-link album-head-toggle"
                aria-expanded={showIds}
                aria-controls={`album-ids-${cd.id}`}
                onClick={() => setShowIds(open => !open)}
              >
                <BsChevronRight aria-hidden="true" className={showIds ? 'album-head-chevron-open' : undefined} />
                {showIds ? 'Hide' : 'Show'}
              </button>
            </dd>
            {showIds && (
              <div className="album-head-ids" id={`album-ids-${cd.id}`}>
                {cd.catalogNumber && <Field label="Catalogue no."><code className="album-head-code">{cd.catalogNumber}</code></Field>}
                {cd.barcode && <Field label="Barcode"><code className="album-head-code">{cd.barcode}</code></Field>}
                {cd.isrcCodes && cd.isrcCodes.length > 0 && (
                  <Field label="ISRC"><code className="album-head-code">{cd.isrcCodes.join(', ')}</code></Field>
                )}
                {cd.musicbrainzReleaseId && (
                  <Field label="MusicBrainz"><code className="album-head-code">{cd.musicbrainzReleaseId}</code></Field>
                )}
              </div>
            )}
          </dl>
        </div>

        <AlbumStory albumId={cd.id} />

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
            <div className="track-listing-header">
              <h4>Track Listing</h4>
              {discsCredits.some(credits => credits.musicians.some(Boolean)) && (
                <Button variant="link" size="sm" className="musicians-toggle" onClick={() => setShowMusicians(shown => !shown)}>
                  {showMusicians ? 'Hide musicians' : 'Show musicians'}
                </Button>
              )}
            </div>
            {cd.discs.map((disc: CdDisc, discIndex: number) => {
              const credits = discsCredits[discIndex];
              return (
                <div key={discIndex} className="disc-tracks mb-3">
                  {cd.discs!.length > 1 && (
                    <h6 className="disc-title">Disc {disc.number}</h6>
                  )}
                  {credits.common && (
                    <div className="disc-credits">{credits.common}</div>
                  )}
                  <div className="track-list">
                    {disc.tracks.map((track: CdTrack, trackIndex: number) => {
                      const key = `${disc.number}-${trackIndex}`;
                      const open = selectedTrack === key;
                      return (
                      <React.Fragment key={trackIndex}>
                      <div
                        className={`track-item track-selectable${open ? ' track-selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        aria-controls={open ? `track-details-${key}` : undefined}
                        onClick={() => toggleTrack(key)}
                        onKeyDown={(event: React.KeyboardEvent) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleTrack(key);
                          }
                        }}
                      >
                        <span className="track-number">{track.no}.</span>
                        <span className="track-title">
                          {track.title}
                          {credits.perTrack[trackIndex] && (
                            <span className="track-credits">{credits.perTrack[trackIndex]}</span>
                          )}
                          {showMusicians && credits.musicians[trackIndex] && (
                            <span className="track-musicians">{credits.musicians[trackIndex]}</span>
                          )}
                        </span>
                        {track.durationSec && (
                          <span className="track-duration">
                            {formatDuration(track.durationSec)}
                          </span>
                        )}
                      </div>
                      {open && (
                        <TrackDetails
                          id={`track-details-${key}`}
                          track={{ ...track, disc: disc.number }}
                          albumArtists={Array.isArray(cd.artist) ? cd.artist : [cd.artist]}
                          rip={rip}
                          ripError={ripError}
                        />
                      )}
                      </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </Modal.Body>

      <Modal.Footer>
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
