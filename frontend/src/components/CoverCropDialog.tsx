import React, { useCallback, useEffect, useRef, useState } from 'react';
import Spinner, { Loading } from './shared/Spinner';
import { BsArrowCounterclockwise, BsArrowClockwise } from 'react-icons/bs';
import { detectSleeveQuad, defaultQuad, DEFAULT_QUAD, CONFIDENT, imagePixels, type Quad, type Point, type Subject } from '../utils/detectSleeveQuad';
import { warpQuad } from '../utils/warpQuad';
import './CoverCropDialog.css';
import Button from './shared/Button';
import Dialog from './shared/Dialog';

const CORNERS: Array<keyof Quad> = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
/** Each side by its two corners, in turn round the frame. */
type Edge = 'top' | 'right' | 'bottom' | 'left';
const EDGES: Record<Edge, [keyof Quad, keyof Quad]> = {
  top: ['topLeft', 'topRight'], right: ['topRight', 'bottomRight'], bottom: ['bottomRight', 'bottomLeft'], left: ['bottomLeft', 'topLeft'],
};

/** The magnified view shown while a corner is held under a finger. */
const LOUPE_SIZE = 128;
const LOUPE_ZOOM = 3;

interface CoverCropDialogProps {
  show: boolean;
  file: File | null;
  /** Which side is being straightened; only changes what the title says. */
  slot?: 'front' | 'back';
  /** What is in the photo: a CD's sleeve unless told otherwise. A book is not square. */
  subject?: Subject;
  /** A picture already framed (from the web): its frame starts on the whole of it, to be drawn in, not looked for. */
  whole?: boolean;
  onCancel: () => void;
  /**
   * The finished photograph: straightened if a frame was set, or as it stands
   * if it was used whole. Pixels rather than corners, so what was shown is
   * exactly what gets stored and the caller has something to display at once.
   */
  onConfirm: (photo: File) => void;
}

/**
 * Straighten a photographed sleeve, or book, before it becomes the cover.
 *
 * The corners are found automatically, and always shown for confirmation
 * rather than applied silently: the detector's best guess goes on the photo
 * whether it is sure of it or not, since a guess a little off needs a nudge
 * where a square in the middle needs four drags. Dragging is the fallback
 * that never fails, and the reason an imperfect detector is safe to ship.
 */
const CoverCropDialog: React.FC<CoverCropDialogProps> = ({ show, file, slot = 'front', subject = 'sleeve', whole = false, onCancel, onConfirm }) => {
  // The photo as it currently stands: the one picked, or the one a rotation
  // produced from it. Everything downstream -- detection, corners, upload --
  // refers to this and not to the original.
  const [working, setWorking] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [detecting, setDetecting] = useState(false);
  // The photo drawn on the page: until then, and while its corners are looked for, a spinner in its place.
  const [drawn, setDrawn] = useState(false);
  // Sure of the corners, offering them as a guess, or nothing found at all.
  const [autoFound, setAutoFound] = useState<'found' | 'guess' | 'none' | null>(null);
  const what = subject === 'book' ? 'the cover' : 'the sleeve';
  const [dragging, setDragging] = useState<keyof Quad | null>(null);
  // A side dragged whole, its two corners together, from where the pointer last was.
  const [draggingEdge, setDraggingEdge] = useState<{ edge: Edge; from: Point } | null>(null);
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
    setDrawn(false);
    setSrc(url);
    setDetecting(true);
    setAutoFound(null);

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      // Decoded here, it is drawn on the page as well: the same file.
      setDrawn(true);
      if (whole) {
        setQuad({ topLeft: [0, 0], topRight: [1, 0], bottomRight: [1, 1], bottomLeft: [0, 1] });
        setAutoFound(null);
        setDetecting(false);
        return;
      }
      try {
        const pixels = imagePixels(image);
        const found = pixels ? detectSleeveQuad(pixels, { subject }) : null;

        if (found) {
          // Shown whether or not it is sure: the words say which, and a
          // corner a little off is a short drag.
          setQuad(found.quad);
          setAutoFound(found.confidence >= CONFIDENT ? 'found' : 'guess');
        } else {
          // No canvas, or nothing that looks like a cover. Fall back to a
          // square the size of the photo's shorter side rather than a slab
          // of the frame.
          setQuad(defaultQuad(image.naturalWidth / image.naturalHeight));
          setAutoFound('none');
        }
      } catch (_) {
        setAutoFound('none');
      }
      setDetecting(false);
    };
    image.onerror = () => {
      if (cancelled) return;
      setDrawn(true);
      setAutoFound('none');
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

  /** Where a pointer is, as a fraction of the photo. */
  const pointAt = useCallback((clientX: number, clientY: number): Point | null => {
    const box = stageRef.current?.getBoundingClientRect();
    return box ? [(clientX - box.left) / box.width, (clientY - box.top) / box.height] : null;
  }, []);

  useEffect(() => {
    if (!draggingEdge) return;
    let from = draggingEdge.from;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      const at = pointAt(e.clientX, e.clientY);
      if (!at) return;
      // Measured now: the update below runs later, once from has moved on.
      const [moveX, moveY] = [at[0] - from[0], at[1] - from[1]];
      from = at;
      setQuad(current => {
        const [a, b] = EDGES[draggingEdge.edge];
        // The side moves as far as its corners can both go, the frame staying on the photo.
        const dx = Math.min(1 - Math.max(current[a][0], current[b][0]), Math.max(-Math.min(current[a][0], current[b][0]), moveX));
        const dy = Math.min(1 - Math.max(current[a][1], current[b][1]), Math.max(-Math.min(current[a][1], current[b][1]), moveY));
        return { ...current, [a]: [current[a][0] + dx, current[a][1] + dy] as Point, [b]: [current[b][0] + dx, current[b][1] + dy] as Point };
      });
    };
    const up = () => setDraggingEdge(null);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [draggingEdge, pointAt]);

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
      // The warp holds the page while it runs: its spinner is drawn first.
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
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
    <Dialog show={show} onClose={onCancel} size="lg" className="cover-crop-dialog" zIndex={10200} title={slot === 'back' ? 'Straighten the back cover' : 'Straighten the cover'}>
      <Dialog.Body>
        <div className={`cover-crop-frame${!src || !drawn || detecting ? ' cover-crop-frame--waiting' : ''}`}>
          {/* Outside the stage, which hugs a photo not drawn yet: a spinner and its words with room to be read. */}
          {(!src || !drawn || detecting) && (
            <div className="cover-crop-waiting"><Loading>{detecting ? `Looking for ${what}…` : 'Opening the photo…'}</Loading></div>
          )}
          {applying && <div className="cover-crop-waiting cover-crop-waiting--over"><Loading>Straightening…</Loading></div>}
          <div className="cover-crop-stage" ref={stageRef}>
          {src && (
            <img
              ref={imageRef}
              src={src}
              alt="Cover to straighten"
              className="cover-crop-image"
              style={drawn && !detecting ? undefined : { visibility: 'hidden' }}
              onLoad={() => setDrawn(true)}
              draggable={false}
            />
          )}

          {src && drawn && !detecting && (
            <>
              <div className="cover-crop-shade" style={{ clipPath: `polygon(${polygon})` }} />
              <svg className="cover-crop-outline" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon
                  points={CORNERS.map(c => `${quad[c][0] * 100},${quad[c][1] * 100}`).join(' ')}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {(Object.keys(EDGES) as Edge[]).map(edge => {
                // A bar in the middle of each side, along it: dragged, the side moves whole.
                const [a, b] = EDGES[edge];
                const box = stageRef.current?.getBoundingClientRect();
                const angle = box ? Math.atan2((quad[b][1] - quad[a][1]) * box.height, (quad[b][0] - quad[a][0]) * box.width) : 0;
                return (
                  <button
                    key={edge}
                    type="button"
                    aria-label={`Side ${edge}`}
                    data-testid={`crop-edge-${edge}`}
                    className={`cover-crop-edge ${draggingEdge?.edge === edge ? 'dragging' : ''}`}
                    style={{ left: `${(quad[a][0] + quad[b][0]) * 50}%`, top: `${(quad[a][1] + quad[b][1]) * 50}%`, transform: `translate(-50%, -50%) rotate(${angle}rad)` }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const at = pointAt(e.clientX, e.clientY);
                      if (at) setDraggingEdge({ edge, from: at });
                    }}
                  />
                );
              })}
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

          </div>
        </div>

        <div className="cover-crop-tools">
          <Button icon={<BsArrowCounterclockwise />}
            size="sm"
            data-testid="rotate-left"
            disabled={!src || rotating || detecting}
            onClick={() => void rotate(-1)}
          >
            Rotate left
          </Button>
          <Button icon={<BsArrowClockwise />}
            size="sm"
            data-testid="rotate-right"
            disabled={!src || rotating || detecting}
            onClick={() => void rotate(1)}
          >
            Rotate right
          </Button>
        </div>

        {error && <div className="cover-crop-error">{error}</div>}

        {/* The frame on the photo says what was found; words only when nothing was, the frame then a guess of none. */}
        {!detecting && autoFound === 'none' && (
          <div className="cover-crop-status">No {what.replace('the ', '')} found: drag the corners onto it.</div>
        )}
      </Dialog.Body>

      <Dialog.Footer>
        <Button variant="quiet" disabled={applying} onClick={() => working && onConfirm(working)}>
          Use the photo as it is
        </Button>
        <Button variant="quiet" disabled={applying} onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={detecting || rotating || applying || !src}>
          {applying ? (
            <>
              <Spinner size="sm" className="me-2" />
              Straightening…
            </>
          ) : (
            'Straighten and use'
          )}
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
};

export default CoverCropDialog;
