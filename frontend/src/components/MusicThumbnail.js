import React, { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsMusicNote, BsThreeDots, BsApple, BsPencil, BsTrash } from 'react-icons/bs';
import musicService from '../services/musicService';
import ListenNextToggle from './ListenNextToggle';
import './MusicThumbnail.css';

const MusicThumbnail = ({ cd, onClick, onEdit, onDelete, disableMenu = false, onListenNextChange, isInListenNext: isInListenNextProp }) => {
  const [openingApple, setOpeningApple] = useState(false);
  const [togglingListenNext, setTogglingListenNext] = useState(false);
  
  // Use prop if provided, otherwise local state (for backwards compatibility)
  const isInListenNext = isInListenNextProp !== undefined ? isInListenNextProp : false;
  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    // Let parent control confirmation modal
    onDelete();
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

  const handleListenNextToggle = async (e) => {
    e.stopPropagation();
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
    <div className="music-thumbnail" onClick={onClick}>
      <div className="music-thumbnail-cover">
        {getCoverImage() ? (
          <img 
            src={getCoverImage()} 
            alt={`${cd.title} cover`}
            className="music-thumbnail-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className="music-thumbnail-placeholder"
          style={{ display: getCoverImage() ? 'none' : 'flex' }}
        >
          <BsMusicNote size={32} />
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
        <div className="music-thumbnail-menu" onClick={(e) => e.stopPropagation()}>
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
                  try {
                    setOpeningApple(true);
                    // Try immediate open if URL cached and is an Apple Music link
                    const cached = cd?.urls?.appleMusic;
                    const isAppleLink = typeof cached === 'string' && /https?:\/\/(music|itunes)\.apple\.com\//.test(cached);
                    if (isAppleLink) {
                      musicService.openAppleMusic(cached);
                      setOpeningApple(false);
                      return;
                    }
                    // Otherwise fetch asynchronously, then open
                    const { url } = await musicService.getAppleMusicUrl(cd.id);
                    musicService.openAppleMusic(url);
                  } catch (e) {
                    console.error('Failed to open Apple Music:', e);
                  } finally {
                    setOpeningApple(false);
                  }
                }}
              >
                <BsApple className="me-2" /> Open in Apple Music
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

