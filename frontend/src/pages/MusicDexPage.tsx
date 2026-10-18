
import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MusicSearch from '../components/MusicSearch';
import musicService from '../services/musicService';
import AttachCdDialog, { type AttachableAlbum } from '../components/AttachCdDialog';
import { IconButton } from '../components/shared/Button';
import { BsX } from 'react-icons/bs';
import { toast, toneOf } from '../components/shared/Toast';

const MusicSearchComponent: any = MusicSearch;

interface MusicDexPageProps {
  searchCriteria?: any;
}

export interface MusicDexPageRef {
  openAddDialog: () => void;
}

const MusicDexPage = forwardRef<MusicDexPageRef, MusicDexPageProps>(({ searchCriteria }, ref) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [cds, setCds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const musicSearchRef = useRef<any>(null);
  // A CD about to be added that DexVault has as files or wished: which album to make the CD of.
  const [attachPrompt, setAttachPrompt] = useState<{ albums: AttachableAlbum[]; choose: (albumId: number | null) => void } | null>(null);

  /**
   * The album to make the CD of instead of adding a new one, when DexVault
   * already has it as files or wished and the user says so; null to add it.
   */
  const albumToAttachTo = async (query: Parameters<typeof musicService.findAttachableAlbums>[0]): Promise<number | null> => {
    let albums: AttachableAlbum[] = [];
    try {
      albums = await musicService.findAttachableAlbums(query);
    } catch {
      return null;
    }
    if (albums.length === 0) return null;
    return new Promise(resolve => setAttachPrompt({ albums, choose: albumId => { setAttachPrompt(null); resolve(albumId); } }));
  };

  /** The CD bought, as the album DexVault had: the form's condition, date, price and notes with it. */
  const attachCd = async (albumId: number, edition: { releaseId?: string; barcode?: string }, cdData: any) => {
    // Only how it was bought: the form's other fields (its barcode among them) are the album's, not the purchase's.
    const ownership = cdData?.ownership || {};
    const album = await musicService.markAlbumBought(albumId, {
      ...edition,
      condition: ownership.condition ?? cdData?.condition ?? null,
      purchasedAt: ownership.purchasedAt ?? cdData?.purchasedAt ?? null,
      priceChf: ownership.priceChf ?? cdData?.priceChf ?? null,
      notes: ownership.notes ?? cdData?.notes ?? null,
    });
    await loadCds();
    showAlertMessage('CD attached to the album you had: its words, notes and plays stay.', 'success');
    return album;
  };

  useEffect(() => {
    loadCds();

    // Check for URL search parameters
    const urlParams = new URLSearchParams(location.search);
    const searchParam = urlParams.get('search');
    if (searchParam && musicSearchRef.current) {
      // Set the search query in the MusicSearch component
      musicSearchRef.current.setSearchQuery(searchParam);
    }
    // ?album=12 opens that album's card, as the player's bar asks from any page.
    const albumParam = urlParams.get('album');
    if (albumParam) {
      urlParams.delete('album');
      navigate({ search: urlParams.toString() }, { replace: true });
      musicService.getAlbumById(albumParam)
        .then(details => musicSearchRef.current?.openAlbumDetails(details))
        .catch(() => undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

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
    toast(message, { tone: toneOf(type) });
  };

  const handleAddCd = async (cdData: any) => {
    try {
      const attachTo = await albumToAttachTo({ title: cdData?.title, artist: cdData?.artist });
      if (attachTo !== null) return await attachCd(attachTo, {}, cdData);
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
      const attachTo = await albumToAttachTo({ releaseId, title: additionalData?.title, artist: additionalData?.artist });
      if (attachTo !== null) return await attachCd(attachTo, { releaseId }, additionalData);
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
      const attachTo = await albumToAttachTo({ barcode });
      if (attachTo !== null) return await attachCd(attachTo, { barcode }, additionalData);
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


      {attachPrompt && <AttachCdDialog albums={attachPrompt.albums} onChoose={attachPrompt.choose} />}
    </div>
  );
});

MusicDexPage.displayName = 'MusicDexPage';

export default MusicDexPage;
