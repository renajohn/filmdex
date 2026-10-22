import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RemoteBar from './RemoteBar';
import RemoteReporter from './RemoteReporter';
import { MemoryRouter } from 'react-router-dom';
import { deviceName, forgetRemotePlayers, targetOf } from '../services/remote';
import { player } from '../services/player';
import { listenNextQueue } from '../services/listenNextQueue';
import { playAlbumById } from '../utils/playAlbum';

vi.mock('../utils/playAlbum', () => ({ playAlbumById: vi.fn(async () => true) }));
vi.mock('../services/listenNextQueue', () => ({ listenNextQueue: { start: vi.fn(async () => true) } }));

const MAC = {
  id: 'mac', name: 'Mac · Chrome', playing: true, online: true, album: { id: 7, title: 'Revolver', artist: 'The Beatles', cover: null },
  track: { title: 'Taxman', disc: 1, no: 1 }, index: 0, count: 14, position: 42, duration: 159, seenAt: Date.now(), startedAt: 1000, error: null, reportedAt: Date.now(),
};
const phone = (path = '/musicdex') => render(<MemoryRouter initialEntries={[path]}><RemoteBar /></MemoryRouter>);
const PC = { ...MAC, id: 'pc', name: 'PC · Edge', album: { id: 8, title: 'Abbey Road', artist: 'The Beatles', cover: null }, track: { title: 'Come Together', disc: 1, no: 1 }, startedAt: 2000 };

const fetched: Array<{ url: string; body?: unknown }> = [];
const answer = (players: unknown[], commands = 204) => vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
  fetched.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (String(url).endsWith('/api/remote/players')) return new Response(JSON.stringify(players), { status: 200 });
  if (String(url).endsWith('/commands') && commands !== 204) return new Response(JSON.stringify({ error: 'That computer does not answer: asleep, or its page closed' }), { status: commands });
  return new Response(null, { status: 204 });
});

beforeEach(() => { fetched.length = 0; forgetRemotePlayers(); });
afterEach(() => vi.restoreAllMocks());

describe('the remote, on a phone', () => {
  it('shows what plays on the computer, and sends it ⏮ ⏯ ⏭', async () => {
    answer([MAC]);
    phone();
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
    phone();
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
    phone();
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

  it('shows the toggle as it was when the computer does not answer, and what went wrong there', async () => {
    answer([{ ...MAC, error: 'needs a click to play' }], 504);
    phone();
    expect(await screen.findByText(/needs a click to play/, undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument(), { timeout: 3000 });
  });

  it('stays out of the films and the books for a computer with no album, not for one playing', async () => {
    answer([{ ...MAC, playing: false, album: null, track: null }]);
    const { container, unmount } = phone('/filmdex');
    await waitFor(() => expect(fetched.length).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    unmount();
    vi.restoreAllMocks();
    forgetRemotePlayers();
    answer([MAC]);
    phone('/bookdex');
    expect(await screen.findByText('Taxman', undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it('is not there when no computer is', async () => {
    answer([]);
    const { container } = phone();
    await waitFor(() => expect(fetched.length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the remote, on a computer', () => {
  let sent: ((event: { data: string }) => void) | null = null;
  let sources = 0;
  let last: { readyState: number; onerror: (() => void) | null } | null = null;
  beforeEach(() => {
    sent = null;
    sources = 0;
    class FakeSource {
      onmessage: ((event: { data: string }) => void) | null = null;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readyState = 1;
      constructor() {
        sources += 1;
        const me = this; // eslint-disable-line @typescript-eslint/no-this-alias
        last = me;
        setTimeout(() => { me.onopen?.(); sent = event => me.onmessage?.(event); }, 0);
      }
      addEventListener() { /* its words of life */ }
      close() { this.readyState = 2; }
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
      sent!({ data: JSON.stringify({ action: 'toggle', id: 'c1' }) });
      sent!({ data: JSON.stringify({ action: 'next' }) });
      sent!({ data: JSON.stringify({ action: 'playAlbum', albumId: 7, index: 3 }) });
      sent!({ data: JSON.stringify({ action: 'listenNext' }) });
    });
    expect(toggle).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    await waitFor(() => expect(playAlbumById).toHaveBeenCalledWith(7, undefined, 3, false, 0));
    expect(listenNextQueue.start).toHaveBeenCalled();
    // Each command said received.
    expect(fetched.some(f => f.url.endsWith('/api/remote/acks/c1'))).toBe(true);
  });

  it('opens its connection again when the server refused it, restarting, and tells what it plays', async () => {
    answer([]);
    render(<RemoteReporter />);
    await waitFor(() => expect(sent).not.toBeNull());
    const reports = () => fetched.filter(f => /\/api\/remote\/players\/[a-z0-9]+$/.test(f.url)).length;
    const before = reports();
    act(() => { last!.readyState = 2; last!.onerror?.(); });
    await waitFor(() => expect(sources).toBe(2), { timeout: 3000 });
    await waitFor(() => expect(reports()).toBeGreaterThan(before));
  });

  it('speaks for its computer from one tab alone, mounted twice as React does', async () => {
    answer([]);
    // Locks as a browser's: one holder at a time, the others waiting in turn; a steal takes it at once.
    const queue: Array<{ grant: () => void }> = [];
    let holder: { release: () => void; reject: (e: Error) => void } | null = null;
    const next = () => { if (!holder && queue.length) queue.shift()!.grant(); };
    const locks = {
      request: (_name: string, options: { steal?: boolean }, callback: () => Promise<void>) => new Promise<void>((resolve, reject) => {
        const grant = () => {
          const held = { release: () => undefined as void, reject };
          holder = held;
          void callback().then(() => { if (holder === held) { holder = null; next(); } resolve(); });
        };
        if (options.steal) { holder?.reject(new Error('AbortError')); holder = null; grant(); } else { queue.push({ grant }); next(); }
      }),
    };
    vi.stubGlobal('navigator', { ...navigator, locks });
    const open = () => sources;
    render(<React.StrictMode><RemoteReporter /></React.StrictMode>);
    render(<React.StrictMode><RemoteReporter /></React.StrictMode>);
    await waitFor(() => expect(open()).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(holder).not.toBeNull();
    expect(queue.length).toBeGreaterThan(0);
  });

  it('names a browser as a person would', () => {
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Mac · Chrome');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15')).toBe('Mac · Safari');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0')).toBe('PC · Edge');
  });
});
