import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RemoteBar from './RemoteBar';
import RemoteReporter from './RemoteReporter';
import { deviceName, targetOf } from '../services/remote';
import { player } from '../services/player';
import { listenNextQueue } from '../services/listenNextQueue';
import { playAlbumById } from '../utils/playAlbum';

vi.mock('../utils/playAlbum', () => ({ playAlbumById: vi.fn(async () => true) }));
vi.mock('../services/listenNextQueue', () => ({ listenNextQueue: { start: vi.fn(async () => true) } }));

const MAC = {
  id: 'mac', name: 'Mac · Chrome', playing: true, online: true, album: { id: 7, title: 'Revolver', artist: 'The Beatles', cover: null },
  track: { title: 'Taxman', disc: 1, no: 1 }, index: 0, count: 14, position: 42, duration: 159, seenAt: Date.now(), startedAt: 1000,
};
const PC = { ...MAC, id: 'pc', name: 'PC · Edge', album: { id: 8, title: 'Abbey Road', artist: 'The Beatles', cover: null }, track: { title: 'Come Together', disc: 1, no: 1 }, startedAt: 2000 };

const fetched: Array<{ url: string; body?: unknown }> = [];
const answer = (players: unknown[]) => vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
  fetched.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
  return new Response(String(url).endsWith('/api/remote/players') ? JSON.stringify(players) : null, { status: String(url).endsWith('/api/remote/players') ? 200 : 204 });
});

beforeEach(() => { fetched.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('the remote, on a phone', () => {
  it('shows what plays on the computer, and sends it ⏮ ⏯ ⏭', async () => {
    answer([MAC]);
    render(<RemoteBar />);
    expect(await screen.findByText('Taxman', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/Mac · Chrome/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(fetched.filter(f => f.url.endsWith('/commands')).map(f => f.body)).toEqual([{ action: 'toggle' }, { action: 'next' }]), { timeout: 3000 });
    // A pause sent shows at once.
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('offers Listen Next on a computer playing nothing, and is away with no player', async () => {
    answer([{ ...MAC, playing: false, album: null, track: null }]);
    render(<RemoteBar />);
    fireEvent.click(await screen.findByRole('button', { name: /Listen Next/ }));
    await waitFor(() => expect(fetched.some(f => f.url.endsWith('/mac/commands') && (f.body as { action: string }).action === 'listenNext')).toBe(true));
  });

  it('speaks to the last one started of two playing, to the one chosen while it is there', () => {
    expect(targetOf([MAC, PC])?.id).toBe('pc');
    expect(targetOf([MAC, PC], 'mac')?.id).toBe('mac');
    expect(targetOf([MAC, { ...PC, online: false, playing: false }], 'pc')?.id).toBe('mac');
    expect(targetOf([{ ...MAC, playing: false }, { ...PC, playing: false }])?.id).toBe('mac');
  });

  it('chooses its computer from its name, and names it', async () => {
    answer([MAC, PC]);
    render(<RemoteBar />);
    expect(await screen.findByText('Come Together', undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PC · Edge/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Mac · Chrome/ }));
    expect(await screen.findByText('Taxman')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mac · Chrome/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Rename/ }));
    const field = await screen.findByRole('textbox', { name: 'Its name' });
    fireEvent.change(field, { target: { value: 'MacBook du salon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(fetched.find(f => f.url.endsWith('/mac/name'))?.body).toEqual({ name: 'MacBook du salon' }));
  });

  it('is not there when no computer is', async () => {
    answer([]);
    const { container } = render(<RemoteBar />);
    await waitFor(() => expect(fetched.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the remote, on a computer', () => {
  let sent: ((event: { data: string }) => void) | null = null;
  beforeEach(() => {
    sent = null;
    class FakeSource {
      onmessage: ((event: { data: string }) => void) | null = null;
      constructor() { setTimeout(() => { sent = event => this.onmessage?.(event); }, 0); }
      close() { /* closed */ }
    }
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does what the remote sends it, and says what it plays', async () => {
    answer([]);
    const toggle = vi.spyOn(player, 'toggle').mockImplementation(() => undefined);
    const next = vi.spyOn(player, 'next').mockImplementation(() => undefined);
    render(<RemoteReporter />);
    await waitFor(() => expect(sent).not.toBeNull());
    await waitFor(() => expect(fetched.some(f => f.url.includes('/api/remote/players/') && (f.body as { name?: string })?.name)).toBe(true));

    await act(async () => {
      sent!({ data: JSON.stringify({ action: 'toggle' }) });
      sent!({ data: JSON.stringify({ action: 'next' }) });
      sent!({ data: JSON.stringify({ action: 'playAlbum', albumId: 7, index: 3 }) });
      sent!({ data: JSON.stringify({ action: 'listenNext' }) });
    });
    expect(toggle).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    await waitFor(() => expect(playAlbumById).toHaveBeenCalledWith(7, undefined, 3, false, 0));
    expect(listenNextQueue.start).toHaveBeenCalled();
  });

  it('names a browser as a person would', () => {
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Mac · Chrome');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15')).toBe('Mac · Safari');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0')).toBe('PC · Edge');
  });
});
