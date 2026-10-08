import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsDisc, BsThreeDots, BsPlayFill, BsPencil, BsTrash } from 'react-icons/bs';
import musicService from '../services/musicService';
import ListenNextToggle from './ListenNextToggle';
import { isAppleMobile, openListen } from '../utils/navidrome';
import './MusicThumbnail.css';

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
  onEdit: () => void;
  onDelete: () => void;
  disableMenu?: boolean;
  onListenNextChange?: () => void;
  isInListenNext?: boolean;
  dataItemId?: number | string;
  dataFirstLetter?: string;
}

const MusicThumbnail: React.FC<MusicThumbnailProps> = ({ cd, onClick, onEdit, onDelete, disableMenu = false, onListenNextChange, isInListenNext: isInListenNextProp, dataItemId, dataFirstLetter }) => {
  const [openingApple, setOpeningApple] = useState<boolean>(false);
  const [togglingListenNext, setTogglingListenNext] = useState<boolean>(false);

  // Use prop if provided, otherwise local state (for backwards compatibility)
  const isInListenNext = isInListenNextProp !== undefined ? isInListenNextProp : false;
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Let parent control confirmation modal
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
        {openingApple && (
          <div className="thumbnail-opening-overlay">
            <div className="spinner-border text-light spinner-border-sm" role="status">
              <span className="visually-hidden">Opening...</span>
            </div>
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
        {/* Year removed from thumbnail view per Apple Music aesthetic */}
      </div>

      {!disableMenu && (
        <div className="music-thumbnail-menu" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Dropdown align="end">
            <Dropdown.Toggle
              variant="outline-secondary"
              size="sm"
              className="music-thumbnail-dropdown-toggle"
            >
              <BsThreeDots />
            </Dropdown.Toggle>

            <Dropdown.Menu>
              <Dropdown.Item
                onClick={async () => {
                  // The tab opens during the click: one opened after the lookup would be blocked as a pop-up.
                  const tab = isAppleMobile() ? null : window.open('', '_blank');
                  try {
                    setOpeningApple(true);
                    // The rip in Navidrome when there is one, Apple Music otherwise.
                    const rip = await musicService.getNavidromeTracks(cd.id).catch(() => null);
                    if (rip?.found && rip.album) {
                      openListen(rip.album, tab);
                      return;
                    }
                    const cached = cd?.urls?.appleMusic;
                    const isAppleLink = typeof cached === 'string' && /https?:\/\/(music|itunes)\.apple\.com\//.test(cached);
                    const url = isAppleLink ? cached as string : (await musicService.getAppleMusicUrl(cd.id) as { url: string }).url;
                    if (tab) {
                      tab.location.href = url;
                    } else {
                      musicService.openAppleMusic(url);
                    }
                  } catch (e) {
                    tab?.close();
                    console.error('Failed to open the album:', e);
                  } finally {
                    setOpeningApple(false);
                  }
                }}
              >
                <BsPlayFill className="me-2" /> Listen
              </Dropdown.Item>
              <Dropdown.Item onClick={handleEditClick}>
                <BsPencil className="me-2" /> Edit
              </Dropdown.Item>
              <Dropdown.Item onClick={handleDeleteClick} className="text-danger">
                <BsTrash className="me-2" /> Delete
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      )}
    </div>
  );
};

export default MusicThumbnail;
