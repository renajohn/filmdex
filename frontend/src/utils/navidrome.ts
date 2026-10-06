/**
 * Listening to a CD of the collection once it is ripped: on a computer, its
 * album opens in Navidrome's web player, in a tab of its own; on an iPhone or
 * an iPad, Amperfy plays it. Amperfy's callback URL has no "show album"
 * action, only "play", so it starts the album rather than opening its page.
 */
export interface NavidromeAlbumLink {
  id: string;
  url?: string;
}

/** iPhone, iPad, and an iPad that says it is a Mac (iPadOS asks for desktop sites). */
export const isAppleMobile = (): boolean => {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

export const amperfyUrl = (id: string, type: 'album' | 'song' = 'album'): string =>
  `amperfy://x-callback-url/playID?id=${encodeURIComponent(id)}&libraryElementType=${type}`;

/** A track: Amperfy plays it on an iPhone, Navidrome shows it elsewhere. */
export const trackListenUrl = (
  track: { id?: string | null; url?: string | null },
  appleMobile: boolean = isAppleMobile(),
): string | null => (appleMobile ? (track.id ? amperfyUrl(track.id, 'song') : null) : track.url || null);

export const listenUrl = (album: NavidromeAlbumLink, appleMobile: boolean = isAppleMobile()): string | null =>
  appleMobile ? amperfyUrl(album.id) : album.url || null;

/**
 * Opens the album. `tab` is a window opened beforehand, during the click, for
 * when the album had to be looked up first: a tab opened after an await is
 * one the browser blocks as a pop-up.
 */
export const openListen = (album: NavidromeAlbumLink, tab?: Window | null): void => {
  const appleMobile = isAppleMobile();
  const url = listenUrl(album, appleMobile);
  if (!url) {
    tab?.close();
    return;
  }
  if (appleMobile) {
    tab?.close();
    window.location.href = url;
  } else if (tab) {
    tab.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener');
  }
};
