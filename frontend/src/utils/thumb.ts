/**
 * A list's image at the width it is shown, and twice that for a sharp screen.
 *
 * The backend makes a smaller copy of a stored image when asked ?w=<pixels>
 * (rounded up to 120, 240, 360, 480 or 720), so a grid of covers no longer
 * loads the 1000px ones its cards show. A TMDB poster is asked of TMDB at one
 * of its own widths: half of FilmDex's posters are kept as TMDB's original,
 * up to 2000×3000, and Chrome, short of memory for a grid of them decoded,
 * left some unpainted, grey until a hover. Any other image from elsewhere
 * (Cover Art Archive, Navidrome) is left as it is.
 */

const isStored = (url: string): boolean => url.startsWith('/api/images/') || url.startsWith('/images/');

const TMDB = /^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+(\/.+)$/;
const TMDB_WIDTHS = [92, 154, 185, 342, 500, 780];

/** `url` at `width` pixels when it is a stored image or a TMDB one, else `url` itself. */
export const thumbUrl = (url: string, width: number): string => {
  if (isStored(url)) return `${url}${url.includes('?') ? '&' : '?'}w=${width}`;
  const tmdb = TMDB.exec(url);
  if (tmdb) {
    const w = TMDB_WIDTHS.find(t => t >= width);
    return `${tmdb[1]}${w ? `w${w}` : 'original'}${tmdb[2]}`;
  }
  return url;
};

const isResizable = (url: string): boolean => isStored(url) || TMDB.test(url);

/** The `src` and `srcSet` of an `<img>` showing `url` about `width` pixels wide. */
export const thumbProps = (url: string, width = 240): { src: string; srcSet?: string } =>
  isResizable(url)
    ? { src: thumbUrl(url, width), srcSet: `${thumbUrl(url, width)} 1x, ${thumbUrl(url, width * 2)} 2x` }
    : { src: url };

/** A cover loaded: its waiting sheen stops (`img.cover-img` in shared/cover.css). */
export const coverReady = (event: { currentTarget: HTMLImageElement }): void => {
  event.currentTarget.dataset.ready = '';
};
