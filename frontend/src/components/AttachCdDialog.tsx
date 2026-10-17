import React from 'react';
import { Button, Modal } from 'react-bootstrap';
import { BsCloud, BsHeartFill } from 'react-icons/bs';
import musicService from '../services/musicService';

export interface AttachableAlbum {
  id: number;
  title: string;
  artist: string[] | string;
  cover?: string | null;
  titleStatus?: string | null;
}

interface AttachCdDialogProps {
  albums: AttachableAlbum[];
  /** The album to make the CD of, or null to add the CD as an album of its own. */
  onChoose: (albumId: number | null) => void;
}

/**
 * A CD about to be added that DexVault already has as files, or wished: the
 * same album, made the CD, keeps its words, notes, plays and place in Listen
 * Next, where a new album beside it would start from nothing.
 */
const AttachCdDialog: React.FC<AttachCdDialogProps> = ({ albums, onChoose }) => (
  <Modal show onHide={() => onChoose(null)} centered style={{ zIndex: 11500 }} backdropClassName="attach-cd-backdrop">
    <Modal.Header closeButton>
      <Modal.Title>Already in DexVault</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      <p className="mb-3">You have this album already, without the CD. Attach the CD to it: its words, notes, plays and place in Listen Next stay.</p>
      <div className="d-flex flex-column gap-2">
        {albums.map(album => (
          <button key={album.id} type="button" className="btn btn-outline-warning d-flex align-items-center gap-3 text-start" onClick={() => onChoose(album.id)}>
            {album.cover && <img src={musicService.getImageUrl(album.cover) || undefined} alt="" width={48} height={48} style={{ borderRadius: 6, objectFit: 'cover' }} />}
            <span className="flex-fill">
              <strong>{album.title}</strong>
              <br />
              <small className="text-muted">
                {Array.isArray(album.artist) ? album.artist.join(', ') : album.artist}
                {' · '}
                {album.titleStatus === 'wish' ? <><BsHeartFill /> on your wish list</> : <><BsCloud /> digital</>}
              </small>
            </span>
            <span>Attach the CD</span>
          </button>
        ))}
      </div>
    </Modal.Body>
    <Modal.Footer>
      <Button variant="outline-secondary" onClick={() => onChoose(null)}>Add it as a new album</Button>
    </Modal.Footer>
  </Modal>
);

export default AttachCdDialog;
