import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import MusicSearch from '../components/MusicSearch';
import musicService from '../services/musicService';

const MusicDexPage = forwardRef(({ searchCriteria }, ref) => {
  const [cds, setCds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success');
  const [showAlert, setShowAlert] = useState(false);
  const musicSearchRef = useRef(null);

  useEffect(() => {
    loadCds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    openAddDialog: () => {
      if (musicSearchRef.current) {
        musicSearchRef.current.openAddDialog();
      }
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
      await musicService.addAlbum(cdData);
      await loadCds();
      showAlertMessage('Album added successfully!', 'success');
    } catch (error) {
      console.error('Error adding album:', error);
      showAlertMessage('Failed to add album: ' + error.message, 'danger');
    }
  };

  const handleAddCdFromMusicBrainz = async (releaseId, additionalData) => {
    try {
      await musicService.addAlbumFromMusicBrainz(releaseId, additionalData);
      await loadCds();
      showAlertMessage('Album added successfully from MusicBrainz!', 'success');
    } catch (error) {
      console.error('Error adding album from MusicBrainz:', error);
      showAlertMessage('Failed to add album: ' + error.message, 'danger');
    }
  };

  const handleAddCdByBarcode = async (barcode, additionalData) => {
    try {
      await musicService.addAlbumByBarcode(barcode, additionalData);
      await loadCds();
      showAlertMessage('Album added successfully by barcode!', 'success');
    } catch (error) {
      console.error('Error adding album by barcode:', error);
      showAlertMessage('Failed to add album: ' + error.message, 'danger');
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
    </div>
  );
});

MusicDexPage.displayName = 'MusicDexPage';

export default MusicDexPage;

