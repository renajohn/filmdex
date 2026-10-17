/**
 * A list's image at the width it is shown, and twice that for a sharp screen.
 *
 * The backend makes a smaller copy of a stored image when asked ?w=<pixels>
 * (rounded up to 120, 240, 360, 480 or 720), so a grid of covers no longer
 * loads the 1000px ones its cards show. An image from elsewhere (TMDB, Cover
 * Art Archive, Navidrome) is left as it is.
 */

const isStored = (url: string): boolean => url.startsWith('/api/images/') || url.startsWith('/images/');

/** `url` at `width` pixels when it is a stored image, else `url` itself. */
export const thumbUrl = (url: string, width: number): string =>
  isStored(url) ? `${url}${url.includes('?') ? '&' : '?'}w=${width}` : url;

/** The `src` and `srcSet` of an `<img>` showing `url` about `width` pixels wide. */
export const thumbProps = (url: string, width = 240): { src: string; srcSet?: string } =>
  isStored(url)
    ? { src: thumbUrl(url, width), srcSet: `${thumbUrl(url, width)} 1x, ${thumbUrl(url, width * 2)} 2x` }
    : { src: url };
