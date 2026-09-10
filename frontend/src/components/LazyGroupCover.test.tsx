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
