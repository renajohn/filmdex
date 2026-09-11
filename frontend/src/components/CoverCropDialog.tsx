import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import { BsArrowCounterclockwise, BsArrowClockwise } from 'react-icons/bs';
import { detectSleeveQuad, defaultQuad, DEFAULT_QUAD, type Quad, type Point } from '../utils/detectSleeveQuad';
import { warpQuad } from '../utils/warpQuad';
import './CoverCropDialog.css';

const CORNERS: Array<keyof Quad> = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

/** Above this the corners are trustworthy enough to say so on screen. */
const CONFIDENT = 0.6;

/** The magnified view shown while a corner is held under a finger. */
const LOUPE_SIZE = 128;
const LOUPE_ZOOM = 3;

interface CoverCropDialogProps {
  show: boolean;
  file: File | null;
  /** Which side is being straightened; only changes what the title says. */
  slot?: 'front' | 'back';
  onCancel: () => void;
  /**
   * The finished photograph: straightened if a frame was set, or as it stands
   * if it was used whole. Pixels rather than corners, so what was shown is
   * exactly what gets stored and the caller has something to display at once.
   */
  onConfirm: (photo: File) => void;
}

/**
 * Straighten a photographed sleeve before it becomes the cover.
 *
 * The corners are found automatically when the sleeve stands out from what it
 * is lying on, and guessed at when it does not -- so they are always shown for
 * confirmation rather than applied silently. Dragging is the fallback that
 * never fails, and the reason an imperfect detector is safe to ship.
 */
const CoverCropDialog: React.FC<CoverCropDialogProps> = ({ show, file, slot = 'front', onCancel, onConfirm }) => {
  // The photo as it currently stands: the one picked, or the one a rotation
  // produced from it. Everything downstream -- detection, corners, upload --
  // refers to this and not to the original.
  const [working, setWorking] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [detecting, setDetecting] = useState(false);
  const [autoFound, setAutoFound] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState<keyof Quad | null>(null);
  const [rotating, setRotating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  // Hugs the image exactly, so a corner's fraction of this element is the same
  // fraction of the photo -- which is what the server is told to expect.
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // A fresh photo resets everything; a rotation of it does not reopen.
  useEffect(() => {
    setWorking(file);
    setQuad(DEFAULT_QUAD);
  }, [file]);

  // Read the working file, detect, and show.
  useEffect(() => {
    if (!show || !working) return;
    let cancelled = false;
    const url = URL.createObjectURL(working);
    setSrc(url);
    setDetecting(true);
    setAutoFound(null);

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        // Decoding through an <img> has already applied EXIF orientation, so
        // these coordinates match what the user is about to see and drag.
        const found = context
          ? (context.drawImage(image, 0, 0),
             detectSleeveQuad(context.getImageData(0, 0, canvas.width, canvas.height)))
          : null;

        if (found && found.confidence >= CONFIDENT) {
          setQuad(found.quad);
          setAutoFound(true);
        } else {
          // No canvas, or nothing convincing. Fall back to a square the size
          // of the photo's shorter side rather than a slab of the frame.
          setQuad(defaultQuad(image.naturalWidth / image.naturalHeight));
          setAutoFound(false);
        }
      } catch (_) {
        setAutoFound(false);
      }
      setDetecting(false);
    };
    image.onerror = () => {
      if (cancelled) return;
      setAutoFound(false);
      setDetecting(false);
    };
    image.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [show, working]);

  /**
   * Turn the photo a quarter turn, pixels and all.
   *
   * A sleeve photographed on its side stays on its side however it is cropped,
   * so this has to happen before the corners mean anything. Redrawing through
   * a canvas keeps every coordinate in the image's own frame -- a CSS
   * transform would leave the layout box unrotated and every corner mapping to
   * undo by hand.
   */
  const rotate = useCallback(async (quarterTurns: 1 | -1) => {
    const image = imageRef.current;
    if (!image || rotating) return;
    setRotating(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((quarterTurns * Math.PI) / 2);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

      const turned = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!turned) return;

      // The corners turn with the picture, so a crop already placed survives.
      setQuad(current => {
        const turn = ([x, y]: Point): Point => (quarterTurns === 1 ? [1 - y, x] : [y, 1 - x]);
        return quarterTurns === 1
          ? {
              topLeft: turn(current.bottomLeft),
              topRight: turn(current.topLeft),
              bottomRight: turn(current.topRight),
              bottomLeft: turn(current.bottomRight)
            }
          : {
              topLeft: turn(current.topRight),
              topRight: turn(current.bottomRight),
              bottomRight: turn(current.bottomLeft),
              bottomLeft: turn(current.topLeft)
            };
      });

      setWorking(new File([turned], 'rotated.jpg', { type: 'image/jpeg' }));
    } finally {
      setRotating(false);
    }
  }, [rotating]);

  const moveCorner = useCallback((corner: keyof Quad, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
    setQuad(current => ({ ...current, [corner]: [x, y] as Point }));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      moveCorner(dragging, e.clientX, e.clientY);
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, moveCorner]);

  /**
   * Cut the framed region out for real.
   *
   * Done here rather than by handing corners to the server: the caller needs
   * the result on screen straight away, and an upload that happens only after
   * the album exists is far too late to show anything.
   */
  const apply = async () => {
    const image = imageRef.current;
    if (!image || !working) return;
    setApplying(true);
    try {
      const cropped = await warpQuad(image, quad);
      onConfirm(new File([cropped], 'cover.jpg', { type: 'image/jpeg' }));
    } catch (err) {
      setError(`Could not straighten that photo: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  const polygon = CORNERS.map(c => `${quad[c][0] * 100}% ${quad[c][1] * 100}%`).join(', ');

  return (
    <Modal show={show} onHide={onCancel} centered size="lg" fullscreen="md-down" className="cover-crop-dialog" style={{ zIndex: 10200 }}>
      <Modal.Header closeButton>
        <Modal.Title>{slot === 'back' ? 'Straighten the back cover' : 'Straighten the cover'}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div className="cover-crop-frame">
          <div className="cover-crop-stage" ref={stageRef}>
          {src && (
            <img
              ref={imageRef}
              src={src}
              alt="Cover to straighten"
              className="cover-crop-image"
              draggable={false}
            />
          )}

          {src && (
            <>
              <div className="cover-crop-shade" style={{ clipPath: `polygon(${polygon})` }} />
              <svg className="cover-crop-outline" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon
                  points={CORNERS.map(c => `${quad[c][0] * 100},${quad[c][1] * 100}`).join(' ')}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {CORNERS.map(corner => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Corner ${corner}`}
                  data-testid={`crop-corner-${corner}`}
                  className={`cover-crop-handle ${dragging === corner ? 'dragging' : ''}`}
                  style={{ left: `${quad[corner][0] * 100}%`, top: `${quad[corner][1] * 100}%` }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDragging(corner);
                  }}
                />
              ))}
            </>
          )}

          {dragging && src && (() => {
            // A finger covers the very point it is placing, so show what is
            // underneath it, magnified, in whichever corner the finger is not.
            const [cx, cy] = quad[dragging];
            const box = imageRef.current?.getBoundingClientRect();
            if (!box) return null;

            const width = box.width * LOUPE_ZOOM;
            const height = box.height * LOUPE_ZOOM;
            const px = cx * box.width;
            const py = cy * box.height;

            return (
              <div
                className={`cover-crop-loupe ${cx < 0.5 ? 'right' : 'left'}`}
                data-testid="crop-loupe"
                style={{
                  backgroundImage: `url(${src})`,
                  backgroundSize: `${width}px ${height}px`,
                  backgroundPosition: `${LOUPE_SIZE / 2 - px * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - py * LOUPE_ZOOM}px`
                }}
              >
                <div className="cover-crop-loupe-cross" />
              </div>
            );
          })()}

          {detecting && (
            <div className="cover-crop-detecting">
              <Spinner animation="border" size="sm" className="me-2" />
              Looking for the sleeve…
            </div>
          )}
          </div>
        </div>

        <div className="cover-crop-tools">
          <Button
            variant="secondary"
            size="sm"
            data-testid="rotate-left"
            disabled={!src || rotating || detecting}
            onClick={() => void rotate(-1)}
          >
            <BsArrowCounterclockwise className="me-1" />
            Rotate left
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="rotate-right"
            disabled={!src || rotating || detecting}
            onClick={() => void rotate(1)}
          >
            <BsArrowClockwise className="me-1" />
            Rotate right
          </Button>
        </div>

        {error && <div className="cover-crop-error">{error}</div>}

        <div className="cover-crop-status">
          {detecting
            ? null
            : autoFound
              ? 'Found the sleeve — drag a corner if it sits wrong.'
              : 'Could not pick out the sleeve; drag the corners onto it.'}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="link" disabled={applying} onClick={() => working && onConfirm(working)}>
          Use the photo as it is
        </Button>
        <Button variant="secondary" disabled={applying} onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={detecting || rotating || applying || !src}>
          {applying ? (
            <>
              <Spinner as="span" animation="border" size="sm" className="me-2" />
              Straightening…
            </>
          ) : (
            'Straighten and use'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CoverCropDialog;
