import React from 'react';
import './WatchNextToggle.css';

interface IconConfigEntry {
  filled: string;
  outline: string;
  title: string;
}

interface IconConfig {
  type: string;
  icons: Record<string, IconConfigEntry>;
}

// Icon configuration - change this to switch between popcorn and star
const ICON_CONFIG: IconConfig = {
  type: 'star', // 'popcorn' or 'star'
  icons: {
    popcorn: {
      filled: '\uD83C\uDF7F',
      outline: '\uD83C\uDF7F',
      title: 'Watch Next'
    },
    star: {
      filled: '\u2B50',
      outline: '\u2606',
      title: 'Watch Next'
    }
  }
};

interface WatchNextToggleProps {
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const WatchNextToggle = ({ isActive, onClick, disabled = false }: WatchNextToggleProps) => {
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
