import React, { useRef, useState } from 'react';
import { Button, Alert, Spinner } from 'react-bootstrap';
import { BsCamera, BsCheckCircleFill, BsArrowRepeat } from 'react-icons/bs';
import musicService from '../services/musicService';
import CoverCropDialog from './CoverCropDialog';
import type { Quad } from '../utils/detectSleeveQuad';
import { downscaleImage } from '../utils/downscaleImage';
import './SleeveCapture.css';

interface Photo {
  base64: string;
  mimeType: string;
}

export interface SleeveDraftResult {
  draft: Record<string, unknown>;
  sources: { front: string; back: string };
  truncated: boolean;
  /** Kept so the caller can upload it once the album has an id. */
  coverPhoto?: { base64: string; mimeType: string };
  /** Straightening for that photo, if the user set it here. */
  coverCorners?: Quad | null;
}

interface SleeveCaptureProps {
  /** A front photo already taken by the scan, so it need not be shot twice. */
  initialFront?: Photo | null;
  onDraft: (result: SleeveDraftResult) => void;
  onSkip: () => void;
}

/**
 * Photograph a sleeve and let the model do the typing.
 *
 * For records no database knows, which is the only reason to be here: the back
 * carries the track list, and reading twelve titles and twelve durations off it
 * is the whole point. The front is optional and only supplies the identity and
 * the cover.
 */
const SleeveCapture: React.FC<SleeveCaptureProps> = ({ initialFront, onDraft, onSkip }) => {
  const [front, setFront] = useState<Photo | null>(initialFront || null);
  const [back, setBack] = useState<Photo | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  // The photo that will become the cover, and the framing set for it.
  const [croppingFront, setCroppingFront] = useState<File | null>(null);
  const [coverCorners, setCoverCorners] = useState<Quad | null>(null);

  // Always mounted: openCamera() clicks these from inside the user's tap, and
  // iOS refuses that if the input only appears after a state change.
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);
  const photoFile = useRef<File | null>(null);

  const capture = async (file: File, set: (p: Photo) => void) => {
    setError('');
    try {
      set(await downscaleImage(file));
    } catch (err) {
      setError(`Could not read that photo: ${(err as Error).message}`);
    }
  };

  const onPick = (
    event: React.ChangeEvent<HTMLInputElement>,
    set: (p: Photo) => void
  ) => {
    const file = event.target.files?.[0];
    // Cleared so the same photo can be picked again after a retake.
    event.target.value = '';
    if (file) {
      if (set === setFront) photoFile.current = file;
      void capture(file, set);
    }
  };

  const read = async () => {
    if (!front && !back) return;
    setReading(true);
    setError('');
    try {
      const result = await musicService.transcribeSleeve({
        front: front ? { base64: front.base64, mimeType: front.mimeType } : undefined,
        back: back ? { base64: back.base64, mimeType: back.mimeType } : undefined
      }) as SleeveDraftResult;

      // The front photograph is the cover, whether it was taken here or handed
      // over by a scan that found nothing. A record no database knows has no
      // artwork to download, so this is the only cover it will ever have --
      // and the upload endpoint resizes to 1000px anyway, so the image the
      // model read is already the right size.
      onDraft({ ...result, coverPhoto: front || undefined, coverCorners });
    } catch (err) {
      setError((err as Error).message || 'Could not read the sleeve');
    } finally {
      setReading(false);
    }
  };

  const slot = (
    label: string,
    hint: string,
    photo: Photo | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
    isFront = false
  ) => (
    <div className="sleeve-capture-slot">
      <Button
        variant={photo ? 'outline-success' : 'outline-secondary'}
        className="sleeve-capture-btn"
        disabled={reading}
        onClick={() => inputRef.current?.click()}
      >
        {photo ? <BsCheckCircleFill className="me-2" /> : <BsCamera className="me-2" />}
        {label}
        {photo && <BsArrowRepeat className="ms-2" title="Take another" />}
      </Button>

      {photo && (
        <img
          className="sleeve-capture-thumb"
          data-testid={`sleeve-thumb-${isFront ? 'front' : 'back'}`}
          src={`data:${photo.mimeType};base64,${photo.base64}`}
          alt={label}
        />
      )}

      <div className="sleeve-capture-hint">
        {photo
          ? isFront
            ? coverCorners ? 'This will be the cover, straightened' : 'This will be the cover'
            : 'Photographed'
          : hint}
      </div>

      {photo && isFront && photoFile.current && (
        <Button
          variant="link"
          size="sm"
          data-testid="crop-cover"
          disabled={reading}
          onClick={() => setCroppingFront(photoFile.current)}
        >
          Crop or rotate
        </Button>
      )}
    </div>
  );

  return (
    <div className="sleeve-capture">
      <input
        ref={frontInput}
        type="file"
        accept="image/*,image/heic,image/heif"
        capture="environment"
        style={{ display: 'none' }}
        data-testid="sleeve-front-input"
        onChange={(e) => onPick(e, setFront)}
      />
      <input
        ref={backInput}
        type="file"
        accept="image/*,image/heic,image/heif"
        capture="environment"
        style={{ display: 'none' }}
        data-testid="sleeve-back-input"
        onChange={(e) => onPick(e, setBack)}
      />

      <h6 className="sleeve-capture-title">Fill the form from the sleeve</h6>
      <p className="sleeve-capture-lead">
        Photograph the back and the track list is read for you. Nothing is saved until you
        review it.
      </p>

      <div className="sleeve-capture-slots">
        {slot('Back cover', 'Where the track list is', back, backInput)}
        {slot('Front cover', 'Optional — for the artwork', front, frontInput, true)}
      </div>

      {error && <Alert variant="warning" className="mt-3 mb-0">{error}</Alert>}

      <CoverCropDialog
        show={Boolean(croppingFront)}
        file={croppingFront}
        onCancel={() => setCroppingFront(null)}
        onConfirm={async (corners, photo) => {
          setCroppingFront(null);
          photoFile.current = photo;
          setCoverCorners(corners);
          // The model reads the straightened photo too: a sleeve the right way
          // up is easier to transcribe than one on its side.
          try {
            setFront(await downscaleImage(photo));
          } catch (_) { /* keep what we had */ }
        }}
      />

      <div className="sleeve-capture-actions">
        <Button variant="link" onClick={onSkip} disabled={reading}>
          Enter it by hand instead
        </Button>
        <Button onClick={read} disabled={reading || (!front && !back)}>
          {reading ? (
            <>
              <Spinner as="span" animation="border" size="sm" className="me-2" />
              Reading the sleeve…
            </>
          ) : (
            'Read the sleeve'
          )}
        </Button>
      </div>
    </div>
  );
};

export default SleeveCapture;
