/** A mixtape is a playlist of Navidrome kept as an album: its status says so. */
export const MIXTAPE_STATUS = 'playlist';

export const isMixtape = (album: object | null | undefined): boolean => (album as { titleStatus?: unknown } | null | undefined)?.titleStatus === MIXTAPE_STATUS;

/** “Miles Davis, Bach & 6 more”: the artists with most songs come first, as the server keeps them. */
export const mixtapeArtists = (artists: string[] | string | null | undefined): string => {
  const names = Array.isArray(artists) ? artists : artists ? [artists] : [];
  if (names.length === 0) return 'Empty mixtape';
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
};
