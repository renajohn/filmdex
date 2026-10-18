import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LazyGroupCover from './LazyGroupCover';

vi.mock('../services/musicService', () => ({
  default: { getSearchCovers: vi.fn() }
}));

import musicService from '../services/musicService';

const release = (id: string) => ({ musicbrainzReleaseId: id, musicbrainzReleaseGroupId: `rg-${id}`, artist: ['Adele'] });

beforeEach(() => {
  vi.clearAllMocks();
  (musicService.getSearchCovers as any).mockImplementation((groupId: string) =>
    Promise.resolve([`https://covers.test/${groupId}.jpg`])
  );
});

describe('LazyGroupCover', () => {
  it('asks the covers of the group by its release group, artist and title, and shows the first', async () => {
    render(<LazyGroupCover releases={[release('first')]} title="21" />);

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.test/rg-first.jpg')
    );
    expect(musicService.getSearchCovers).toHaveBeenCalledWith('rg-first', 'Adele', '21');
  });

  it('tries the next cover when one does not load, and shows none once all have failed', async () => {
    (musicService.getSearchCovers as any).mockResolvedValue(['https://caa.test/down.jpg', 'https://deezer.test/21.jpg']);
    render(<LazyGroupCover releases={[release('first')]} title="21" />);

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'https://caa.test/down.jpg'));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://deezer.test/21.jpg');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('replaces the cover when the instance is reused for another group', async () => {
    const { rerender } = render(<LazyGroupCover releases={[release('first')]} title="First" />);

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.test/rg-first.jpg')
    );

    // The results list is keyed by index, so a new search reuses this instance.
    rerender(<LazyGroupCover releases={[release('second')]} title="Second" />);

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.test/rg-second.jpg')
    );
  });

  it('does not keep showing the old cover while the new one is still loading', async () => {
    const { rerender } = render(<LazyGroupCover releases={[release('first')]} title="First" />);

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    (musicService.getSearchCovers as any).mockImplementation(() => new Promise(() => {}));
    rerender(<LazyGroupCover releases={[release('slow')]} title="Slow" />);

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
    expect(musicService.getSearchCovers).not.toHaveBeenCalled();
  });

  it('reads the Cover Art Archive record a barcode search carries', async () => {
    render(
      <LazyGroupCover
        releases={[{ musicbrainzReleaseId: 'b', coverArt: { front: { url: 'https://caa.test/1200.jpg', thumbnails: { '500': 'https://caa.test/500.jpg' } } } } as any]}
        title="21"
      />
    );

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'https://caa.test/500.jpg'));
  });

  it('still fetches when the release carries no artwork', async () => {
    render(<LazyGroupCover releases={[{ ...release('first'), coverArt: { front: null, back: null } }]} title="First" />);

    await waitFor(() => expect(musicService.getSearchCovers).toHaveBeenCalled());
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
