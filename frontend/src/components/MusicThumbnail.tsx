import React, { useState } from 'react';
import { BsDisc } from 'react-icons/bs';
import musicService from '../services/musicService';
import ListenNextToggle from './ListenNextToggle';
import { isAppleMobile } from '../utils/navidrome';
import './MusicThumbnail.css';
import ShelfCode from './shared/ShelfCode';
import AlbumPlayButton from './shared/AlbumPlayButton';

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
}

const MusicThumbnail: React.FC<MusicThumbnailProps> = ({ cd, onClick, onListenNextChange, isInListenNext: isInListenNextProp, dataItemId, dataFirstLetter }) => {
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
        {/* Year removed from thumbnail view per Apple Music aesthetic */}
      </div>

    </div>
  );
};

export default MusicThumbnail;
