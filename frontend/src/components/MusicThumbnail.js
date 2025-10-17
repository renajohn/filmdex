import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsMusicNote, BsThreeDots } from 'react-icons/bs';
import './MusicThumbnail.css';

const MusicThumbnail = ({ cd, onClick, onEdit, onDelete }) => {
  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    // Show confirmation before deleting
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
    if (cd.cover) {
      // If it's already a full URL or starts with /api/images/ or /images/, use as is
      if (cd.cover.startsWith('http') || cd.cover.startsWith('/api/images/') || cd.cover.startsWith('/images/')) {
        return cd.cover;
      }
      // Otherwise, prepend /api/images/ for ingress compatibility
      return `/api/images/${cd.cover}`;
    }
    return null;
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
      </div>
      
      <div className="music-thumbnail-info">
        <h6 className="music-thumbnail-title" title={cd.title}>
          {cd.title}
        </h6>
        <p className="music-thumbnail-artist" title={getArtistDisplay()}>
          {getArtistDisplay()}
        </p>
        {cd.releaseYear && (
          <p className="music-thumbnail-year">
            {cd.releaseYear}
          </p>
        )}
      </div>

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
            <Dropdown.Item onClick={handleEditClick}>
              Edit
            </Dropdown.Item>
            <Dropdown.Item onClick={handleDeleteClick} className="text-danger">
              Delete
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </div>
  );
};

export default MusicThumbnail;

