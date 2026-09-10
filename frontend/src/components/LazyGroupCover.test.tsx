import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LazyGroupCover from './LazyGroupCover';

vi.mock('../services/musicService', () => ({
  default: { getCoverArt: vi.fn() }
}));

import musicService from '../services/musicService';

const coverFor = (id: string) => ({ front: { url: `https://covers.test/${id}.jpg` } });

beforeEach(() => {
  vi.clearAllMocks();
  (musicService.getCoverArt as any).mockImplementation((id: string) =>
    Promise.resolve(coverFor(id))
  );
});

describe('LazyGroupCover', () => {
  it('shows the cover of the group it was given', async () => {
    render(<LazyGroupCover releases={[{ musicbrainzReleaseId: 'first' }]} title="First" />);

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.test/first.jpg')
    );
  });

  it('replaces the cover when the instance is reused for another group', async () => {
    const { rerender } = render(
      <LazyGroupCover releases={[{ musicbrainzReleaseId: 'first' }]} title="First" />
    );

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.test/first.jpg')
    );

    // The results list is keyed by index, so a new search reuses this instance.
    rerender(<LazyGroupCover releases={[{ musicbrainzReleaseId: 'second' }]} title="Second" />);

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.test/second.jpg')
    );
  });

  it('does not keep showing the old cover while the new one is still loading', async () => {
    const { rerender } = render(
      <LazyGroupCover releases={[{ musicbrainzReleaseId: 'first' }]} title="First" />
    );

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    (musicService.getCoverArt as any).mockImplementation(() => new Promise(() => {}));
    rerender(<LazyGroupCover releases={[{ musicbrainzReleaseId: 'slow' }]} title="Slow" />);

    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  });
});

describe('LazyGroupCover — cover already known', () => {
  it('uses the artwork the release carries instead of fetching one', async () => {
    render(
      <LazyGroupCover
        releases={[{ discogsReleaseId: '1', coverArt: { front: 'https://i.discogs.com/x.jpg' } } as any]}
        title="Drones"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://i.discogs.com/x.jpg')
    );
    // Cover Art Archive is keyed on MusicBrainz ids; it knows nothing here.
    expect(musicService.getCoverArt).not.toHaveBeenCalled();
  });

  it('still fetches when the release carries no artwork', async () => {
    render(<LazyGroupCover releases={[{ musicbrainzReleaseId: 'first' }]} title="First" />);

    await waitFor(() => expect(musicService.getCoverArt).toHaveBeenCalled());
  });
});

describe('LazyGroupCover — front before back', () => {
  it('prefers a front cover further down the group over an earlier back cover', async () => {
    render(
      <LazyGroupCover
        releases={[
          { discogsReleaseId: '1', coverArt: { back: 'https://i.discogs.com/back.jpg' } },
          { discogsReleaseId: '2', coverArt: { front: 'https://i.discogs.com/front.jpg' } }
        ] as any}
        title="Drones"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://i.discogs.com/front.jpg')
    );
  });

  it('falls back to a back cover when the group has no front at all', async () => {
    render(
      <LazyGroupCover
        releases={[{ discogsReleaseId: '1', coverArt: { back: 'https://i.discogs.com/back.jpg' } }] as any}
        title="Drones"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://i.discogs.com/back.jpg')
    );
  });
});
