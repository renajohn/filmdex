import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MusicThumbnail from './MusicThumbnail';
import NextBanner from './shared/NextBanner';
import { ListenNextSwitch, OtherListName, askStars } from './ListenNextLists';
import { ToastHost } from './shared/Toast';
import musicService from '../services/musicService';

vi.mock('../services/musicService', () => ({
  default: {
    toggleListenNext: vi.fn(async () => ({})),
    setAlbumRating: vi.fn(async () => ({ userRating: 4, navidrome: 'synced' })),
    getImageUrl: (path?: string | null) => path || null,
  },
}));

const CD = { id: 7, title: 'Aja', artist: ['Steely Dan'], cover: null, titleStatus: 'owned', fileQuality: 'lossless' };

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('the grid’s button for Listen Next', () => {
  const button = () => screen.getByRole('button', { name: /Listen Next/ });

  it('streams a ripped CD next on a click, plays the CD next on an Alt-click', async () => {
    render(<MusicThumbnail cd={CD} onClick={() => undefined} isInListenNext={false} />);
    expect(button()).toHaveAttribute('title', 'Stream it next · Alt-click: play the CD next');
    fireEvent.click(button());
    await waitFor(() => expect(musicService.toggleListenNext).toHaveBeenCalledWith(7, undefined, 'digital'));
    fireEvent.click(button(), { altKey: true });
    await waitFor(() => expect(musicService.toggleListenNext).toHaveBeenLastCalledWith(7, undefined, 'cd'));
  });

  it('plays a CD not ripped next on a click, and takes an album in a list out', async () => {
    const { rerender } = render(<MusicThumbnail cd={{ ...CD, fileQuality: 'none' }} onClick={() => undefined} isInListenNext={false} />);
    expect(button()).toHaveAttribute('title', 'Play the CD next');
    fireEvent.click(button());
    await waitFor(() => expect(musicService.toggleListenNext).toHaveBeenCalledWith(7, undefined, 'cd'));
    rerender(<MusicThumbnail cd={CD} onClick={() => undefined} isInListenNext listenNextMedium="cd" listenNextTitle="Next, on CD · click: off the list" />);
    fireEvent.click(button());
    await waitFor(() => expect(musicService.toggleListenNext).toHaveBeenLastCalledWith(7));
  });

  it('moves a streamed album to the CD list on an Alt-click, and never a digital album there', async () => {
    const { rerender } = render(<MusicThumbnail cd={CD} onClick={() => undefined} isInListenNext listenNextMedium="digital" />);
    fireEvent.click(button(), { altKey: true });
    await waitFor(() => expect(musicService.toggleListenNext).toHaveBeenCalledWith(7, undefined, 'cd'));
    rerender(<MusicThumbnail cd={{ ...CD, titleStatus: 'digital' }} onClick={() => undefined} isInListenNext={false} />);
    expect(button()).toHaveAttribute('title', 'Stream it next');
    fireEvent.click(button(), { altKey: true });
    await waitFor(() => expect(musicService.toggleListenNext).toHaveBeenLastCalledWith(7, undefined, 'digital'));
  });
});

describe('Listen Next’s two lists', () => {
  it('names them Digital | CD with their lengths, and switches', () => {
    const onChange = vi.fn();
    render(<NextBanner items={[]} alwaysShow headerControls={<ListenNextSwitch medium="digital" counts={{ digital: 3, cd: 28 }} onChange={onChange} />} />);
    const [digital, cd] = screen.getAllByRole('radio');
    expect(digital).toHaveTextContent('Digital3');
    expect(cd).toHaveTextContent('CD28');
    fireEvent.click(cd);
    expect(onChange).toHaveBeenCalledWith('cd');
  });

  it('shows the other list small at the foot: its name opens it, a cover shows it there', () => {
    const onOpen = vi.fn();
    const onShow = vi.fn();
    const albums = [1, 2, 3, 4].map(id => ({ id, title: `Album ${id}`, artist: 'Someone', cover: null }));
    render(<NextBanner items={[]} alwaysShow getKey={album => `${album.id}:0`} other={{
      items: albums, dropId: 'cd', most: 3, onShow, onOpen, dropHint: 'Drop here',
      head: <OtherListName medium="cd" count={4} onOpen={onOpen} />,
      titleOf: album => `Someone – ${album.title}`,
    }} />);
    fireEvent.click(screen.getByTitle('Someone – Album 2'));
    expect(onShow).toHaveBeenCalledWith('2:0');
    // Three fit: two covers, and +2 in the third one's place.
    expect(screen.queryByTitle('Someone – Album 3')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+2' }));
    fireEvent.click(screen.getByRole('button', { name: /CD · 4/ }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('asks the stars of a CD played, keeps them, and puts it back on Undo', async () => {
    const onUndo = vi.fn();
    render(<ToastHost />);
    askStars({ id: 7, title: 'Aja' }, onUndo);
    expect(await screen.findByText('Rate it')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
    await waitFor(() => expect(musicService.setAlbumRating).toHaveBeenCalledWith(7, expect.any(Number)));
    expect(screen.getByText(/★ kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
  });
});
