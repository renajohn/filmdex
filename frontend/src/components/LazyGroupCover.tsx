import React, { useEffect, useState } from 'react';
import { BsSearch } from 'react-icons/bs';
import musicService from '../services/musicService';

interface MusicRelease {
  musicbrainzReleaseId?: string;
  musicbrainzReleaseGroupId?: string;
  id?: string;
  [key: string]: any;
}

interface LazyGroupCoverProps {
  releases: MusicRelease[];
  title: string;
}

const groupKey = (releases: MusicRelease[]): string =>
  (releases || []).map((r) => r?.musicbrainzReleaseId || r?.discogsReleaseId || r?.id || '').join('|');

/** A cover a result carries: Discogs's as a plain address, a barcode search's as Cover Art Archive's record. */
const imageOf = (cover: unknown): string | null => {
  if (typeof cover === 'string') return cover || null;
  const record = cover as { url?: string; thumbnails?: Record<string, string> } | null | undefined;
  return record?.thumbnails?.['500'] || record?.thumbnails?.['250'] || record?.url || null;
};

/**
 * One cover per result group, fetched after render: the artwork a result
 * carries, else Cover Art Archive's for its release group and Deezer's, asked
 * at once by the server. The first image that loads is shown, the next tried
 * when one does not: archive.org, which keeps Cover Art Archive's images, at
 * times fails.
 *
 * The cover is keyed on the group's release ids rather than remembered forever:
 * the dialog reuses these instances across searches (the list is keyed by index),
 * so a sticky "already loaded" flag used to show the previous search's artwork.
 */
const LazyGroupCover: React.FC<LazyGroupCoverProps> = ({ releases, title }) => {
  const [urls, setUrls] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const key = groupKey(releases);

  useEffect(() => {
    let cancelled = false;

    // Drop the previous group's artwork immediately, so a slow fetch never
    // leaves the wrong cover on screen.
    setUrls([]);
    setShown(0);

    const load = async () => {
      if (!releases || releases.length === 0) return;

      // A front across the whole group before settling for a back cover.
      const carried = [
        ...releases.map(r => imageOf(r?.coverArt?.front)),
        ...releases.map(r => imageOf(r?.coverArt?.back)),
      ].filter((url): url is string => Boolean(url));
      if (carried.length > 0) {
        setUrls([...new Set(carried)]);
        return;
      }

      const first = releases[0];
      const artist = Array.isArray(first?.artist) ? first.artist[0] || '' : first?.artist || '';
      const groupId = releases.find(r => r?.musicbrainzReleaseGroupId)?.musicbrainzReleaseGroupId || null;
      if (!groupId && !artist) return;
      const found = await musicService.getSearchCovers(groupId, artist, title);
      if (!cancelled) setUrls(found);
    };

    // Slight delay to prioritize UI thread
    const t = setTimeout(load, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const url = urls[shown];
  if (!url) {
    return (
      <div className="group-cover group-cover-placeholder">
        <BsSearch size={32} />
      </div>
    );
  }

  return (
    <img
      key={url}
      src={url}
      alt={`${title} cover`}
      className="group-cover"
      loading="lazy"
      onError={() => setShown(index => index + 1)}
    />
  );
};

export default LazyGroupCover;
