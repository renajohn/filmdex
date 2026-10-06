import { describe, it, expect, vi, afterEach } from 'vitest';
import { amperfyUrl, listenUrl, openListen, trackListenUrl } from './navidrome';

const album = { id: 'nd-1', url: 'https://music.lab.crog.org/app/#/album/nd-1/show' };

afterEach(() => { vi.restoreAllMocks(); });

describe('navidrome', () => {
  it('asks Amperfy to play the album on an iPhone', () => {
    expect(amperfyUrl('nd 1')).toBe('amperfy://x-callback-url/playID?id=nd%201&libraryElementType=album');
    expect(listenUrl(album, true)).toBe('amperfy://x-callback-url/playID?id=nd-1&libraryElementType=album');
  });

  it('plays a track in Amperfy on an iPhone, and shows it in Navidrome elsewhere', () => {
    const track = { id: 'song 1', url: 'https://music.example/app/#/song?filter=x' };
    expect(trackListenUrl(track, true)).toBe('amperfy://x-callback-url/playID?id=song%201&libraryElementType=song');
    expect(trackListenUrl(track, false)).toBe('https://music.example/app/#/song?filter=x');
    expect(trackListenUrl({ id: null, url: null }, true)).toBeNull();
  });

  it('opens the album in Navidrome elsewhere', () => {
    expect(listenUrl(album, false)).toBe(album.url);
    expect(listenUrl({ id: 'nd-1' }, false)).toBeNull();
  });

  it('opens a new tab on a computer', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openListen(album);
    expect(open).toHaveBeenCalledWith(album.url, '_blank', 'noopener');
  });

  it('sends the tab opened during the click to the album', () => {
    const tab = { location: { href: '' }, close: vi.fn() } as unknown as Window;
    openListen(album, tab);
    expect(tab.location.href).toBe(album.url);
  });
});
