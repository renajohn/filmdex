import React, { useEffect, useRef, useState } from 'react';
import { Button, Alert, Spinner } from 'react-bootstrap';
import { BsCamera, BsCheckCircleFill, BsArrowRepeat } from 'react-icons/bs';
import musicService from '../services/musicService';
import CoverCropDialog from './CoverCropDialog';
import { downscaleImage, base64ToFile } from '../utils/downscaleImage';
import { detectSleeveQuad, CONFIDENT } from '../utils/detectSleeveQuad';
import { warpQuad } from '../utils/warpQuad';
import './SleeveCapture.css';

type Side = 'front' | 'back';

interface Photo {
  base64: string;
  mimeType: string;
}

export interface SleeveDraftResult {
  draft: Record<string, unknown>;
  sources: { front: string; back: string };
  truncated: boolean;
  /** Becomes the album cover once it has an id. */
  coverPhoto?: Photo;
  /** Becomes the back cover -- the side carrying the list you will proofread. */
  backPhoto?: Photo;
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
 * Both sides are treated alike: each is kept as its cover and each can be
 * straightened here, because a case held in the hand is rarely square to the
 * camera. The front comes first, since it is the one that becomes the artwork
 * and the one whose absence used to mean no cover at all.
 */
const SleeveCapture: React.FC<SleeveCaptureProps> = ({ initialFront, onDraft, onSkip }) => {
  const [photos, setPhotos] = useState<Record<Side, Photo | null>>({
    front: initialFront || null,
    back: null
  });
  // Which sides the user straightened, for the caption only: the photo itself
  // already carries the result.
  const [straightened, setStraightened] = useState<Record<Side, boolean>>({ front: false, back: false });
  const [cropping, setCropping] = useState<Side | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  // Always mounted: the camera opens by clicking these from inside the user's
  // tap, and iOS refuses that if the input appears after a state change.
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);
  const inputs: Record<Side, React.RefObject<HTMLInputElement | null>> = {
    front: frontInput,
    back: backInput
  };
  // The originals, full resolution, for the straightening step to work on.
  const files = useRef<Record<Side, File | null>>({ front: null, back: null });
  // A ref write does not redraw, and the crop button depends on there being a
  // file. Without this the button never appeared for a photo whose detection
  // declined, because nothing else changed to trigger a render.
  const [hasFile, setHasFile] = useState<Record<Side, boolean>>({ front: false, back: false });

  const keepFile = (side: Side, file: File) => {
    files.current[side] = file;
    setHasFile(current => (current[side] ? current : { ...current, [side]: true }));
  };

  const setPhoto = (side: Side, photo: Photo) =>
    setPhotos(current => ({ ...current, [side]: photo }));

  /**
   * A front handed over by a scan that found nothing gets the same treatment
   * as one taken here.
   *
   * It arrives as base64 rather than a file, straight into state, so it used
   * to reach neither the detector nor the crop button -- the one photograph
   * already on screen was the one photograph nothing could be done with.
   */
  useEffect(() => {
    if (!initialFront?.base64 || files.current.front) return;

    const file = base64ToFile(initialFront.base64, initialFront.mimeType, 'scanned-front.jpg');
    keepFile('front', file);

    let cancelled = false;
    void (async () => {
      try {
        const straightenedFile = await autoStraighten(file);
        if (cancelled || !straightenedFile) return;
        keepFile('front', straightenedFile);
        setStraightened(current => ({ ...current, front: true }));
        setPhoto('front', await downscaleImage(straightenedFile));
      } catch (_) {
        // The photo is already on screen; failing to improve it is not worth
        // interrupting anyone over.
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFront?.base64]);

  /**
   * Take a photograph, and straighten it if the sleeve can be found in it.
   *
   * Done here rather than waiting for the crop dialog to be opened: a detector
   * nothing triggers is a detector that never runs, and the whole point is that
   * the common case should need no taps at all. Anything less than convincing
   * is left alone for the user to frame by hand.
   */
  const capture = async (side: Side, file: File) => {
    setError('');
    keepFile(side, file);

    try {
      setPhoto(side, await downscaleImage(file));
    } catch (err) {
      setError(`Could not read that photo: ${(err as Error).message}`);
      return;
    }

    try {
      const straightenedFile = await autoStraighten(file);
      if (straightenedFile) {
        keepFile(side, straightenedFile);
        setStraightened(current => ({ ...current, [side]: true }));
        setPhoto(side, await downscaleImage(straightenedFile));
      }
    } catch (_) {
      // The untouched photo is already shown; failing to improve it is not
      // worth interrupting anyone over.
    }
  };

  /** The sleeve cut out of a photograph, or null if it could not be found. */
  const autoStraighten = async (file: File): Promise<File | null> => {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decode failed'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0);

      const found = detectSleeveQuad(context.getImageData(0, 0, canvas.width, canvas.height));
      if (!found || found.confidence < CONFIDENT) return null;

      const cropped = await warpQuad(image, found.quad);
      return new File([cropped], 'sleeve.jpg', { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const onPick = (side: Side) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so the same photo can be picked again after a retake.
    event.target.value = '';
    if (file) {
      setStraightened(current => ({ ...current, [side]: false }));
      void capture(side, file);
    }
  };

  const read = async () => {
    if (!photos.front && !photos.back) return;
    setReading(true);
    setError('');
    try {
      const result = await musicService.transcribeSleeve({
        front: photos.front ? { base64: photos.front.base64, mimeType: photos.front.mimeType } : undefined,
        back: photos.back ? { base64: photos.back.base64, mimeType: photos.back.mimeType } : undefined
      }) as SleeveDraftResult;

      // A record no database knows has no artwork to download, so these photos
      // are the only covers it will ever have. Both travel, with whatever
      // framing was set for them.
      onDraft({
        ...result,
        coverPhoto: photos.front || undefined,
        backPhoto: photos.back || undefined
      });
    } catch (err) {
      setError((err as Error).message || 'Could not read the sleeve');
    } finally {
      setReading(false);
    }
  };

  const slot = (side: Side, label: string, hint: string) => {
    const photo = photos[side];
    const framed = straightened[side];
    const what = side === 'front' ? 'cover' : 'back cover';

    return (
      <div className="sleeve-capture-slot">
        <Button
          variant={photo ? 'outline-success' : 'outline-secondary'}
          className="sleeve-capture-btn"
          disabled={reading}
          onClick={() => inputs[side].current?.click()}
        >
          {photo ? <BsCheckCircleFill className="me-2" /> : <BsCamera className="me-2" />}
          {label}
          {photo && <BsArrowRepeat className="ms-2" title="Take another" />}
        </Button>

        {photo && (
          <img
            className="sleeve-capture-thumb"
            data-testid={`sleeve-thumb-${side}`}
            src={`data:${photo.mimeType};base64,${photo.base64}`}
            alt={label}
          />
        )}

        <div className="sleeve-capture-hint">
          {photo
            ? framed ? `The ${what}, straightened for you` : `This will be the ${what}`
            : hint}
        </div>

        {photo && hasFile[side] && (
          <Button
            variant="link"
            size="sm"
            data-testid={`crop-${side}`}
            disabled={reading}
            onClick={() => setCropping(side)}
          >
            Crop or rotate
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="sleeve-capture">
      <input
        ref={frontInput}
        type="file"
        accept="image/*,image/heic,image/heif"
        capture="environment"
        style={{ display: 'none' }}
        data-testid="sleeve-front-input"
        onChange={onPick('front')}
      />
      <input
        ref={backInput}
        type="file"
        accept="image/*,image/heic,image/heif"
        capture="environment"
        style={{ display: 'none' }}
        data-testid="sleeve-back-input"
        onChange={onPick('back')}
      />

      <h6 className="sleeve-capture-title">Fill the form from the sleeve</h6>
      <p className="sleeve-capture-lead">
        Both photographs are kept as the covers, and the back is where the track list is
        read from. Nothing is saved until you review it.
      </p>

      <div className="sleeve-capture-slots">
        {slot('front', 'Front cover', 'The artwork')}
        {slot('back', 'Back cover', 'Where the track list is')}
      </div>

      {error && <Alert variant="warning" className="mt-3 mb-0">{error}</Alert>}

      <CoverCropDialog
        show={Boolean(cropping)}
        file={cropping ? files.current[cropping] : null}
        slot={cropping || 'front'}
        onCancel={() => setCropping(null)}
        onConfirm={async (photo) => {
          const side = cropping;
          setCropping(null);
          if (!side) return;

          keepFile(side, photo);
          setStraightened(current => ({ ...current, [side]: true }));
          // The straightened photo replaces the original everywhere: it is the
          // thumbnail shown, what the model reads, and what gets stored.
          try {
            setPhoto(side, await downscaleImage(photo));
          } catch (_) { /* keep what we had */ }
        }}
      />

      <div className="sleeve-capture-actions">
        <Button variant="link" onClick={onSkip} disabled={reading}>
          Enter it by hand instead
        </Button>
        <Button onClick={read} disabled={reading || (!photos.front && !photos.back)}>
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
