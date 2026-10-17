import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LyricsPanel, { lineAt, parseLrc, withinLines } from './LyricsPanel';
import musicService from '../services/musicService';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  time: 0,
}));

vi.mock('../services/musicService', () => ({ default: { getLyrics: vi.fn() } }));
vi.mock('../services/player', () => ({
  usePlayer: (select: (state: Record<string, unknown>) => unknown) => select(mocks.state),
  player: {
    currentTime: () => mocks.time,
    seek: vi.fn(),
    toggle: vi.fn(),
    showLyrics: vi.fn(),
    getState: () => mocks.state,
  },
}));

import { player } from '../services/player';

const SYNCED = '[00:05.15] There\'s a fire starting in my heart\n[00:09.74] Reaching a fever pitch\n[00:14.24] Finally I can see you crystal clear';

const playing = (changes: Record<string, unknown> = {}) => {
  mocks.state = {
    lyricsOpen: true, barShown: true, playing: true, index: 0,
    album: { id: 25, title: '21', artist: 'Adele', cover: '/api/images/cd/21.jpg' },
    tracks: [{ songId: 's1', title: 'Rolling in the Deep', disc: 1, no: 1, durationSec: 229 }],
    ...changes,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.time = 0;
  playing();
});

describe('parseLrc', () => {
  it('reads the timed lines in order, a line sung twice at both its times', () => {
    expect(parseLrc('[ar:Adele]\n[00:02.00] One\n[00:01.00][00:03.50] Two')).toEqual([
      { at: 1, text: 'Two' }, { at: 2, text: 'One' }, { at: 3.5, text: 'Two' },
    ]);
  });

  it('marks the silences of the voice: before the first words, at an empty line, in a long gap', () => {
    const lines = parseLrc('[00:10.00] First\n[00:12.00]\n[00:20.00] Second\n[00:21.00] Third\n[00:40.00] Fourth');
    expect(lines).toEqual([
      { at: 0, text: null },
      { at: 10, text: 'First' },
      { at: 12, text: null },
      { at: 20, text: 'Second' },
      { at: 21, text: 'Third' },
      { at: 27, text: null },
      { at: 40, text: 'Fourth' },
    ]);
  });
});

describe('lineAt', () => {
  it('is the last line to have started, -1 before the first', () => {
    const lines = parseLrc('[00:01.00] a\n[00:03.00] b');
    expect(lineAt(lines, 0.5)).toBe(-1);
    expect(lineAt(lines, 1)).toBe(0);
    expect(lineAt(lines, 10)).toBe(1);
  });
});

describe('withinLines', () => {
  it('moves by hand no higher than the first line, no lower than the last, where the line sung stands', () => {
    // The line sung stands 100px down; the lines run from 0 to 900px.
    expect(withinLines(50, 100, 0, 900)).toBe(50);
    expect(withinLines(400, 100, 0, 900)).toBe(100);
    expect(withinLines(-2000, 100, 0, 900)).toBe(-800);
  });
});

describe('LyricsPanel', () => {
  it('shows the words of the track playing, the line sung lit', async () => {
    vi.mocked(musicService.getLyrics).mockResolvedValue({ status: 'found', plain: null, synced: SYNCED, source: 'lrclib', checkedAt: '' });
    mocks.time = 10;
    render(<LyricsPanel />);

    expect(screen.getByRole('complementary', { name: 'Lyrics' })).toBeInTheDocument();
    expect(musicService.getLyrics).toHaveBeenCalledWith(25, 1, 1);
    const line = await screen.findByText('Reaching a fever pitch');
    await waitFor(() => expect(line).toHaveAttribute('aria-current', 'true'));
  });

  it('plays from a line clicked', async () => {
    vi.mocked(musicService.getLyrics).mockResolvedValue({ status: 'found', plain: null, synced: SYNCED, source: 'lrclib', checkedAt: '' });
    playing({ playing: false });
    render(<LyricsPanel />);

    fireEvent.click(await screen.findByText('Finally I can see you crystal clear'));
    expect(player.seek).toHaveBeenCalledWith(expect.closeTo(14.19, 2));
    expect(player.toggle).toHaveBeenCalledWith(true);
  });

  it('reads words without times as a page', async () => {
    vi.mocked(musicService.getLyrics).mockResolvedValue({ status: 'found', plain: 'Line one\nLine two', synced: null, source: 'lrclib', checkedAt: '' });
    render(<LyricsPanel />);

    expect(await screen.findByText('Not timed')).toBeInTheDocument();
    expect(screen.getByText('Line two')).toBeInTheDocument();
  });

  it('says when a track has no words, or is an instrumental', async () => {
    vi.mocked(musicService.getLyrics).mockResolvedValue({ status: 'missing', plain: null, synced: null, source: null, checkedAt: '' });
    const { unmount } = render(<LyricsPanel />);
    expect(await screen.findByText('No words found for this track.')).toBeInTheDocument();
    unmount();

    vi.mocked(musicService.getLyrics).mockResolvedValue({ status: 'instrumental', plain: null, synced: null, source: 'lrclib', checkedAt: '' });
    render(<LyricsPanel />);
    expect(await screen.findByText('An instrumental: no words to sing.')).toBeInTheDocument();
  });

  it('closes from its ✕', async () => {
    vi.mocked(musicService.getLyrics).mockResolvedValue({ status: 'missing', plain: null, synced: null, source: null, checkedAt: '' });
    render(<LyricsPanel />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close lyrics' })); });
    expect(player.showLyrics).toHaveBeenCalledWith(false);
  });

  it('stays away when closed, with no bar out, or for an album DexVault does not hold', () => {
    playing({ lyricsOpen: false });
    const { rerender } = render(<LyricsPanel />);
    expect(screen.queryByRole('complementary', { name: 'Lyrics' })).toBeNull();

    playing({ barShown: false });
    rerender(<LyricsPanel />);
    expect(screen.queryByRole('complementary', { name: 'Lyrics' })).toBeNull();

    playing({ album: { id: null, title: 'X', artist: 'Y', cover: null } });
    rerender(<LyricsPanel />);
    expect(screen.queryByRole('complementary', { name: 'Lyrics' })).toBeNull();
    expect(musicService.getLyrics).not.toHaveBeenCalled();
  });
});
