import { detectSleeveQuad, CONFIDENT, imagePixels, type Subject } from './detectSleeveQuad';
import { warpQuad } from './warpQuad';

/**
 * A sleeve or a book cut out of a photograph and squared, when the detector is
 * sure of its corners; null otherwise, the photo then waiting for the
 * straightening dialog, where the detector's best guess is shown to check.
 */
export const straightenIfSure = async (file: File, subject: Subject): Promise<File | null> => {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
    const pixels = imagePixels(image);
    if (!pixels) return null;
    const found = detectSleeveQuad(pixels, { subject });
    if (!found || found.confidence < CONFIDENT) return null;
    const cropped = await warpQuad(image, found.quad);
    return new File([cropped], `${subject}.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
};

export default straightenIfSure;
