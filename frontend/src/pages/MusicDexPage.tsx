
import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import MusicSearch from '../components/MusicSearch';
import ResizeCoversMigrationModal from '../components/ResizeCoversMigrationModal';
import FillBackCoversModal from '../components/FillBackCoversModal';
import musicService from '../services/musicService';

interface MigrationResult {
  total: number;
  processed: number;
  downloaded?: number;
  resized: number;
  skipped: number;
  errors: number;
  errorDetails?: Array<{
    albumId: number;
    title: string;
    error: string;
  }>;
}

const MusicSearchComponent: any = MusicSearch;

interface MusicDexPageProps {
  searchCriteria?: any;
}

export interface MusicDexPageRef {
  openAddDialog: () => void;
  openResizeMigrationModal: () => void;
  openFillCoversModal: () => void;
}

const MusicDexPage = forwardRef<MusicDexPageRef, MusicDexPageProps>(({ searchCriteria }, ref) => {
  const location = useLocation();
  const [cds, setCds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success');
  const [showAlert, setShowAlert] = useState(false);
  const [showResizeMigrationModal, setShowResizeMigrationModal] = useState(false);
  const [showFillCoversModal, setShowFillCoversModal] = useState(false);
  const musicSearchRef = useRef<any>(null);

  useEffect(() => {
    loadCds();

    // Check for URL search parameters
    const urlParams = new URLSearchParams(location.search);
    const searchParam = urlParams.get('search');
    if (searchParam && musicSearchRef.current) {
      // Set the search query in the MusicSearch component
      musicSearchRef.current.setSearchQuery(searchParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    openAddDialog: () => {
      if (musicSearchRef.current) {
        musicSearchRef.current.openAddDialog();
      }
    },
    openResizeMigrationModal: () => {
      setShowResizeMigrationModal(true);
    },
    openFillCoversModal: () => {
      setShowFillCoversModal(true);
    }
  }));

  const handleOpenAddDialog = () => {
    if (musicSearchRef.current) {
      musicSearchRef.current.openAddDialog();
    }
  };

  const loadCds = async () => {
    try {
      setLoading(true);
      const data = await musicService.getAlbumsByStatus('owned') as any[];
      setCds(data);
    } catch (error) {
      console.error('Error loading albums:', error);
      showAlertMessage('Failed to load albums: ' + (error as Error).message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const showAlertMessage = (message: string, type: string = 'success') => {
    setAlertMessage(message);
    setAlertType(type);
    setShowAlert(true);
    setTimeout(() => {
      setShowAlert(false);
    }, 5000);
  };

  const handleAddCd = async (cdData: any) => {
    try {
      const createdAlbum = await musicService.addAlbum(cdData);
      await loadCds();
      showAlertMessage('Album added successfully!', 'success');
      return createdAlbum; // Return the created album data
    } catch (error) {
      console.error('Error adding album:', error);
      showAlertMessage('Failed to add album: ' + (error as Error).message, 'danger');
      throw error;
    }
  };

  const handleAddCdFromMusicBrainz = async (releaseId: string, additionalData: any) => {
    try {
      const createdAlbum = await musicService.addAlbumFromMusicBrainz(releaseId, additionalData);
      await loadCds();
      showAlertMessage('Album added successfully from MusicBrainz!', 'success');
      return createdAlbum; // Return the created album data
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      showAlertMessage('Failed to add album: ' + (error as Error).message, 'danger');
      throw error;
    }
  };

  const handleAddCdByBarcode = async (barcode: string, additionalData: any) => {
    try {
      const createdAlbum = await musicService.addAlbumByBarcode(barcode, additionalData);
      await loadCds();
      showAlertMessage('Album added successfully by barcode!', 'success');
      return createdAlbum; // Return the created album data
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      showAlertMessage('Failed to add album: ' + (error as Error).message, 'danger');
      throw error;
    }
  };

  const handleUpdateCd = async (id: number, cdData: any) => {
    try {
      await musicService.updateAlbum(id, cdData);
      await loadCds();
      showAlertMessage('Album updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating album:', error);
      showAlertMessage('Failed to update album: ' + (error as Error).message, 'danger');
    }
  };

  const handleDeleteCd = async (id: number) => {
    try {
      await musicService.deleteAlbum(id);
      await loadCds();
      showAlertMessage('Album deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting album:', error);
      showAlertMessage('Failed to delete album: ' + (error as Error).message, 'danger');
    }
  };

  const handleResizeMigration = async () => {
    return await musicService.resizeAllAlbumCovers() as MigrationResult;
  };

  const handleFillCovers = async (action: string, albumIds: number[], type: string, progressCallback?: (progress: any) => void) => {
    if (action === 'getAlbums') {
      return await musicService.getAlbumsMissingCovers(type);
    } else if (action === 'fillCovers') {
      const result = await musicService.fillCovers(albumIds, type);
      // Reload albums to show updated covers
      await loadCds();
      return result;
    }
    return undefined;
  };

  return (
    <div className="musicdex-page">
      <MusicSearchComponent
        ref={musicSearchRef}
        cds={cds}
        loading={loading}
        onAddCd={handleAddCd}
        onAddCdFromMusicBrainz={handleAddCdFromMusicBrainz}
        onAddCdByBarcode={handleAddCdByBarcode}
        onUpdateCd={handleUpdateCd}
        onDeleteCd={handleDeleteCd}
        onShowAlert={showAlertMessage}
        onOpenAddDialog={handleOpenAddDialog}
        refreshTrigger={cds.length}
        searchCriteria={searchCriteria}
      />

      {/* Alert */}
      {showAlert && (
        <div className={`alert alert-${alertType} alert-dismissible fade show position-fixed`}
             style={{ top: '20px', right: '20px', zIndex: 9999 }}>
          {alertMessage}
          <button
            type="button"
            className="btn-close"
            onClick={() => setShowAlert(false)}
          ></button>
        </div>
      )}

      {/* Resize Covers Migration Modal */}
      <ResizeCoversMigrationModal
        isOpen={showResizeMigrationModal}
        onClose={() => setShowResizeMigrationModal(false)}
        onMigrate={handleResizeMigration}
      />

      {/* Fill Covers Modal */}
      <FillBackCoversModal
        isOpen={showFillCoversModal}
        onClose={() => setShowFillCoversModal(false)}
        onFill={handleFillCovers as any}
      />
    </div>
  );
});

MusicDexPage.displayName = 'MusicDexPage';

export default MusicDexPage;
