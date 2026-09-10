import { describe, it, expect, vi, afterEach } from 'vitest';
import { downscaleImage } from './downscaleImage';

const file = (type = 'image/jpeg') =>
  new File([new Uint8Array([1, 2, 3, 4])], 'sleeve', { type });

/**
 * jsdom decodes nothing, so drive the <img> outcome by hand. The canvas branch
 * cannot run here; what matters for the server contract is the base64 shape.
 */
const stubImage = (outcome: 'error' | 'silent') => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 0;
    height = 0;

    set src(_value: string) {
      if (outcome === 'error') {
        setTimeout(() => this.onerror?.(), 0);
      }
      // 'silent' never calls back, standing in for a decoder that hangs
    }
  }

  vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('downscaleImage', () => {
  it('returns raw base64, never a data-url, so the API gets what it expects', async () => {
    stubImage('error');

    const result = await downscaleImage(file());

    expect(result.base64).not.toMatch(/^data:/);
    expect(result.base64.length).toBeGreaterThan(0);
  });

  it('falls back to the original bytes for a format the browser cannot decode', async () => {
    stubImage('error');

    const result = await downscaleImage(file('image/heic'));

    // The server re-encodes HEIC with sharp, so forwarding it untouched is fine.
    expect(result.mimeType).toBe('image/heic');
  });

  it('gives up instead of hanging when decoding never completes', async () => {
    vi.useFakeTimers();
    stubImage('silent');

    const pending = downscaleImage(file());
    await vi.advanceTimersByTimeAsync(6000);

    await expect(pending).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });
});
