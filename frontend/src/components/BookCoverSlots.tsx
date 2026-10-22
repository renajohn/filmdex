import React, { useRef, useState } from 'react';
import { BsCrop, BsImage } from 'react-icons/bs';
import CoverCropDialog from './CoverCropDialog';
import { base64ToFile, downscaleImage } from '../utils/downscaleImage';
import { isCameraPhoto } from '../utils/isCameraPhoto';
import { straightenIfSure } from '../utils/straightenPhoto';
import toast from './shared/Toast';
import { IconButton } from './shared/Button';
import Spinner from './shared/Spinner';

type Photo = { base64: string; mimeType: string };
type Side = 'front' | 'back';
export type BookCoverPhotos = { front?: Photo; back?: Photo };

interface BookCoverSlotsProps {
  photos: BookCoverPhotos;
  onChange: (photos: BookCoverPhotos) => void;
}

const LABELS: Record<Side, { name: string; add: string }> = {
  front: { name: 'Cover', add: 'Add its cover' },
  back: { name: 'Back', add: 'Add its back' },
};

/**
 * A new book's cover and back, side by side, before it is saved: the photos it
 * was read from, or images chosen here (a click, or dropped on the slot). A
 * photograph is squared, by itself when the detector is sure, else in the
 * straightening dialog; a picture from the web is kept as it is. Either is
 * straightened on asking (its crop button); a click on one replaces it.
 */
const BookCoverSlots: React.FC<BookCoverSlotsProps> = ({ photos, onChange }) => {
  const inputs = { front: useRef<HTMLInputElement>(null), back: useRef<HTMLInputElement>(null) };
  const [cropping, setCropping] = useState<{ side: Side; file: File; whole?: boolean } | null>(null);
  // The sides chosen as pictures from the web: straightened on asking from their whole frame.
  const pictures = useRef<Partial<Record<Side, boolean>>>({});
  const [over, setOver] = useState<Side | null>(null);
  // The images as chosen, for straightening on asking from the whole of them.
  const originals = useRef<Partial<Record<Side, File>>>({});
  // The sides being read or squared: a spinner in their slot meanwhile.
  const [busy, setBusy] = useState<Partial<Record<Side, boolean>>>({});

  const keep = async (side: Side, file: File) => {
    try { onChange({ ...photos, [side]: await downscaleImage(file) }); } catch (e) { toast((e as Error).message, { tone: 'danger' }); }
  };

  const take = async (side: Side, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { toast('Please choose an image', { tone: 'warning' }); return; }
    originals.current[side] = file;
    setBusy(prev => ({ ...prev, [side]: true }));
    try {
      // A picture from the web is a cover already: as it is, straightened only on asking.
      const photo = await isCameraPhoto(file).catch(() => false);
      pictures.current[side] = !photo;
      if (!photo) { await keep(side, file); return; }
      const squared = await straightenIfSure(file, 'book').catch(() => null);
      if (squared) await keep(side, squared);
      else setCropping({ side, file });
    } finally {
      setBusy(prev => ({ ...prev, [side]: false }));
    }
  };

  return (
    <div className="book-form-photos">
      {(['front', 'back'] as const).map(side => (
        <figure key={side}>
          <input ref={inputs[side]} type="file" accept="image/*,.heic,.heif" hidden
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void take(side, file); }} />
          <button type="button" className={`book-form-photos__slot${over === side ? ' book-form-photos__slot--over' : ''}`}
            title={photos[side] ? `Replace its ${side === 'front' ? 'cover' : 'back'}` : LABELS[side].add}
            onClick={() => inputs[side].current?.click()}
            onDragOver={event => { event.preventDefault(); setOver(side); }}
            onDragLeave={() => setOver(null)}
            onDrop={event => { event.preventDefault(); setOver(null); void take(side, event.dataTransfer.files?.[0]); }}>
            {busy[side]
              ? <span className="book-form-photos__empty"><Spinner size="md" /></span>
              : photos[side]
              ? <img src={`data:${photos[side]!.mimeType};base64,${photos[side]!.base64}`} alt={side === 'front' ? 'Its cover' : 'Its back'} />
              : <span className="book-form-photos__empty"><BsImage size={22} />{LABELS[side].add}<small>click or drop</small></span>}
          </button>
          <figcaption>
            {LABELS[side].name}
            {photos[side] && (
              <IconButton size="sm" label={`Straighten its ${side === 'front' ? 'cover' : 'back'}`}
                onClick={() => setCropping({ side, whole: pictures.current[side], file: originals.current[side] || base64ToFile(photos[side]!.base64, photos[side]!.mimeType, `${side}.jpg`) })}>
                <BsCrop />
              </IconButton>
            )}
          </figcaption>
        </figure>
      ))}
      <CoverCropDialog
        show={Boolean(cropping)}
        file={cropping?.file || null}
        slot={cropping?.side || 'front'}
        subject="book"
        whole={cropping?.whole}
        onCancel={() => setCropping(null)}
        onConfirm={photo => {
          const side = cropping?.side;
          setCropping(null);
          if (!side) return;
          setBusy(prev => ({ ...prev, [side]: true }));
          void keep(side, photo).finally(() => setBusy(prev => ({ ...prev, [side]: false })));
        }}
      />
    </div>
  );
};

export default BookCoverSlots;
