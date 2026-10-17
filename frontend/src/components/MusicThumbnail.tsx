import React, { useState } from 'react';
import { BsDisc } from 'react-icons/bs';
import musicService from '../services/musicService';
import ListenNextToggle from './ListenNextToggle';
import { isAppleMobile } from '../utils/navidrome';
import './MusicThumbnail.css';
import ShelfCode from './shared/ShelfCode';
import AlbumPlayButton from './shared/AlbumPlayButton';
import DigitalMarks from './shared/DigitalMarks';
import type { AlbumDigital } from '../utils/digitalLibrary';
import { BsHeart, BsHeartFill, BsXLg } from 'react-icons/bs';

interface CdData {
  id: number | string;
  title: string;
  artist: string | string[];
  cover?: string;
  urls?: {
    appleMusic?: string;
    [key: string]: string | undefined;
  };
  [key: string]: unknown;
}

interface MusicThumbnailProps {
  cd: CdData;
  onClick: () => void;
  onListenNextChange?: () => void;
  isInListenNext?: boolean;
  dataItemId?: number | string;
  dataFirstLetter?: string;
  /** How the album stands in Navidrome, with Digital on; undefined with it off, and no mark is shown. */
  digital?: AlbumDigital;
  /** In Buy: why, and the heart and ✕ under the pointer in place of Listen Next. */
  buy?: { reason: string | null; wished: boolean; onWish: () => void; onDismiss?: () => void };
}

const MusicThumbnail: React.FC<MusicThumbnailProps> = ({ cd, onClick, onListenNextChange, isInListenNext: isInListenNextProp, dataItemId, dataFirstLetter, digital, buy }) => {
  const [togglingListenNext, setTogglingListenNext] = useState<boolean>(false);

  // Use prop if provided, otherwise local state (for backwards compatibility)
  const isInListenNext = isInListenNextProp !== undefined ? isInListenNextProp : false;
  const getArtistDisplay = (): string => {
    if (Array.isArray(cd.artist)) {
      return cd.artist.join(', ');
    }
    return cd.artist || 'Unknown Artist';
  };

  const getCoverImage = (): string | null => {
    return musicService.getImageUrl(cd.cover);
  };

  const handleListenNextToggle = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (togglingListenNext) return;

    setTogglingListenNext(true);
    try {
      await musicService.toggleListenNext(cd.id);
      // Refresh the listen next banner immediately (parent will update isInListenNext prop)
      if (onListenNextChange) {
        onListenNextChange();
      }
    } catch (error) {
      console.error('Error toggling Listen Next:', error);
    } finally {
      setTogglingListenNext(false);
    }
  };

  return (
    <div
      className="music-thumbnail"
      onClick={onClick}
      {...(dataItemId ? { 'data-item-id': dataItemId } : {})}
      {...(dataFirstLetter ? { 'data-first-letter': dataFirstLetter } : {})}
    >
      <div className="music-thumbnail-cover">
        {getCoverImage() ? (
          <img
            src={getCoverImage()!}
            alt={`${cd.title} cover`}
            className="music-thumbnail-image"
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
          className="music-thumbnail-placeholder"
          style={{ display: getCoverImage() ? 'none' : 'flex' }}
        >
          <BsDisc size={32} />
        </div>
        {/* ▶ under the pointer plays the album in DexVault; one with no rip opens its card. An iPhone plays in Amperfy. */}
        <AlbumPlayButton albumId={cd.id} title={cd.title} offerPlay={!isAppleMobile()} onUnripped={onClick} className="thumbnail-play" />
        <ShelfCode kind="album" id={cd.id} />
        {digital !== undefined && <DigitalMarks digital={digital} titleStatus={cd.titleStatus as string | undefined} />}
        {/* In Buy, at the top right: an album with no CD has no shelf code there. Listen Next keeps its place below. */}
        {buy && (
          <div className="thumbnail-buy-actions">
            {buy.onDismiss && (
              <button type="button" className="thumbnail-buy-action" title="Not interested" aria-label={`Not interested in ${cd.title}`}
                onClick={event => { event.stopPropagation(); buy.onDismiss!(); }}>
                <BsXLg aria-hidden="true" />
              </button>
            )}
            <button type="button" className={`thumbnail-buy-action thumbnail-buy-wish${buy.wished ? ' active' : ''}`}
              title={buy.wished ? 'Take off the wish list' : 'Add to the wish list'} aria-pressed={buy.wished}
              aria-label={buy.wished ? `Take ${cd.title} off the wish list` : `Add ${cd.title} to the wish list`}
              onClick={event => { event.stopPropagation(); buy.onWish(); }}>
              {buy.wished ? <BsHeartFill aria-hidden="true" /> : <BsHeart aria-hidden="true" />}
            </button>
          </div>
        )}
        <div className="thumbnail-listen-next-toggle">
          <ListenNextToggle
            isActive={isInListenNext}
            onClick={handleListenNextToggle}
            disabled={togglingListenNext}
          />
        </div>
      </div>

      <div className="music-thumbnail-info">
        <h6 className="music-thumbnail-title" title={cd.title}>
          {cd.title}
        </h6>
        <p className="music-thumbnail-artist" title={getArtistDisplay()}>
          {getArtistDisplay()}
        </p>
        {buy?.reason && <p className="music-thumbnail-reason" title={buy.reason}>{buy.reason}</p>}
        {/* Year removed from thumbnail view per Apple Music aesthetic */}
      </div>

    </div>
  );
};

export default MusicThumbnail;
