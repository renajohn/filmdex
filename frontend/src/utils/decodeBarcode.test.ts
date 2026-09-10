import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodeBarcode, normalizeBarcode } from './decodeBarcode';

const file = () => new File([new Uint8Array([1, 2, 3])], 'barcode.jpg', { type: 'image/jpeg' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Stub the native BarcodeDetector, which jsdom does not provide. */
const stubNativeDetector = (result: Array<{ rawValue: string }> | Error) => {
  class FakeDetector {
    static getSupportedFormats = async () => ['ean_13', 'upc_a'];
    async detect() {
      if (result instanceof Error) throw result;
      return result;
    }
  }
  vi.stubGlobal('BarcodeDetector', FakeDetector);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 10, height: 10, close() {} }));
};

describe('normalizeBarcode', () => {
  it('keeps a plain EAN-13', () => {
    expect(normalizeBarcode('5099750442227')).toBe('5099750442227');
  });

  it('strips spaces and dashes a scanner or a human may add', () => {
    expect(normalizeBarcode(' 5099-750 442227 ')).toBe('5099750442227');
  });

  it('returns null for something that is not a barcode', () => {
    expect(normalizeBarcode('not a barcode')).toBeNull();
    expect(normalizeBarcode('')).toBeNull();
  });

  it('rejects a number of implausible length', () => {
    expect(normalizeBarcode('12345')).toBeNull();
  });
});

describe('decodeBarcode', () => {
  it('uses the native detector when the browser has one', async () => {
    stubNativeDetector([{ rawValue: '5099750442227' }]);

    await expect(decodeBarcode(file())).resolves.toBe('5099750442227');
  });

  it('normalizes what the detector returned', async () => {
    stubNativeDetector([{ rawValue: ' 5099 750442227 ' }]);

    await expect(decodeBarcode(file())).resolves.toBe('5099750442227');
  });

  it('reports no barcode found rather than throwing', async () => {
    stubNativeDetector([]);

    await expect(decodeBarcode(file())).resolves.toBeNull();
  });

  it('falls back to the bundled decoder when there is no native detector', async () => {
    // No BarcodeDetector at all: the ZXing path must be attempted.
    vi.stubGlobal('BarcodeDetector', undefined);

    // Nothing decodable in these three bytes, so null is the honest answer --
    // what matters is that it resolves instead of blowing up.
    await expect(decodeBarcode(file())).resolves.toBeNull();
  });
});
