import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsMusicNote, BsThreeDots, BsApple, BsPencil, BsTrash } from 'react-icons/bs';
import musicService from '../services/musicService';
import './MusicThumbnail.css';

const MusicThumbnail = ({ cd, onClick, onEdit, onDelete, disableMenu = false }) => {
  const [openingApple, setOpeningApple] = useState(false);
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
                    const { url } = await musicService.getAppleMusicUrl(cd.id);
                    musicService.openAppleMusic(url);
                  } catch (e) {
                    // Silently fail or consider toast via parent in future
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

