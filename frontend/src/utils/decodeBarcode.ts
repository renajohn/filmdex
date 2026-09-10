/**
 * Read a product barcode from a photo.
 *
 * A photo rather than a live camera feed on purpose: getUserMedia requires a
 * secure context, so live scanning is unavailable over plain HTTP on a LAN
 * address, while <input type="file" capture> works everywhere.
 *
 * Prefers the browser's own BarcodeDetector (Chrome, Android) and falls back to
 * ZXing, loaded on demand so it stays out of the initial bundle.
 */

/** EAN-13, UPC-A, EAN-8 and the occasional ITF-14 all land in this range. */
const PLAUSIBLE_LENGTHS = [8, 12, 13, 14];

export const normalizeBarcode = (raw: string | null | undefined): string | null => {
  if (!raw) return null;

  const digits = String(raw).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (!PLAUSIBLE_LENGTHS.includes(digits.length)) return null;

  return digits;
};

const withNativeDetector = async (file: File): Promise<string | null> => {
  const Detector = (globalThis as any).BarcodeDetector;
  if (!Detector) return null;

  const detector = new Detector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e', 'itf'] });
  const bitmap = await (globalThis as any).createImageBitmap(file);
  try {
    const found = await detector.detect(bitmap);
    return found?.[0]?.rawValue ?? null;
  } finally {
    bitmap.close?.();
  }
};

const withZxing = async (file: File): Promise<string | null> => {
  const { BrowserMultiFormatReader } = await import('@zxing/library');
  const reader = new BrowserMultiFormatReader();

  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return result?.getText() ?? null;
  } finally {
    URL.revokeObjectURL(url);
    reader.reset?.();
  }
};

/** Returns the normalized barcode, or null when none could be read. */
export const decodeBarcode = async (file: File): Promise<string | null> => {
  try {
    const native = await withNativeDetector(file);
    const normalized = normalizeBarcode(native);
    if (normalized) return normalized;
  } catch (_) {
    // fall through to ZXing
  }

  try {
    return normalizeBarcode(await withZxing(file));
  } catch (_) {
    return null;
  }
};

export default decodeBarcode;
