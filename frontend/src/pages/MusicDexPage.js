import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import MusicSearch from '../components/MusicSearch';
import ResizeCoversMigrationModal from '../components/ResizeCoversMigrationModal';
import musicService from '../services/musicService';

const MusicDexPage = forwardRef(({ searchCriteria }, ref) => {
  const location = useLocation();
  const [cds, setCds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success');
  const [showAlert, setShowAlert] = useState(false);
  const [showResizeMigrationModal, setShowResizeMigrationModal] = useState(false);
  const musicSearchRef = useRef(null);

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
      const data = await musicService.getAllAlbums();
      setCds(data);
    } catch (error) {
      console.error('Error loading albums:', error);
      showAlertMessage('Failed to load albums: ' + error.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const showAlertMessage = (message, type = 'success') => {
    setAlertMessage(message);
    setAlertType(type);
    setShowAlert(true);
    setTimeout(() => {
      setShowAlert(false);
    }, 5000);
  };

  const handleAddCd = async (cdData) => {
    try {
      const createdAlbum = await musicService.addAlbum(cdData);
      await loadCds();
      showAlertMessage('Album added successfully!', 'success');
      return createdAlbum; // Return the created album data
    } catch (error) {
      console.error('Error adding album:', error);
      showAlertMessage('Failed to add album: ' + error.message, 'danger');
      throw error;
    }
  };

  const handleAddCdFromMusicBrainz = async (releaseId, additionalData) => {
    try {
      const createdAlbum = await musicService.addAlbumFromMusicBrainz(releaseId, additionalData);
      await loadCds();
      showAlertMessage('Album added successfully from MusicBrainz!', 'success');
      return createdAlbum; // Return the created album data
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      showAlertMessage('Failed to add album: ' + error.message, 'danger');
      throw error;
    }
  };

  const handleAddCdByBarcode = async (barcode, additionalData) => {
    try {
      const createdAlbum = await musicService.addAlbumByBarcode(barcode, additionalData);
      await loadCds();
      showAlertMessage('Album added successfully by barcode!', 'success');
      return createdAlbum; // Return the created album data
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      showAlertMessage('Failed to add album: ' + error.message, 'danger');
      throw error;
    }
  };

  const handleUpdateCd = async (id, cdData) => {
    try {
      await musicService.updateAlbum(id, cdData);
      await loadCds();
      showAlertMessage('Album updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating album:', error);
      showAlertMessage('Failed to update album: ' + error.message, 'danger');
    }
  };

  const handleDeleteCd = async (id) => {
    try {
      await musicService.deleteAlbum(id);
      await loadCds();
      showAlertMessage('Album deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting album:', error);
      showAlertMessage('Failed to delete album: ' + error.message, 'danger');
    }
  };

  const handleResizeMigration = async () => {
    return await musicService.resizeAllAlbumCovers();
  };

  return (
    <div className="musicdex-page">
      <MusicSearch
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
    </div>
  );
});

MusicDexPage.displayName = 'MusicDexPage';

export default MusicDexPage;

