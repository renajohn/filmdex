import React from 'react';
import './ListenNextToggle.css';

// Icon configuration - headphone icon for music
const ICON_CONFIG = {
  type: 'headphone',
  icons: {
    headphone: {
      filled: '🎧',
      outline: '🎧',
      title: 'Listen Next'
    }
  }
};

const ListenNextToggle = ({ isActive, onClick, disabled = false }) => {
  const config = ICON_CONFIG.icons[ICON_CONFIG.type];
  
  return (
    <button
      className={`listen-next-toggle ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={config.title}
      aria-label={config.title}
    >
      <span className="icon">
        {isActive ? config.filled : <span className="outline">{config.outline}</span>}
      </span>
    </button>
  );
};

export default ListenNextToggle;

