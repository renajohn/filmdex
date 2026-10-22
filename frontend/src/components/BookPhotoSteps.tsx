import React, { useEffect, useRef, useState } from 'react';
import { BsCamera, BsCheckLg, BsCrop, BsUpload } from 'react-icons/bs';
import CoverCropDialog from './CoverCropDialog';
import Dialog from './shared/Dialog';
import Button, { IconButton } from './shared/Button';
import Spinner from './shared/Spinner';
import Notice from './shared/Notice';
import bookService from '../services/bookService';
import type { BookPhotosDraft } from '../services/bookService';
import { base64ToFile, downscaleImage } from '../utils/downscaleImage';
import { isCameraPhoto } from '../utils/isCameraPhoto';
import { straightenIfSure } from '../utils/straightenPhoto';
import './BookPhotoSteps.css';

type Photo = { base64: string; mimeType: string };
type Side = 'front' | 'back';
export type BookPhotos = { front?: Photo; back?: Photo };

interface BookPhotoStepsProps {
  /** Photos taken already: the back that found nothing, squared. */
  photos?: BookPhotos;
  /** Files just taken with the camera, to square here: the cover photographed from the finder's not found. */
  files?: Partial<Record<Side, File>>;
  /** Why it is made by hand: a photo found nothing (its back first), or words searched did (its cover first). */
  reason: 'photo' | 'search';
  /** The ISBN its back gave, unknown to the catalogues. */
  isbn?: string | null;
  /** A laptop: drop zones side by side rather than a camera step by step. */
  wide: boolean;
  onDraft: (draft: BookPhotosDraft, photos: BookPhotos) => void;
  onManual: (photos: BookPhotos) => void;
}

const SIDE = {
  front: { name: 'Its cover', what: 'its title, its author, its picture', take: 'Photograph its cover', drop: 'Its cover', crop: 'its cover' },
  back: { name: 'Its back', what: 'its blurb, its ISBN', take: 'Photograph its back', drop: 'Its back', crop: 'its back' },
} as const;

/**
 * A book none of the catalogues knows, made from its photos, as steps: its
 * back done when it was photographed first, its cover asked next (or the
 * cover first, its back optional, after words that found nothing), then read
 * without a button and its form checked. Each photo is squared as it comes
 * (a photograph by itself when sure, else in the straightening dialog; a
 * picture from the web as it is), and straightened again on asking.
 * On a laptop, two drop zones side by side and Read them.
 */
const BookPhotoSteps: React.FC<BookPhotoStepsProps> = ({ photos: given, files, reason, isbn, wide, onDraft, onManual }) => {
  const [photos, setPhotos] = useState<BookPhotos>(given || {});
  const [busy, setBusy] = useState<Partial<Record<Side, boolean>>>({});
  const [cropping, setCropping] = useState<{ side: Side; file: File; whole?: boolean } | null>(null);
  const [backSkipped, setBackSkipped] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  // A reading that failed is not tried again by itself: a button does.
  const [failed, setFailed] = useState(false);
  const [over, setOver] = useState<Side | null>(null);
  const originals = useRef<Partial<Record<Side, File>>>({});
  const pictures = useRef<Partial<Record<Side, boolean>>>({});
  const inputs = { front: useRef<HTMLInputElement>(null), back: useRef<HTMLInputElement>(null) };
  const readOnce = useRef(false);

  // Its order: what was photographed first is done first.
  const order: Side[] = reason === 'photo' ? ['back', 'front'] : ['front', 'back'];
  const done = (side: Side) => Boolean(photos[side]) || (side === 'back' && backSkipped && !photos.back);
  const current = order.find(side => !done(side) || busy[side]) ?? null;

  const keep = async (side: Side, file: File) => {
    try {
      const kept = await downscaleImage(file);
      setPhotos(prev => ({ ...prev, [side]: kept }));
    } catch (e) { setError((e as Error).message); }
  };

  /** A photo or a picture taken in: a photograph squared, by itself when sure, else in the dialog; a picture as it is. */
  const take = async (side: Side, file: File | undefined, fromCamera = false) => {
    if (!file) return;
    originals.current[side] = file;
    setError('');
    setBusy(prev => ({ ...prev, [side]: true }));
    try {
      // From the camera it is a photograph, whatever its EXIF: Safari strips it from a photo sent by a camera field.
      const photo = fromCamera || await isCameraPhoto(file).catch(() => false);
      pictures.current[side] = !photo;
      if (!photo) { await keep(side, file); return; }
      const squared = await straightenIfSure(file, 'book').catch(() => null);
      if (squared) await keep(side, squared);
      else setCropping({ side, file });
    } finally {
      setBusy(prev => ({ ...prev, [side]: false }));
    }
  };

  // Files handed over (the cover just photographed from the finder): squared here.
  useEffect(() => {
    (Object.keys(files || {}) as Side[]).forEach(side => { void take(side, files![side], true); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (taken: BookPhotos) => {
    if (readOnce.current || (!taken.front && !taken.back)) return;
    readOnce.current = true;
    setReading(true);
    setError('');
    try {
      const { draft } = await bookService.readPhotos(taken, { complete: true });
      onDraft(draft, taken);
    } catch (e) {
      readOnce.current = false;
      setFailed(true);
      setError((e as Error).message || 'Could not read the photos');
    } finally {
      setReading(false);
    }
  };

  // On a phone, read as soon as its cover is in and its back is in or skipped: no button to press.
  useEffect(() => {
    if (wide || failed || cropping || busy.front || busy.back) return;
    if (photos.front && (photos.back || backSkipped)) void read(photos);
  }, [photos, backSkipped, busy, cropping, wide, failed]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Without its cover: what its back says read all the same, else the form empty. */
  const withoutCover = () => (photos.back ? read(photos) : onManual(photos));

  const cropOnAsking = (side: Side) => {
    const photo = photos[side];
    if (!photo) return;
    setCropping({ side, whole: pictures.current[side], file: originals.current[side] || base64ToFile(photo.base64, photo.mimeType, `${side}.jpg`) });
  };

  const fileInputs = (
    <>
      {(['front', 'back'] as const).map(side => (
        <input key={side} ref={inputs[side]} type="file" accept="image/*,.heic,.heif" hidden data-testid={`steps-${side}-input`}
          {...(wide ? {} : { capture: 'environment' as const })}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void take(side, file, !wide); }} />
      ))}
    </>
  );

  const thumb = (side: Side) => (busy[side]
    ? <span className="photo-steps__thumb photo-steps__thumb--busy"><Spinner size="sm" /></span>
    : photos[side]
      ? <img className="photo-steps__thumb" src={`data:${photos[side]!.mimeType};base64,${photos[side]!.base64}`} alt={SIDE[side].name} />
      : null);

  const hero = (
    <div className="photo-steps__hero">
      <div className="photo-steps__title">{reason === 'photo' ? 'Not in the catalogues yet' : 'Not in the catalogues'}</div>
      <div className="photo-steps__lead">
        {reason === 'photo'
          ? `${isbn ? `ISBN ${isbn} is` : 'It is'} unknown to Google, Open Library and the BnF. ${wide ? 'Add its cover too' : 'One more photo'}, and its page is made.`
          : wide ? 'Make its page from images of it: drop its cover and its back, or choose them.' : 'Google, Open Library and the BnF do not know it. Make its page from its photos.'}
      </div>
    </div>
  );

  const cropDialog = (
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
  );

  if (wide) {
    return (
      <>
        <Dialog.Body className="photo-steps">
          {fileInputs}
          {hero}
          <div className="photo-steps__zones">
            {order.map(side => (
              <div key={side} className="photo-steps__zone-box">
                <button type="button"
                  className={`photo-steps__zone${photos[side] ? ' photo-steps__zone--done' : side === current ? ' photo-steps__zone--now' : ''}${over === side ? ' photo-steps__zone--over' : ''}`}
                  onClick={() => inputs[side].current?.click()}
                  onDragOver={event => { event.preventDefault(); setOver(side); }}
                  onDragLeave={() => setOver(null)}
                  onDrop={event => { event.preventDefault(); setOver(null); void take(side, event.dataTransfer.files?.[0]); }}>
                  {thumb(side) || <BsUpload size={22} />}
                  <span className="photo-steps__name">{photos[side] ? <><BsCheckLg /> {SIDE[side].name}</> : SIDE[side].drop}</span>
                  <small>{photos[side] ? 'click to replace' : side === 'back' && reason === 'search' ? 'optional · drop or choose' : 'drop or choose'}</small>
                </button>
                {photos[side] && (
                  <IconButton size="sm" label={`Straighten ${SIDE[side].crop}`} onClick={() => cropOnAsking(side)}><BsCrop /></IconButton>
                )}
              </div>
            ))}
          </div>
          {reading && <div className="photo-steps__reading"><Spinner size="sm" /> Reading the photos, then the BnF…</div>}
          {error && <Notice tone="warning">{error}</Notice>}
          {cropDialog}
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="quiet" onClick={() => onManual(photos)} disabled={reading}>Type it by hand</Button>
          <Button variant="primary" loading={reading} disabled={(!photos.front && !photos.back) || busy.front || busy.back} onClick={() => read(photos)}>Read them</Button>
        </Dialog.Footer>
      </>
    );
  }

  const steps: Array<Side | 'check'> = [...order, 'check'];
  return (
    <Dialog.Body className="photo-steps">
      {fileInputs}
      {hero}
      <ol className="photo-steps__list">
        {steps.map((step, index) => {
          const isCheck = step === 'check';
          const state = isCheck ? (reading ? 'now' : 'todo') : done(step) && !busy[step] ? 'done' : step === current ? 'now' : 'todo';
          return (
            <li key={step} className={`photo-steps__step photo-steps__step--${state}`}>
              <span className="photo-steps__n">{state === 'done' ? <BsCheckLg /> : index + 1}</span>
              {!isCheck && thumb(step)}
              <span className="photo-steps__text">
                <span className="photo-steps__name">{isCheck ? (reading ? 'Reading its photos…' : 'Check its page') : SIDE[step].name}</span>
                <small>
                  {isCheck ? (reading ? 'then the BnF' : 'read for you, the BnF completes it')
                    : step === 'back' && backSkipped && !photos.back ? 'skipped'
                    : photos[step] ? (step === 'back' && reason === 'photo' ? 'its ISBN and blurb read' : 'taken') : `${SIDE[step].what}${step === 'back' && reason === 'search' ? ' · optional' : ''}`}
                </small>
              </span>
              {!isCheck && photos[step] && !busy[step] && (
                <IconButton size="sm" label={`Straighten ${SIDE[step].crop}`} onClick={() => cropOnAsking(step)}><BsCrop /></IconButton>
              )}
              {isCheck && reading && <Spinner size="sm" />}
            </li>
          );
        })}
      </ol>
      {error && <Notice tone="warning" action={failed ? <Button size="sm" onClick={() => { setFailed(false); void read(photos); }}>Read them again</Button> : undefined}>{error}</Notice>}
      {!reading && current && (
        <>
          <Button variant="primary" block icon={<BsCamera />} loading={busy[current]} onClick={() => inputs[current].current?.click()}>{SIDE[current].take}</Button>
          {current === 'back' && reason === 'search'
            ? <Button variant="quiet" onClick={() => setBackSkipped(true)}>Skip: its cover is enough</Button>
            : current === 'front' && reason === 'search'
              ? <Button variant="quiet" onClick={() => onManual(photos)}>or type it all by hand</Button>
              : <Button variant="quiet" onClick={() => void withoutCover()}>No cover: fill in the rest from its back</Button>}
        </>
      )}
      {cropDialog}
    </Dialog.Body>
  );
};

export default BookPhotoSteps;
