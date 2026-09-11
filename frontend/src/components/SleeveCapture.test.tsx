import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SleeveCapture from './SleeveCapture';

vi.mock('../utils/downscaleImage', () => ({
  downscaleImage: vi.fn((_file: File, maxEdge?: number) =>
    Promise.resolve({ base64: maxEdge ? 'BIG' : 'SMALL', mimeType: 'image/jpeg' })
  )
}));

vi.mock('../services/musicService', () => ({
  default: { transcribeSleeve: vi.fn() }
}));

import musicService from '../services/musicService';

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
    // The back carries the track list, which is the reason to be here at all.
    expect(labels[0]).toMatch(/back cover/i);
    expect(labels[1]).toMatch(/front cover/i);
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
