import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import { detectSleeveQuad, DEFAULT_QUAD, type Quad, type Point } from '../utils/detectSleeveQuad';
import './CoverCropDialog.css';

const CORNERS: Array<keyof Quad> = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

/** Above this the corners are trustworthy enough to say so on screen. */
const CONFIDENT = 0.6;

interface CoverCropDialogProps {
  show: boolean;
  file: File | null;
  onCancel: () => void;
  /** The corners as fractions of the displayed image, or null to use it whole. */
  onConfirm: (corners: Quad | null) => void;
}

/**
 * Straighten a photographed sleeve before it becomes the cover.
 *
 * The corners are found automatically when the sleeve stands out from what it
 * is lying on, and guessed at when it does not -- so they are always shown for
 * confirmation rather than applied silently. Dragging is the fallback that
 * never fails, and the reason an imperfect detector is safe to ship.
 */
const CoverCropDialog: React.FC<CoverCropDialogProps> = ({ show, file, onCancel, onConfirm }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [detecting, setDetecting] = useState(false);
  const [autoFound, setAutoFound] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState<keyof Quad | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // Read the file once per dialog opening, detect, and show.
  useEffect(() => {
    if (!show || !file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setDetecting(true);
    setAutoFound(null);
    setQuad(DEFAULT_QUAD);

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
          // No canvas, or nothing convincing: the corners are a starting point.
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
  }, [show, file]);

  const moveCorner = useCallback((corner: keyof Quad, clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const box = frame.getBoundingClientRect();
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

  const polygon = CORNERS.map(c => `${quad[c][0] * 100}% ${quad[c][1] * 100}%`).join(', ');

  return (
    <Modal show={show} onHide={onCancel} centered size="lg" className="cover-crop-dialog" style={{ zIndex: 10200 }}>
      <Modal.Header closeButton>
        <Modal.Title>Straighten the cover</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div className="cover-crop-frame" ref={frameRef}>
          {src && <img src={src} alt="Cover to straighten" className="cover-crop-image" draggable={false} />}

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

          {detecting && (
            <div className="cover-crop-detecting">
              <Spinner animation="border" size="sm" className="me-2" />
              Looking for the sleeve…
            </div>
          )}
        </div>

        <div className="cover-crop-status">
          {detecting
            ? null
            : autoFound
              ? 'Found the sleeve — drag a corner if it sits wrong.'
              : 'Could not pick out the sleeve; drag the corners onto it.'}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="link" onClick={() => onConfirm(null)}>
          Use the photo as it is
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(quad)} disabled={detecting}>
          Straighten and use
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CoverCropDialog;
