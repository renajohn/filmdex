import React, { useEffect, useState } from 'react';
import { BsSearch } from 'react-icons/bs';
import musicService from '../services/musicService';

interface MusicRelease {
  musicbrainzReleaseId?: string;
  id?: string;
  [key: string]: any;
}

interface CoverArtMeta {
  front?: {
    thumbnails?: Record<string, string>;
    url?: string;
  };
  back?: {
    thumbnails?: Record<string, string>;
    url?: string;
  };
}

interface LazyGroupCoverProps {
  releases: MusicRelease[];
  title: string;
}

const groupKey = (releases: MusicRelease[]): string =>
  (releases || []).map((r) => r?.musicbrainzReleaseId || r?.id || '').join('|');

/**
 * Fetches one front cover per result group, after render.
 *
 * The cover is keyed on the group's release ids rather than remembered forever:
 * the dialog reuses these instances across searches (the list is keyed by index),
 * so a sticky "already loaded" flag used to show the previous search's artwork.
 */
const LazyGroupCover: React.FC<LazyGroupCoverProps> = ({ releases, title }) => {
  const [url, setUrl] = useState<string | null>(null);
  const key = groupKey(releases);

  useEffect(() => {
    let cancelled = false;

    // Drop the previous group's artwork immediately, so a slow fetch never
    // leaves the wrong cover on screen.
    setUrl(null);

    const load = async () => {
      if (!releases || releases.length === 0) return;

      // Discogs results already carry their artwork; Cover Art Archive is keyed
      // on MusicBrainz ids and would have nothing to say about them.
      const embedded = releases.find(r => r?.coverArt?.front || r?.coverArt?.back);
      if (embedded) {
        setUrl(embedded.coverArt.front || embedded.coverArt.back);
        return;
      }
      // Try up to 5 releases in the group to find any cover (prefer front, fallback to back)
      const maxToTry = Math.min(5, releases.length);
      for (let i = 0; i < maxToTry; i++) {
        const rel = releases[i];
        const releaseId = rel?.musicbrainzReleaseId || rel?.id;
        if (!releaseId) continue;
        const meta = (await musicService.getCoverArt(releaseId)) as CoverArtMeta;
        if (cancelled) return;
        const front = meta?.front;
        const back = meta?.back;
        const candidate =
          (front?.thumbnails?.['500'] || front?.thumbnails?.['250'] || front?.url) ||
          (back?.thumbnails?.['500'] || back?.thumbnails?.['250'] || back?.url) ||
          null;
        if (candidate) {
          setUrl(candidate);
          break;
        }
      }
    };

    // Slight delay to prioritize UI thread
    const t = setTimeout(load, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!url) {
    return (
      <div className="group-cover group-cover-placeholder">
        <BsSearch size={32} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={`${title} cover`}
      className="group-cover"
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};

export default LazyGroupCover;
