import React from 'react';
import { BsGear, BsArrowClockwise, BsArchive, BsBookshelf } from 'react-icons/bs';
import Menu from './shared/Menu';
import Spinner from './shared/Spinner';
import './CogDropdown.css';

interface CogDropdownProps {
  onSyncNavidrome?: () => void;
  syncingNavidrome?: boolean;
  onBackup?: () => void;
  onShelves?: () => void;
  currentPage?: string;
}

/** ⚙︎ in the header: what each collection offers, then what DexVault does for all of them. */
const CogDropdown: React.FC<CogDropdownProps> = ({
  onSyncNavidrome,
  syncingNavidrome = false,
  onBackup,
  onShelves,
  currentPage = 'dexvault'
}) => (
  <div className="cog-dropdown">
    <Menu align="end" label="Menu" trigger={props => (
      <button type="button" {...props} className="cog-button" aria-label="Menu">
        <BsGear />
      </button>
    )}>
      {currentPage === 'musicdex' && (
        <>
          <Menu.Section title="MusicDex" />
          <Menu.Item icon={syncingNavidrome ? <Spinner size="sm" /> : <BsArrowClockwise />} disabled={syncingNavidrome} onSelect={onSyncNavidrome}>
            {syncingNavidrome ? 'Reading Navidrome…' : 'Sync Navidrome'}
          </Menu.Item>
          <Menu.Separator />
        </>
      )}
      <Menu.Section title="DexVault" />
      <Menu.Item icon={<BsBookshelf />} hint="⌘7" onSelect={onShelves}>Shelves</Menu.Item>
      <Menu.Item icon={<BsArchive />} onSelect={onBackup}>Backups</Menu.Item>
    </Menu>
  </div>
);

export default CogDropdown;
