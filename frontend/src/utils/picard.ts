/**
 * MusicBrainz Picard listens on the Mac it runs on, like it does for the
 * "Tagger" button of musicbrainz.org: asking it to open a release loads that
 * edition, ready for the ripped files. The request goes through a small
 * window rather than fetch, which the browser would hold back as a request
 * from a website to the local machine; the window closes once Picard has it.
 */
export const PICARD_PORT = 8000;

export const picardUrl = (releaseId: string, now: number = Date.now()): string =>
  `http://127.0.0.1:${PICARD_PORT}/openalbum?id=${encodeURIComponent(releaseId)}&t=${now}`;

export const openInPicard = (releaseId: string): void => {
  const popup = window.open(picardUrl(releaseId), 'picard', 'width=320,height=120');
  window.setTimeout(() => popup?.close(), 1500);
};

/** Picard runs on a computer: no button on a phone or a tablet. */
export const canUsePicard = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
