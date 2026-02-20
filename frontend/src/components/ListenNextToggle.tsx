import React from 'react';
import './ListenNextToggle.css';

interface IconConfigEntry {
  filled: string;
  outline: string;
  title: string;
}

interface IconConfig {
  type: string;
  icons: Record<string, IconConfigEntry>;
}

// Icon configuration - headphone icon for music
const ICON_CONFIG: IconConfig = {
  type: 'headphone',
  icons: {
    headphone: {
      filled: '\uD83C\uDFA7',
      outline: '\uD83C\uDFA7',
      title: 'Listen Next'
    }
  }
};

interface ListenNextToggleProps {
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const ListenNextToggle = ({ isActive, onClick, disabled = false }: ListenNextToggleProps) => {
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
