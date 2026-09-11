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
