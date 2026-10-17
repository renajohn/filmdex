import React, { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { BsDisc } from 'react-icons/bs';
import musicService from '../services/musicService';
import Select from './shared/Select';

type Edition = 'keep' | 'barcode' | 'musicbrainz';

interface BoughtCdDialogProps {
  album: { id: number | string; title: string; musicbrainzReleaseId?: string | null };
  onClose: () => void;
  /** The album as it is now, a CD of the collection. */
  onBought: (album: any) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * "I bought the CD": an album one had as files, or wished, becomes a CD of
 * the collection, the same album with its words, notes and plays. As the wish
 * list's Mark owned asks, and which edition was bought: the one the album
 * already has, or the one its barcode or MusicBrainz says.
 */
const BoughtCdDialog: React.FC<BoughtCdDialogProps> = ({ album, onClose, onBought }) => {
  const [condition, setCondition] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(today());
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [edition, setEdition] = useState<Edition>('keep');
  const [barcode, setBarcode] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onBought(await musicService.markAlbumBought(album.id, {
        condition: condition || null,
        purchasedAt: purchasedAt || null,
        priceChf: price || null,
        notes: notes || null,
        ...(edition === 'barcode' ? { barcode } : edition === 'musicbrainz' ? { releaseId } : {}),
      }));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal show onHide={onClose} centered style={{ zIndex: 10200 }} backdropClassName="bought-cd-backdrop">
      <Form onSubmit={save}>
        <Modal.Header closeButton>
          <Modal.Title><BsDisc className="me-2" />I bought the CD</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small mb-3" style={{ color: '#a3a3a3' }}>
            <strong>{album.title}</strong> becomes a CD of your collection: its words, notes, plays and place in Listen Next stay with it.
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Edition</Form.Label>
            <Form.Check type="radio" id="edition-keep" name="edition" checked={edition === 'keep'} onChange={() => setEdition('keep')}
              label={album.musicbrainzReleaseId ? 'The one of the files, as MusicBrainz knows it' : 'As it is, from the files'} />
            <Form.Check type="radio" id="edition-barcode" name="edition" checked={edition === 'barcode'} onChange={() => setEdition('barcode')}
              label="From the barcode on its back" />
            {edition === 'barcode' && (
              <Form.Control className="mt-1 mb-2" inputMode="numeric" placeholder="e.g. 724384546526" value={barcode} onChange={e => setBarcode(e.target.value)} required />
            )}
            <Form.Check type="radio" id="edition-musicbrainz" name="edition" checked={edition === 'musicbrainz'} onChange={() => setEdition('musicbrainz')}
              label="A MusicBrainz release, its link or id" />
            {edition === 'musicbrainz' && (
              <Form.Control className="mt-1" placeholder="https://musicbrainz.org/release/…" value={releaseId} onChange={e => setReleaseId(e.target.value)} required />
            )}
            {edition !== 'keep' && <Form.Text muted>Its tracks are then taken from MusicBrainz; the words follow.</Form.Text>}
          </Form.Group>
          <div className="d-flex gap-2">
            <Form.Group className="mb-3 flex-fill" controlId="bought-condition">
              <Form.Label>Condition</Form.Label>
              <Select value={condition} onChange={e => setCondition(e.target.value)}>
                <option value="">—</option>
                <option value="M">Mint</option>
                <option value="NM">Near Mint</option>
                <option value="VG+">Very Good Plus</option>
                <option value="VG">Very Good</option>
              </Select>
            </Form.Group>
            <Form.Group className="mb-3 flex-fill" controlId="bought-date">
              <Form.Label>Bought</Form.Label>
              <Form.Control type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-3" style={{ width: '7rem' }} controlId="bought-price">
              <Form.Label>Price CHF</Form.Label>
              <Form.Control inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
            </Form.Group>
          </div>
          <Form.Group controlId="bought-notes">
            <Form.Label>Notes</Form.Label>
            <Form.Control as="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Where, from whom…" />
          </Form.Group>
          {error && <div className="text-danger small mt-3">{error}</div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />}
            Into my collection
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default BoughtCdDialog;
