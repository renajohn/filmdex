import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { BsPencil, BsTrash, BsDisc, BsApple, BsTags, BsPlayFill, BsPauseFill, BsHeadphones, BsBoxArrowUpRight, BsChevronRight, BsStar, BsStarFill, BsArrowClockwise } from 'react-icons/bs';
import musicService from '../services/musicService';
import CoverModal from './CoverModal';
import AlbumStory from './AlbumStory';
import AlbumNotes from './AlbumNotes';
import AlbumGuide from './AlbumGuide';
import { discCredits, workGroups, type TrackPerformer } from '../utils/trackCredits';
import { canUsePicard, openInPicard } from '../utils/picard';
import { isAppleMobile, openListen, trackListenUrl } from '../utils/navidrome';
import { ripFileFor } from '../utils/trackDetail';
import { player, usePlayer } from '../services/player';
import { playerAlbumOf, playerTracksOf } from '../utils/playAlbum';
import { playingTime, ripSummary, urlLabel } from '../utils/albumHead';
import TrackDetails from './TrackDetails';
import DetailSteps, { useScrollKeys, useStepKeys } from './shared/DetailSteps';
import type { RipTracks } from '../services/musicService';
import './MusicDetailCard.css';
import ShelfCode from './shared/ShelfCode';
import NowPlayingBars from './shared/NowPlayingBars';

/** How often, and how many times, an album's tracks are asked after while their words are looked up. */
const LYRICS_POLL_MS = 3000;
const LYRICS_POLLS = 20;

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
  /** The MusicBrainz community's rating, 0 to 5, and how many voted. */
  rating?: number | null;
  ratingVotes?: number | null;
  /** The Discogs community's rating, 0 to 5, and how many voted. */
  discogsRating?: number | null;
  discogsRatingVotes?: number | null;
  /** Both weighed by their votes; null under three votes in all. */
  communityRating?: number | null;
  communityVotes?: number;
  /** The owner's stars, 1 to 5, kept in step with Navidrome. */
  userRating?: number | null;
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
  /** The album before or after this one on the page; none at either end. */
  onPrevious?: (() => void) | null;
  onNext?: (() => void) | null;
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

type CommunityRatings = Pick<CdData, 'rating' | 'ratingVotes' | 'discogsRating' | 'discogsRatingVotes' | 'communityRating' | 'communityVotes'>;

const communityOf = (album: CommunityRatings): CommunityRatings => ({
  rating: album.rating, ratingVotes: album.ratingVotes,
  discogsRating: album.discogsRating, discogsRatingVotes: album.discogsRatingVotes,
  communityRating: album.communityRating, communityVotes: album.communityVotes,
});

const votesLabel = (votes: number): string => `${votes} vote${votes === 1 ? '' : 's'}`;

/** Each source's votes and rating, for the tooltip: "Discogs: 27 votes → 4.26". */
const communityDetail = (ratings: CommunityRatings): string => [
  ['Discogs', ratings.discogsRatingVotes, ratings.discogsRating] as const,
  ['MusicBrainz', ratings.ratingVotes, ratings.rating] as const,
].filter(([, votes, value]) => votes && typeof value === 'number')
  .map(([source, votes, value]) => `${source}: ${votesLabel(votes!)} → ${Number(value!.toFixed(2))}`)
  .join('\n');

const MusicDetailCard: React.FC<MusicDetailCardProps> = ({ cd, onClose, onEdit, onDelete, onSearch, onListenNextChange, onPrevious, onNext }) => {
  const [showCoverModal, setShowCoverModal] = useState<boolean>(false);
  const [coverModalData, setCoverModalData] = useState<CoverModalData>({ coverUrl: '', title: '', artist: '', coverType: '' });
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  // Wikipedia steps behind a toggle when the CD has a listening guide.
  const [hasGuide, setHasGuide] = useState<boolean>(false);
  // The line under the guide: how many listening notes, whether the first is being written, whether Wikipedia is open.
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [writingNote, setWritingNote] = useState<boolean>(false);
  const [storyOpen, setStoryOpen] = useState<boolean | null>(null);
  const deleteBtnRef = React.useRef<HTMLButtonElement>(null);
  const [openingApple, setOpeningApple] = useState<boolean>(false);
  const [appleUrl, setAppleUrl] = useState<string | null>(null);
  const [isInListenNext, setIsInListenNext] = useState<boolean>(false);
  const [togglingListenNext, setTogglingListenNext] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showEdition, setShowEdition] = useState<boolean>(false);
  // A front cover whose file would not load: the placeholder takes its place.
  const [coverBroken, setCoverBroken] = useState<boolean>(false);
  // The track whose details are open under its row, as "disc-position".
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  // What the open track shows: its credits, or its words.
  const [trackView, setTrackView] = useState<'credits' | 'lyrics'>('credits');
  // The tracks that have words, as "disc-number", once DexVault knows.
  const [withWords, setWithWords] = useState<Set<string>>(new Set());
  // Undefined while Navidrome is asked for this CD's rip, read as the album opens.
  const [rip, setRip] = useState<RipTracks | null | undefined>(undefined);
  const [ripError, setRipError] = useState<string | null>(null);
  const [stars, setStars] = useState<number | null>(cd.userRating ?? null);
  const [starsNote, setStarsNote] = useState<string | null>(null);
  const [community, setCommunity] = useState<CommunityRatings>(communityOf(cd));
  const [refreshingMb, setRefreshingMb] = useState<boolean>(false);
  const [mbError, setMbError] = useState<string | null>(null);

  useEffect(() => {
    setCommunity(communityOf(cd));
    setMbError(null);
  }, [cd.id, cd.communityRating, cd.communityVotes]);

  const refreshMusicBrainz = async () => {
    setRefreshingMb(true);
    setMbError(null);
    try {
      if (cd.musicbrainzReleaseId) await musicService.refreshFromMusicBrainz(cd.id);
      setCommunity(communityOf(await musicService.refreshCommunityRating(cd.id) as CommunityRatings));
    } catch (error) {
      setMbError((error as Error).message);
    } finally {
      setRefreshingMb(false);
    }
  };

  // Stars given in Amperfy or Navidrome since the last sync show up as the album opens.
  useEffect(() => {
    let current = true;
    setStars(cd.userRating ?? null);
    setStarsNote(null);
    musicService.syncAlbumRating(cd.id)
      .then(({ userRating }) => { if (current) setStars(userRating ?? null); })
      .catch(() => { /* the stars DexVault holds stay */ });
    return () => { current = false; };
  }, [cd.id, cd.userRating]);

  const rate = async (value: number) => {
    const next = value === stars ? 0 : value;
    const previous = stars;
    setStars(next || null);
    setStarsNote(null);
    try {
      const result = await musicService.setAlbumRating(cd.id, next);
      setStars(result.userRating ?? null);
      if (result.navidrome === 'failed') setStarsNote('Saved here; Navidrome gets it at the next sync.');
    } catch (error) {
      setStars(previous);
      setStarsNote((error as Error).message);
    }
  };

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

  useEffect(() => {
    setNoteCount(null);
    setWritingNote(false);
    setStoryOpen(null);
  }, [cd.id]);
  // Wikipedia is open at once when no guide tells what matters first, until a click says otherwise.
  const showStory = storyOpen ?? !hasGuide;

  // Which tracks have words: those never looked up are, in the background, and asked after again until known.
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setWithWords(new Set());
    const read = (triesLeft: number) => {
      musicService.getAlbumLyrics(cd.id)
        .then(tracks => {
          if (!current) return;
          setWithWords(new Set(tracks.filter(track => track.status === 'found').map(track => `${track.discNumber}-${track.trackNumber}`)));
          if (triesLeft > 0 && tracks.some(track => track.status === 'pending')) timer = setTimeout(() => read(triesLeft - 1), LYRICS_POLL_MS);
        })
        .catch(() => undefined);
    };
    read(LYRICS_POLLS);
    return () => { current = false; clearTimeout(timer); };
  }, [cd.id]);

  // Stepping to another album starts it at the top, not where the last one was left.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [cd.id]);

  useStepKeys(onPrevious, onNext, showCoverModal);
  useScrollKeys(bodyRef, showCoverModal);

  /** Opens a track's credits or words, or closes them when they are what is open. */
  const toggleTrack = (key: string, view: 'credits' | 'lyrics' = 'credits') => {
    if (selectedTrack === key && (trackView === view || view === 'credits')) {
      setSelectedTrack(null);
      return;
    }
    setSelectedTrack(key);
    setTrackView(view);
  };
  const appleMobile = isAppleMobile();

  const ripAlbum = rip?.found ? rip.album : undefined;

  // DexVault's own player, on a computer; an iPhone plays in Amperfy, as before.
  const playerTracks = playerTracksOf(cd, rip);
  const ownPlayer = !appleMobile && playerTracks.length > 0;
  const playerAlbum = () => playerAlbumOf(cd);
  const nowAlbumId = usePlayer(state => state.album?.id ?? null);
  const nowTrack = usePlayer(state => state.tracks[state.index]);
  const nowPlaying = usePlayer(state => state.playing);
  const resume = usePlayer(state => state.resume);
  const playingHere = nowAlbumId === Number(cd.id);
  const resumeHere = !playingHere && resume?.album.id === Number(cd.id) ? resume : null;
  /** Plays the album from a track, the rest of it after. */
  const playFrom = (disc: number, no: number) => {
    const index = playerTracks.findIndex(track => track.disc === disc && track.no === no);
    player.playAlbum(playerAlbum(), playerTracks, Math.max(0, index));
  };

  const albumArtists = Array.isArray(cd.artist) ? cd.artist : [cd.artist];
  const discsCredits = (cd.discs || []).map((disc: CdDisc) => discCredits(disc.tracks, albumArtists));

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
  const labels = (cd.labels || []).join(', ');
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
      className="music-detail-modal side-panel-modal"
      backdropClassName="side-panel-backdrop"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          <BsDisc className="me-2" />
          {cd.title}
        </Modal.Title>
        <ShelfCode kind="album" id={cd.id} variant="inline" className="music-detail-shelf" />
        <DetailSteps onPrevious={onPrevious} onNext={onNext} noun="album" />
      </Modal.Header>

      <Modal.Body ref={bodyRef}>
        {/* The head: the cover, who and what, how to listen, then the facts of this edition. */}
        <div className="album-head">
          <div className="album-head-covers">
            {frontCover ? (
              <img
                key={`front-${cd.id}`}
                src={frontCover}
                alt={`${cd.title} front cover`}
                className="album-head-cover"
                onClick={() => handleCoverClick(frontCover, 'Front')}
                onError={() => setCoverBroken(true)}
              />
            ) : (
              <div className="album-head-cover album-head-cover-empty" aria-hidden="true">
                <BsDisc size={40} />
              </div>
            )}
            {backCover && (
              <img
                key={`back-${cd.id}`}
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

          </div>

          <dl className="album-head-facts">
            <Field label="Rating">
              <span className="album-head-rating">
                <span className="album-head-stars" role="group" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      className={`album-head-star${stars && value <= stars ? ' album-head-star-on' : ''}`}
                      aria-label={`${value} star${value > 1 ? 's' : ''}`}
                      aria-pressed={stars === value}
                      title={stars === value ? 'Take the stars away' : `${value} star${value > 1 ? 's' : ''}`}
                      onClick={() => rate(value)}
                    >
                      {stars && value <= stars ? <BsStarFill aria-hidden="true" /> : <BsStar aria-hidden="true" />}
                    </button>
                  ))}
                </span>
                {/* The community's rating beside one's own, in a murmur. */}
                {(cd.musicbrainzReleaseId || cd.urls?.discogs) && (
                  <span className="album-head-muted">
                    {typeof community.communityRating === 'number' ? (
                      <span title={communityDetail(community)}>
                        <span className="album-head-community">
                          <BsStarFill aria-hidden="true" /> {community.communityRating.toFixed(1)}
                        </span>
                        <span> / 5 · {votesLabel(community.communityVotes ?? 0)}</span>
                      </span>
                    ) : (
                      <span title={communityDetail(community) || undefined}>
                        {community.communityVotes ? `Too few votes (${community.communityVotes})` : 'No community rating'}
                      </span>
                    )}
                    <button
                      type="button"
                      className="album-head-refresh"
                      onClick={refreshMusicBrainz}
                      disabled={refreshingMb}
                      aria-label="Refresh the community rating"
                      title="Reread MusicBrainz and Discogs"
                    >
                      <BsArrowClockwise aria-hidden="true" className={refreshingMb ? 'album-head-spinning' : undefined} />
                    </button>
                  </span>
                )}
              </span>
              {starsNote && <span className="album-head-note">{starsNote}</span>}
              {mbError && <span className="album-head-note">{mbError}</span>}
            </Field>
            {/* The edition in one line: year and country, its label, the first release only when it is another year. */}
            {(released || labels || original) && (
              <Field label="Released">
                {[released, labels].filter(Boolean).join(' · ')}
                {original && <span className="album-head-muted">{released || labels ? ' · ' : ''}first {original}</span>}
              </Field>
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
            {/* What is rarely wanted, folded away: the credits, the copy owned, the codes, the old notes. */}
            <dt>Advanced</dt>
            <dd>
              <button
                type="button"
                className="album-head-link album-head-toggle"
                aria-expanded={showAdvanced}
                aria-controls={`album-advanced-${cd.id}`}
                onClick={() => setShowAdvanced(open => !open)}
              >
                <BsChevronRight aria-hidden="true" className={showAdvanced ? 'album-head-chevron-open' : undefined} />
                {showAdvanced ? 'Hide' : 'Show'}
              </button>
            </dd>
            {showAdvanced && (
              <div className="album-head-advanced" id={`album-advanced-${cd.id}`}>
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
                <Field label="In DexVault">
                  <span className="album-head-muted">
                    added {added}
                    {updated && updated !== added && ` · updated ${updated}`}
                  </span>
                </Field>
                {cd.catalogNumber && <Field label="Catalogue no."><code className="album-head-code">{cd.catalogNumber}</code></Field>}
                {cd.barcode && <Field label="Barcode"><code className="album-head-code">{cd.barcode}</code></Field>}
                {cd.isrcCodes && cd.isrcCodes.length > 0 && (
                  <Field label="ISRC"><code className="album-head-code">{cd.isrcCodes.join(', ')}</code></Field>
                )}
                {cd.musicbrainzReleaseId && (
                  <Field label="MusicBrainz"><code className="album-head-code">{cd.musicbrainzReleaseId}</code></Field>
                )}
                {cd.annotation && (
                  <Field label="Album notes"><span className="album-head-annotation">{cd.annotation}</span></Field>
                )}
              </div>
            )}
          </dl>
        </div>

        <AlbumGuide albumId={Number(cd.id)} onLoaded={setHasGuide} />
        <AlbumNotes albumId={Number(cd.id)} writing={writingNote} onCount={setNoteCount} />
        {/* One line for what is a click away: the first listening note, the story on Wikipedia. */}
        <div className="album-extras">
          {noteCount === 0 && (
            <>
              <button type="button" className="album-extras-link" aria-expanded={writingNote} onClick={() => setWritingNote(!writingNote)}>
                <BsPencil aria-hidden="true" />
                Write a listening note…
              </button>
              <span className="album-extras-sep" aria-hidden="true">·</span>
            </>
          )}
          <button type="button" className="album-extras-link" aria-expanded={showStory} onClick={() => setStoryOpen(!showStory)}>
            <BsChevronRight aria-hidden="true" className={showStory ? 'album-extras-chevron-open' : undefined} />
            Read on Wikipedia…
          </button>
        </div>
        <AlbumStory albumId={cd.id} open={showStory} />

        {/* Track Listing */}
        {cd.discs && cd.discs.length > 0 && (
          <div className="info-section">
            <div className="track-listing-header">
              <h4>Track Listing</h4>
            </div>
            {cd.discs.map((disc: CdDisc, discIndex: number) => {
              const credits = discsCredits[discIndex];
              // The movements of a work go under its heading, which says who wrote and who plays them all;
              // under a movement, only what differs. Who wrote the rest is in each track's credits.
              const works = workGroups(disc.tracks.map(track => track.title));
              const workCredits = new Map<number, ReturnType<typeof discCredits> & { start: number }>();
              works.forEach((work, index) => {
                if (!work?.first) return;
                let end = index + 1;
                while (works[end] && !works[end]!.first) end++;
                workCredits.set(index, { ...discCredits(disc.tracks.slice(index, end), albumArtists), start: index });
                for (let i = index + 1; i < end; i++) workCredits.set(i, workCredits.get(index)!);
              });
              return (
                <div key={discIndex} className="disc-tracks mb-3">
                  {cd.discs!.length > 1 && (
                    <h6 className="disc-title">Disc {disc.number}</h6>
                  )}
                  <div className="track-list">
                    {disc.tracks.map((track: CdTrack, trackIndex: number) => {
                      const key = `${disc.number}-${trackIndex}`;
                      const open = selectedTrack === key;
                      const words = withWords.has(`${disc.number}-${track.no}`);
                      const file = rip?.found ? ripFileFor(rip.tracks, disc.number, Number(track.no)) : null;
                      const playUrl = file ? trackListenUrl(file, appleMobile) : null;
                      const ownPlay = ownPlayer && Boolean(file?.id);
                      const current = playingHere && nowTrack?.disc === disc.number && nowTrack?.no === Number(track.no);
                      // The buttons inside the row act on their own, not as a click on the row.
                      const own = (event: React.SyntheticEvent) => event.stopPropagation();
                      const work = works[trackIndex];
                      return (
                      <React.Fragment key={trackIndex}>
                      {work?.first && (
                        <div className="track-work">
                          {work.work}
                          {workCredits.get(trackIndex)?.common && <span className="track-work-by"> · {workCredits.get(trackIndex)!.common}</span>}
                        </div>
                      )}
                      <div
                        className={`track-item track-selectable${open ? ' track-selected' : ''}${work ? ' track-in-work' : ''}${current ? ' track-current' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        aria-controls={open ? `track-details-${key}` : undefined}
                        onClick={() => toggleTrack(key)}
                        onKeyDown={(event: React.KeyboardEvent) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleTrack(key);
                          }
                        }}
                      >
                        <span className={`track-number${playUrl || ownPlay ? ' track-playable' : ''}`}>
                          <span className="track-number-text">
                            {current ? (
                              <NowPlayingBars playing={nowPlaying} />
                            ) : `${track.no}.`}
                          </span>
                          {ownPlay ? (
                            <button type="button" className="track-play" onClick={event => { own(event); if (current) player.toggle(); else playFrom(disc.number, Number(track.no)); }}
                              onKeyDown={own} aria-label={`${current && nowPlaying ? 'Pause' : 'Play'} ${track.title}`} title={current && nowPlaying ? 'Pause' : 'Play'}>
                              {current && nowPlaying ? <BsPauseFill aria-hidden="true" /> : <BsPlayFill aria-hidden="true" />}
                            </button>
                          ) : playUrl && (
                            <a className="track-play" href={playUrl} aria-label={`Play ${track.title} in ${appleMobile ? 'Amperfy' : 'Navidrome'}`}
                              title={`Play in ${appleMobile ? 'Amperfy' : 'Navidrome'}`} onClick={own} onKeyDown={own}
                              {...(appleMobile ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
                              <BsPlayFill aria-hidden="true" />
                            </a>
                          )}
                        </span>
                        <span className="track-title">
                          {work ? work.movement : track.title}
                          {words && (open ? (
                            <span className="track-view" role="group" aria-label="Show">
                              {(['credits', 'lyrics'] as const).map(view => (
                                <button key={view} type="button" className={trackView === view ? 'active' : ''} aria-pressed={trackView === view}
                                  onClick={event => { own(event); setTrackView(view); }} onKeyDown={own}>{view}</button>
                              ))}
                            </span>
                          ) : (
                            <button type="button" className="track-lyrics-tag" title="Show the lyrics"
                              onClick={event => { own(event); toggleTrack(key, 'lyrics'); }} onKeyDown={own}>lyrics</button>
                          ))}
                          {(() => {
                            const inWork = workCredits.get(trackIndex);
                            const line = inWork ? inWork.perTrack[trackIndex - inWork.start] : credits.perTrack[trackIndex];
                            return line && <span className="track-credits">{line}</span>;
                          })()}
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
                          albumId={Number(cd.id)}
                          albumArtists={Array.isArray(cd.artist) ? cd.artist : [cd.artist]}
                          rip={rip}
                          ripError={ripError}
                          view={words ? trackView : 'credits'}
                          onSearch={onSearch ? predicate => { onSearch(predicate); onClose(); } : undefined}
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
        {/* How to listen on the left, always at hand however far the body has scrolled. */}
        <div className="music-detail-listen">
          {ownPlayer && ripAlbum ? (
            // Play, Pause or Resume what DexVault plays; Navidrome a click away.
            <Dropdown as={ButtonGroup} drop="up" className="music-detail-play">
              <Button variant="primary" onClick={() => {
                if (playingHere) player.toggle();
                else if (resumeHere) player.resume();
                else player.playAlbum(playerAlbum(), playerTracks, 0);
              }}>
                {playingHere && nowPlaying ? <BsPauseFill className="me-1" /> : <BsPlayFill className="me-1" />}
                {playingHere ? (nowPlaying ? 'Pause' : 'Resume') : resumeHere ? 'Resume' : 'Play'}
                {resumeHere && (
                  <span className="music-detail-play-where">
                    {' · '}{resumeHere.tracks[resumeHere.index]?.title} {Math.floor(resumeHere.position / 60)}:{String(Math.floor(resumeHere.position % 60)).padStart(2, '0')}
                  </span>
                )}
              </Button>
              <Dropdown.Toggle split variant="primary" aria-label="More ways to listen" />
              <Dropdown.Menu>
                {(playingHere || resumeHere) && (
                  <Dropdown.Item as="button" onClick={() => player.playAlbum(playerAlbum(), playerTracks, 0)}>Play from the start</Dropdown.Item>
                )}
                <Dropdown.Item as="button" onClick={() => openListen(ripAlbum)}>Open in Navidrome</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : ripAlbum ? (
            <Button variant="primary" onClick={() => openListen(ripAlbum)}>
              <BsPlayFill className="me-1" />
              Listen
            </Button>
          ) : rip === undefined && !ripError ? (
            <Button variant="primary" disabled>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Listen
            </Button>
          ) : (
            <Button variant="outline-light" disabled={openingApple} onClick={handleOpenAppleMusic}>
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
            onClick={handleListenNextToggle}
            disabled={togglingListenNext}
          >
            <BsHeadphones className="me-1" />
            {isInListenNext ? 'In Listen Next' : 'Listen Next'}
          </Button>
        </div>
        <div className="music-detail-manage">
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
        </div>
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
