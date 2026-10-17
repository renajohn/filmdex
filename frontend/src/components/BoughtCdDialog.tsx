import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import { BsDisc } from 'react-icons/bs';
import musicService from '../services/musicService';
import Select from './shared/Select';
import Button from './shared/Button';
import Dialog from './shared/Dialog';
import { TextArea, TextField } from './shared/TextField';
import Spinner from './shared/Spinner';

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
    <Dialog show onClose={onClose} zIndex={10200} backdropClassName="bought-cd-backdrop" title="I bought the CD" icon={<BsDisc />}>
      <Form onSubmit={save}>
        <Dialog.Body>
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
              <TextField className="mt-1 mb-2" inputMode="numeric" placeholder="e.g. 724384546526" value={barcode} onChange={e => setBarcode(e.target.value)} required />
            )}
            <Form.Check type="radio" id="edition-musicbrainz" name="edition" checked={edition === 'musicbrainz'} onChange={() => setEdition('musicbrainz')}
              label="A MusicBrainz release, its link or id" />
            {edition === 'musicbrainz' && (
              <TextField className="mt-1" placeholder="https://musicbrainz.org/release/…" value={releaseId} onChange={e => setReleaseId(e.target.value)} required />
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
              <TextField type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-3" style={{ width: '7rem' }} controlId="bought-price">
              <Form.Label>Price CHF</Form.Label>
              <TextField inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
            </Form.Group>
          </div>
          <Form.Group controlId="bought-notes">
            <Form.Label>Notes</Form.Label>
            <TextArea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Where, from whom…" />
          </Form.Group>
          {error && <div className="text-danger small mt-3">{error}</div>}
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="quiet" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving && <Spinner size="sm" className="me-2" />}
            Into my collection
          </Button>
        </Dialog.Footer>
      </Form>
    </Dialog>
  );
};

export default BoughtCdDialog;
