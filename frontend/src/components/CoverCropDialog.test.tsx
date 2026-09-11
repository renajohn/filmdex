import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CoverCropDialog from './CoverCropDialog';

vi.mock('../utils/detectSleeveQuad', async () => {
  const actual = await vi.importActual<any>('../utils/detectSleeveQuad');
  return { ...actual, detectSleeveQuad: vi.fn(), default: vi.fn() };
});

import { detectSleeveQuad, DEFAULT_QUAD } from '../utils/detectSleeveQuad';

const DETECTED = {
  topLeft: [0.2, 0.15] as [number, number],
  topRight: [0.8, 0.2] as [number, number],
  bottomRight: [0.75, 0.8] as [number, number],
  bottomLeft: [0.15, 0.75] as [number, number]
};

/** jsdom never loads a blob url, so the decode is driven by hand. */
const stubImageLoading = () => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 800;
    naturalHeight = 600;
    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  (globalThis as any).Image = FakeImage as unknown as typeof Image;
};

const photo = () => new File(['x'], 'cover.jpg', { type: 'image/jpeg' });

/** jsdom ships no canvas, so getContext answers null and the detector is */
/** never reached. The pixels themselves do not matter here: the detector is */
/** mocked, and has its own tests against scenes built pixel by pixel. */
const stubCanvas = () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
      colorSpace: 'srgb'
    })
  } as unknown as CanvasRenderingContext2D);
};

beforeEach(() => {
  vi.clearAllMocks();
  stubImageLoading();
  stubCanvas();
  (URL as any).createObjectURL = vi.fn(() => 'blob:cover');
  (URL as any).revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderDialog = (props = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<CoverCropDialog show file={photo()} onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel };
};

describe('CoverCropDialog', () => {
  it('offers a handle for each corner', async () => {
    (detectSleeveQuad as any).mockReturnValue(null);
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('crop-corner-topLeft')).toBeInTheDocument());
    for (const corner of ['topRight', 'bottomRight', 'bottomLeft']) {
      expect(screen.getByTestId(`crop-corner-${corner}`)).toBeInTheDocument();
    }
  });

  it('uses the corners it found, and says so', async () => {
    (detectSleeveQuad as any).mockReturnValue({ quad: DETECTED, confidence: 0.9 });
    const { onConfirm } = renderDialog();

    await waitFor(() => expect(screen.getByText(/found the sleeve/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /straighten and use/i }));

    expect(onConfirm).toHaveBeenCalledWith(DETECTED);
  });

  it('falls back to a draggable rectangle when it is not sure', async () => {
    // Low confidence must not be passed off as an answer.
    (detectSleeveQuad as any).mockReturnValue({ quad: DETECTED, confidence: 0.3 });
    const { onConfirm } = renderDialog();

    await waitFor(() => expect(screen.getByText(/could not pick out the sleeve/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /straighten and use/i }));

    expect(onConfirm).toHaveBeenCalledWith(DEFAULT_QUAD);
  });

  it('lets the photo through untouched', async () => {
    (detectSleeveQuad as any).mockReturnValue(null);
    const { onConfirm } = renderDialog();

    await waitFor(() => expect(screen.getByTestId('crop-corner-topLeft')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /use the photo as it is/i }));

    // null means "store it as shot", which is the old behaviour.
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it('uploads nothing when cancelled', async () => {
    (detectSleeveQuad as any).mockReturnValue(null);
    const { onConfirm, onCancel } = renderDialog();

    await waitFor(() => expect(screen.getByTestId('crop-corner-topLeft')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('CoverCropDialog — which side is being straightened', () => {
  beforeEach(() => {
    (detectSleeveQuad as any).mockReturnValue(null);
  });

  it('names the front by default', async () => {
    renderDialog();

    await waitFor(() => expect(screen.getByText('Straighten the cover')).toBeInTheDocument());
  });

  it('says so when it is the back', async () => {
    // The back leans exactly as much as the front; the only difference the
    // user should notice is the title.
    renderDialog({ slot: 'back' });

    await waitFor(() => expect(screen.getByText('Straighten the back cover')).toBeInTheDocument());
  });
});

describe('CoverCropDialog — seeing under your own finger', () => {
  beforeEach(() => {
    (detectSleeveQuad as any).mockReturnValue(null);
  });

  const grab = async (corner: string) => {
    await waitFor(() => expect(screen.getByTestId(`crop-corner-${corner}`)).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByTestId(`crop-corner-${corner}`));
  };

  it('shows nothing while no corner is held', async () => {
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('crop-corner-topLeft')).toBeInTheDocument());
    expect(screen.queryByTestId('crop-loupe')).not.toBeInTheDocument();
  });

  it('magnifies the point as soon as a corner is grabbed', async () => {
    // Before any movement: the finger is already covering the target.
    renderDialog();
    await grab('topLeft');

    await waitFor(() => expect(screen.getByTestId('crop-loupe')).toBeInTheDocument());
  });

  it('sits opposite the finger, so it is not covered in turn', async () => {
    renderDialog();

    await grab('topLeft');
    // A corner on the left half puts the loupe on the right.
    await waitFor(() => expect(screen.getByTestId('crop-loupe')).toHaveClass('right'));

    fireEvent.pointerUp(window);
    await grab('bottomRight');
    await waitFor(() => expect(screen.getByTestId('crop-loupe')).toHaveClass('left'));
  });

  it('puts the magnified view away once the finger lifts', async () => {
    renderDialog();
    await grab('topLeft');
    await waitFor(() => expect(screen.getByTestId('crop-loupe')).toBeInTheDocument());

    fireEvent.pointerUp(window);

    await waitFor(() => expect(screen.queryByTestId('crop-loupe')).not.toBeInTheDocument());
  });
});

describe('CoverCropDialog — corners are fractions of the photo, not of the box around it', () => {
  beforeEach(() => {
    (detectSleeveQuad as any).mockReturnValue(null);
  });

  /**
   * jsdom ships no PointerEvent, so fireEvent.pointerMove sends a bare Event
   * with no coordinates. A MouseEvent of the same type carries them, and the
   * listener does not care which constructor made it.
   */
  const dragTo = (clientX: number, clientY: number) =>
    window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }));

  /** A 400x300 photo whose left edge sits 100px into the dialog. */
  const stageAt = () => {
    const stage = document.querySelector('.cover-crop-stage') as HTMLElement;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 50, width: 400, height: 300,
      right: 500, bottom: 350, x: 100, y: 50, toJSON: () => ({})
    } as DOMRect);
  };

  it('measures a drag against the image itself', async () => {
    // The photo is centred with a max-width, so a portrait shot -- every phone
    // photo -- is letterboxed. Measuring against the outer frame would send
    // the server fractions of the wrong rectangle.
    const { onConfirm } = renderDialog();
    await waitFor(() => expect(screen.getByTestId('crop-corner-topLeft')).toBeInTheDocument());

    stageAt();

    fireEvent.pointerDown(screen.getByTestId('crop-corner-topLeft'));
    // Dropped at the centre of the image: 100 + 200, 50 + 150.
    dragTo(300, 200);
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole('button', { name: /straighten and use/i }));

    const corners = onConfirm.mock.calls[0][0];
    expect(corners.topLeft[0]).toBeCloseTo(0.5, 3);
    expect(corners.topLeft[1]).toBeCloseTo(0.5, 3);
  });

  it('clamps a drag that leaves the photo', async () => {
    const { onConfirm } = renderDialog();
    await waitFor(() => expect(screen.getByTestId('crop-corner-topLeft')).toBeInTheDocument());

    stageAt();

    fireEvent.pointerDown(screen.getByTestId('crop-corner-topLeft'));
    dragTo(-500, -500);
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole('button', { name: /straighten and use/i }));

    const corners = onConfirm.mock.calls[0][0];
    expect(corners.topLeft).toEqual([0, 0]);
  });
});
