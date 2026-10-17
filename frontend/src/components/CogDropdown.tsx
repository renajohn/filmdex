import React from 'react';
import { BsGear, BsUpload, BsDownload, BsArrowsAngleContract, BsImage, BsArchive, BsBookshelf } from 'react-icons/bs';
import Menu from './shared/Menu';
import './CogDropdown.css';

interface CogDropdownProps {
  onImportMovies?: () => void;
  onAddMovie?: () => void;
  onExportCSV?: () => void;
  onAddCD?: () => void;
  onResizeCovers?: () => void;
  onFillCovers?: () => void;
  onExportAlbumsCSV?: () => void;
  onAddBook?: () => void;
  onExportBooksCSV?: () => void;
  onBackup?: () => void;
  onShelves?: () => void;
  currentPage?: string;
}

/** ⚙︎ in the header: what each collection offers, then what DexVault does for all of them. */
const CogDropdown: React.FC<CogDropdownProps> = ({
  onImportMovies,
  onExportCSV,
  onResizeCovers,
  onFillCovers,
  onExportAlbumsCSV,
  onExportBooksCSV,
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
      {currentPage === 'musicdex' ? (
        <>
          <Menu.Section title="MusicDex" />
          <Menu.Item icon={<BsDownload />} onSelect={onExportAlbumsCSV}>CSV Export</Menu.Item>
          <Menu.Item icon={<BsArrowsAngleContract />} onSelect={onResizeCovers}>Resize covers</Menu.Item>
          <Menu.Item icon={<BsImage />} onSelect={onFillCovers}>Fill covers</Menu.Item>
        </>
      ) : currentPage === 'bookdex' ? (
        <>
          <Menu.Section title="BookDex" />
          <Menu.Item icon={<BsDownload />} onSelect={onExportBooksCSV}>CSV Export</Menu.Item>
        </>
      ) : (
        <>
          <Menu.Section title="FilmDex" />
          <Menu.Item icon={<BsUpload />} onSelect={onImportMovies}>CSV Import</Menu.Item>
          <Menu.Item icon={<BsDownload />} onSelect={onExportCSV}>CSV Export</Menu.Item>
        </>
      )}
      <Menu.Separator />
      <Menu.Section title="DexVault" />
      <Menu.Item icon={<BsBookshelf />} onSelect={onShelves}>Shelves</Menu.Item>
      <Menu.Item icon={<BsArchive />} onSelect={onBackup}>Backups</Menu.Item>
    </Menu>
  </div>
);

export default CogDropdown;
