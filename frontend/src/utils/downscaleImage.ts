export interface DownscaledImage {
  base64: string;
  mimeType: string;
}

/** Longest edge sent to the scan endpoint. */
const MAX_EDGE = 1024;
/** Give up on decoding rather than leaving the spinner running forever. */
const DECODE_TIMEOUT_MS = 5000;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });

const stripDataUrlPrefix = (dataUrl: string): string => dataUrl.replace(/^data:[^;]+;base64,/, '');

/**
 * Shrink a picked photo to at most 1024px on its longest edge and return raw
 * base64 (no data-url prefix).
 *
 * A phone photo is 3-5MB; sending it untouched wastes seconds of upload on
 * mobile data for no gain, since the vision model sees 1024px anyway. Decoding
 * through an <img> also applies EXIF orientation, so the sleeve arrives upright.
 *
 * Falls back to the original bytes whenever the browser cannot decode the file
 * (an iPhone HEIC, typically) -- the server re-encodes with sharp in that case.
 */
export const downscaleImage = async (file: File): Promise<DownscaledImage> => {
  const dataUrl = await readAsDataUrl(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => reject(new Error('image decode timed out')), DECODE_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('unsupported image format'));
      };
      img.src = dataUrl;
    });

    const longestEdge = Math.max(image.width, image.height);
    if (!longestEdge) throw new Error('image has no dimensions');

    const scale = Math.min(1, MAX_EDGE / longestEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas context');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = stripDataUrlPrefix(jpegDataUrl);
    if (!base64) throw new Error('canvas produced nothing');

    return { base64, mimeType: 'image/jpeg' };
  } catch (_) {
    return {
      base64: stripDataUrlPrefix(dataUrl),
      mimeType: file.type || 'image/jpeg'
    };
  }
};

export default downscaleImage;
