import { describe, it, expect, vi, afterEach } from 'vitest';
import { picardUrl, openInPicard } from './picard';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('picard', () => {
  it('demande à Picard d’ouvrir l’édition, comme le bouton Tagger de MusicBrainz', () => {
    expect(picardUrl('248fc7b2-2987-47fc-ae5b-ab4142fae837', 42))
      .toBe('http://127.0.0.1:8000/openalbum?id=248fc7b2-2987-47fc-ae5b-ab4142fae837&t=42');
  });

  it('ouvre une petite fenêtre et la referme', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue({ close } as unknown as Window);

    openInPicard('rel-1');

    expect(open.mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:8000\/openalbum\?id=rel-1&t=\d+$/);
    vi.advanceTimersByTime(1500);
    expect(close).toHaveBeenCalled();
  });
});
