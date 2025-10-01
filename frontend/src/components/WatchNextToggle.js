import React from 'react';
import './WatchNextToggle.css';

// Icon configuration - change this to switch between popcorn and star
const ICON_CONFIG = {
  type: 'star', // 'popcorn' or 'star'
  icons: {
    popcorn: {
      filled: '🍿',
      outline: '🍿',
      title: 'Watch Next'
    },
    star: {
      filled: '⭐',
      outline: '☆',
      title: 'Watch Next'
    }
  }
};

const WatchNextToggle = ({ isActive, onClick, disabled = false }) => {
  const config = ICON_CONFIG.icons[ICON_CONFIG.type];
  
  return (
    <button
      className={`watch-next-toggle ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
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

export default WatchNextToggle;

