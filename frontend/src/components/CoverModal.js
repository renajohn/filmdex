import React from 'react';
import { createPortal } from 'react-dom';

const CoverModal = ({ isOpen, onClose, coverUrl, title, artist, coverType }) => {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10200,
    cursor: 'pointer',
    margin: 0,
    padding: 0
  };

  const imageStyle = {
    maxWidth: '90vw',
    maxHeight: '90vh',
    objectFit: 'contain',
    cursor: 'default',
    zIndex: 10201,
    position: 'relative',
    borderRadius: '8px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
  };

  const titleStyle = {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'white',
    fontSize: '18px',
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: '8px 16px',
    borderRadius: '4px',
    zIndex: 10202,
    pointerEvents: 'none'
  };

  const modalContent = (
    <div style={overlayStyle} onClick={onClose}>
      <img
        src={coverUrl}
        alt={`${title} ${coverType} cover`}
        style={imageStyle}
      />
      <div style={titleStyle}>
        {artist && Array.isArray(artist) ? artist.join(', ') : artist} - {title}
        <br />
        <span style={{ fontSize: '14px', opacity: 0.8 }}>{coverType} Cover</span>
      </div>
    </div>
  );

  // Use createPortal to render directly to document.body
  return createPortal(modalContent, document.body);
};

export default CoverModal;
