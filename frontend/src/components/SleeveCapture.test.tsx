import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SleeveCapture from './SleeveCapture';

vi.mock('../utils/downscaleImage', () => ({
  downscaleImage: vi.fn((_file: File, maxEdge?: number) =>
    Promise.resolve({ base64: maxEdge ? 'BIG' : 'SMALL', mimeType: 'image/jpeg' })
  ),
  base64ToFile: vi.fn((_b64: string, mimeType: string, name: string) =>
    new File(['x'], name, { type: mimeType })
  )
}));

vi.mock('../services/musicService', () => ({
  default: { transcribeSleeve: vi.fn() }
}));

vi.mock('../utils/detectSleeveQuad', async () => {
  const actual = await vi.importActual<any>('../utils/detectSleeveQuad');
  return { ...actual, detectSleeveQuad: vi.fn(() => null) };
});

vi.mock('../utils/warpQuad', () => ({
  warpQuad: vi.fn(async () => new Blob(['cut'], { type: 'image/jpeg' })),
  default: vi.fn()
}));

import musicService from '../services/musicService';
import { detectSleeveQuad } from '../utils/detectSleeveQuad';
import { warpQuad } from '../utils/warpQuad';

const photo = () => new File(['x'], 'sleeve.jpg', { type: 'image/jpeg' });

const pick = (testId: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { files: [photo()] } });

const draftResponse = {
  draft: { title: 'Atlas of Small Things', discs: [] },
  sources: { front: 'absent', back: 'ok' },
  truncated: false
};

describe('SleeveCapture', () => {
  const onDraft = vi.fn();
  const onSkip = vi.fn();

  const renderCapture = (props = {}) =>
    render(<SleeveCapture onDraft={onDraft} onSkip={onSkip} {...props} />);

  beforeEach(() => {
    vi.clearAllMocks();
    (musicService.transcribeSleeve as any).mockResolvedValue(draftResponse);
  });

  it('offers a slot for each side and leads with the back', () => {
    renderCapture();

    const labels = screen.getAllByRole('button').map(b => b.textContent);
    // The front leads: it is the one that becomes the artwork, and the one
    // whose absence used to mean no cover was stored at all.
    expect(labels[0]).toMatch(/front cover/i);
    expect(labels[1]).toMatch(/back cover/i);
  });

  it('cannot read a sleeve before a photo is taken', () => {
    renderCapture();

    expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeDisabled();
  });

  it('reads the back on its own', async () => {
    renderCapture();
    pick('sleeve-back-input');

    await waitFor(() => expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /read the sleeve/i }));

    await waitFor(() =>
      expect(musicService.transcribeSleeve).toHaveBeenCalledWith({
        front: undefined,
        back: { base64: 'SMALL', mimeType: 'image/jpeg' }
      })
    );
  });

  it('hands the draft and the cover photo back to the caller', async () => {
    renderCapture();
    pick('sleeve-front-input');
    pick('sleeve-back-input');

    await waitFor(() => expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /read the sleeve/i }));

    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    const result = onDraft.mock.calls[0][0];
    expect(result.draft.title).toBe('Atlas of Small Things');
    // The same image the model read: the upload endpoint resizes to 1000px, so
    // a second larger encode would have been thrown away.
    expect(result.coverPhoto).toEqual({ base64: 'SMALL', mimeType: 'image/jpeg' });
  });

  it('reuses a front photo the scan already took', async () => {
    renderCapture({ initialFront: { base64: 'FROM-SCAN', mimeType: 'image/jpeg' } });
    pick('sleeve-back-input');

    await waitFor(() => expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /read the sleeve/i }));

    await waitFor(() =>
      expect(musicService.transcribeSleeve).toHaveBeenCalledWith(
        expect.objectContaining({ front: { base64: 'FROM-SCAN', mimeType: 'image/jpeg' } })
      )
    );
  });

  it('keeps the user in charge when the sleeve cannot be read', async () => {
    (musicService.transcribeSleeve as any).mockRejectedValue(new Error('Could not read the sleeve'));
    renderCapture();
    pick('sleeve-back-input');

    await waitFor(() => expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /read the sleeve/i }));

    await waitFor(() => expect(screen.getByText(/could not read the sleeve/i)).toBeInTheDocument());
    expect(onDraft).not.toHaveBeenCalled();
    // The form is still reachable by hand.
    expect(screen.getByRole('button', { name: /by hand/i })).toBeEnabled();
  });

  it('lets the user skip straight to an empty form', () => {
    renderCapture();

    fireEvent.click(screen.getByRole('button', { name: /by hand/i }));

    expect(onSkip).toHaveBeenCalled();
  });

  it('keeps its file inputs mounted so the camera can open from the tap', () => {
    // iOS refuses to open the camera if the input appears after a state change.
    renderCapture();

    expect(screen.getByTestId('sleeve-front-input')).toBeInTheDocument();
    expect(screen.getByTestId('sleeve-back-input')).toBeInTheDocument();
  });
});

describe('SleeveCapture — the cover always comes back with the draft', () => {
  const onDraft = vi.fn();
  const onSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (musicService.transcribeSleeve as any).mockResolvedValue(draftResponse);
  });

  const read = async () => {
    await waitFor(() => expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /read the sleeve/i }));
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    return onDraft.mock.calls[0][0];
  };

  it('keeps the cover when the front was reused from a scan', async () => {
    // The scan hands over what it sent to the model and nothing else. Without
    // this, the path the feature was designed around -- scan, nothing matched,
    // read the sleeve -- saved the album with no cover at all.
    render(
      <SleeveCapture
        initialFront={{ base64: 'FROM-SCAN', mimeType: 'image/jpeg' }}
        onDraft={onDraft}
        onSkip={onSkip}
      />
    );
    fireEvent.change(screen.getByTestId('sleeve-back-input'), {
      target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] }
    });

    const result = await read();

    expect(result.coverPhoto).toEqual({ base64: 'FROM-SCAN', mimeType: 'image/jpeg' });
  });

  it('sends no cover when there is no front photograph at all', async () => {
    render(<SleeveCapture onDraft={onDraft} onSkip={onSkip} />);
    fireEvent.change(screen.getByTestId('sleeve-back-input'), {
      target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] }
    });

    const result = await read();

    expect(result.coverPhoto).toBeUndefined();
  });
});

describe('SleeveCapture — seeing the photo that becomes the cover', () => {
  const onDraft = vi.fn();
  const onSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (musicService.transcribeSleeve as any).mockResolvedValue(draftResponse);
  });

  const renderCapture = () => render(<SleeveCapture onDraft={onDraft} onSkip={onSkip} />);

  it('shows nothing before a photo is taken', () => {
    renderCapture();

    expect(screen.queryByTestId('sleeve-thumb-front')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sleeve-thumb-back')).not.toBeInTheDocument();
  });

  it('shows each photo once taken', async () => {
    // Going in blind is what made it look as though no cover was attached.
    renderCapture();

    pick('sleeve-front-input');
    await waitFor(() => expect(screen.getByTestId('sleeve-thumb-front')).toBeInTheDocument());

    pick('sleeve-back-input');
    await waitFor(() => expect(screen.getByTestId('sleeve-thumb-back')).toBeInTheDocument());
  });

  it('says plainly which photo becomes the cover', async () => {
    renderCapture();
    pick('sleeve-front-input');

    await waitFor(() => expect(screen.getByText(/this will be the cover/i)).toBeInTheDocument());
  });

  it('offers to crop or rotate either side before it is used', async () => {
    renderCapture();

    pick('sleeve-front-input');
    await waitFor(() => expect(screen.getByTestId('crop-front')).toBeInTheDocument());

    // The back leans just as much, and is kept as the back cover.
    pick('sleeve-back-input');
    await waitFor(() => expect(screen.getByTestId('crop-back')).toBeInTheDocument());
  });

  it('says which cover each photo becomes', async () => {
    renderCapture();

    pick('sleeve-back-input');
    await waitFor(() => expect(screen.getByText(/this will be the back cover/i)).toBeInTheDocument());
  });

  it('carries both photographs through to the caller', async () => {
    renderCapture();
    pick('sleeve-back-input');
    await waitFor(() => expect(screen.getByRole('button', { name: /read the sleeve/i })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: /read the sleeve/i }));

    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    // The back travels too, or it would be lost at save time.
    expect(onDraft.mock.calls[0][0].backPhoto).toEqual({ base64: 'SMALL', mimeType: 'image/jpeg' });
  });
});

describe('SleeveCapture — a front handed over by a scan', () => {
  const onDraft = vi.fn();
  const onSkip = vi.fn();
  const FOUND = {
    quad: { topLeft: [0.1, 0.1], topRight: [0.9, 0.1], bottomRight: [0.9, 0.9], bottomLeft: [0.1, 0.9] },
    confidence: 0.9
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (musicService.transcribeSleeve as any).mockResolvedValue(draftResponse);
    // jsdom has no canvas, so the detection path needs one that answers.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, colorSpace: 'srgb' })
    } as unknown as CanvasRenderingContext2D);
    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:scanned');
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 750;
      naturalHeight = 1000;
      set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
    }
    (globalThis as any).Image = FakeImage as unknown as typeof Image;
  });

  const withScannedFront = () =>
    render(
      <SleeveCapture
        initialFront={{ base64: 'RlJPTS1TQ0FO', mimeType: 'image/jpeg' }}
        onDraft={onDraft}
        onSkip={onSkip}
      />
    );

  it('looks for the sleeve in it, like any other photograph', async () => {
    // It arrives as base64 straight into state, so it used to reach neither
    // the detector nor the crop button.
    (detectSleeveQuad as any).mockReturnValue(FOUND);
    withScannedFront();

    await waitFor(() => expect(detectSleeveQuad).toHaveBeenCalled());
    await waitFor(() => expect(warpQuad).toHaveBeenCalled());
  });

  it('says it straightened it', async () => {
    (detectSleeveQuad as any).mockReturnValue(FOUND);
    withScannedFront();

    await waitFor(() => expect(screen.getByText(/straightened for you/i)).toBeInTheDocument());
  });

  it('offers to crop it by hand as well', async () => {
    (detectSleeveQuad as any).mockReturnValue(null);
    withScannedFront();

    // Without a File kept for it, this button never appeared for the one
    // photograph already on screen.
    await waitFor(() => expect(screen.getByTestId('crop-front')).toBeInTheDocument());
  });

  it('straightens it even when the screen is mounted twice', async () => {
    // React's strict mode mounts, unmounts and mounts again, as a remount after
    // navigating does. The first attempt is cancelled with the first mount,
    // and the second used to skip the photo as already dealt with -- so on
    // the development server it was never straightened at all.
    (detectSleeveQuad as any).mockReturnValue(FOUND);
    render(
      <React.StrictMode>
        <SleeveCapture
          initialFront={{ base64: 'RlJPTS1TQ0FO', mimeType: 'image/jpeg' }}
          onDraft={onDraft}
          onSkip={onSkip}
        />
      </React.StrictMode>
    );

    await waitFor(() => expect(screen.getByText(/straightened for you/i)).toBeInTheDocument());
  });

  it('leaves it alone when the sleeve cannot be found', async () => {
    (detectSleeveQuad as any).mockReturnValue(null);
    withScannedFront();

    await waitFor(() => expect(detectSleeveQuad).toHaveBeenCalled());
    expect(warpQuad).not.toHaveBeenCalled();
    expect(screen.getByText(/this will be the cover/i)).toBeInTheDocument();
  });
});
