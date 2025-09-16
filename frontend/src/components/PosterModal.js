import React from 'react';
import { createPortal } from 'react-dom';

const PosterModal = ({ isOpen, onClose, posterUrl, title, year, source }) => {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      console.log('Modal opened:', { posterUrl, title, year });
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, posterUrl, title, year]);

  if (!isOpen) return null;

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    cursor: 'pointer',
    margin: 0,
    padding: 0
  };

  const imageStyle = {
    maxWidth: '90vw',
    maxHeight: '90vh',
    objectFit: 'contain',
    cursor: 'default',
    zIndex: 10000,
    position: 'relative'
  };

  const modalContent = (
    <div style={overlayStyle} onClick={onClose}>
      <img
        src={posterUrl}
        alt={`${title} poster`}
        style={imageStyle}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );

  // Use createPortal to render directly to document.body
  return createPortal(modalContent, document.body);
};

export default PosterModal;
