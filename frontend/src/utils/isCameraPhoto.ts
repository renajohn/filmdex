/**
 * Whether an image is a photograph taken with a phone or a camera, to be
 * squared by itself, rather than a picture from the web, kept as it is: a
 * HEIC is a photograph; a JPEG is one when its EXIF names the maker of the
 * camera (tag Make: Apple, samsung, Canon…), which pictures on the web lack.
 */
export const isCameraPhoto = async (file: File): Promise<boolean> => {
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return true;
  const bytes = new Uint8Array(await bufferOf(file.slice(0, 128 * 1024)));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  // The JPEG's segments, to its APP1 Exif one.
  let at = 2;
  while (at + 4 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker === 0xe1 && String.fromCharCode(...bytes.slice(at + 4, at + 8)) === 'Exif') return hasMake(bytes, at + 10);
    if (marker === 0xda) break;
    at += 2 + length;
  }
  return false;
};

/** A blob's bytes: by arrayBuffer, else by a FileReader (older browsers, the tests' DOM). */
const bufferOf = (blob: Blob): Promise<ArrayBuffer> => (typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer()
  : new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  }));

/** In the TIFF header at start, the first IFD's tag 0x010F (Make), with something in it. */
const hasMake = (bytes: Uint8Array, start: number): boolean => {
  const little = bytes[start] === 0x49;
  const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) => (little
    ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
    : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0);
  const ifd = start + u32(start + 4);
  if (ifd + 2 > bytes.length) return false;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) return false;
    if (u16(entry) === 0x010f) return u32(entry + 4) > 1;
  }
  return false;
};

export default isCameraPhoto;
