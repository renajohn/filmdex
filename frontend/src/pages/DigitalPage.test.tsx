import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DigitalPage, { forgetDigitalPage, ricardoUrl } from './DigitalPage';
import musicService, { type DigitalAlbum, type DigitalLibrary } from '../services/musicService';
import { playNavidromeAlbum } from '../utils/playAlbum';

vi.mock('../services/musicService', () => ({
  default: {
    getDigitalLibrary: vi.fn(),
    syncDigitalLibrary: vi.fn(),
    getAlbumById: vi.fn(),
    deleteAlbum: vi.fn(),
    setDigitalWished: vi.fn(),
    setDigitalDismissed: vi.fn(),
    getDigitalTracks: vi.fn(),
    getImageUrl: (path: string | null) => path,
    navidromeCoverUrl: (id: string) => `/api/music/navidrome-cover/${id}`,
  },
}));

vi.mock('../components/MusicDetailCard', () => ({
  default: ({ cd, onClose }: { cd: { title: string }; onClose: () => void }) => (
    <div role="dialog">
      {cd.title}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../utils/playAlbum', () => ({ playNavidromeAlbum: vi.fn(() => Promise.resolve(true)) }));

/** The page as the app shows it, at an address of its own. */
const renderPage = (path = '/musicdex/digital') => render(<MemoryRouter initialEntries={[path]}><DigitalPage /></MemoryRouter>);

const digital = (fields: Partial<DigitalAlbum> & { navidromeId: string; name: string }): DigitalAlbum => ({
  artist: 'Moby', songCount: 10, url: `https://music/${fields.navidromeId}`, formats: ['MP3'], quality: 'lossy', bitRate: 192,
  hiRes: false, cd: null, oldCopy: false, wishAlbumId: null, rating: 0, starred: false, favouriteTracks: 0,
  listening: { favourites: 0, needed: 3, plays: 0, lastPlayed: null, score: 0 }, buy: null, dismissed: false,
  ...fields,
});

const LIBRARY: DigitalLibrary = {
  configured: true,
  albums: [
    digital({
      navidromeId: 'nd-mezz', name: 'Mezzanine', artist: 'Massive Attack', formats: ['FLAC'], quality: 'lossless', bitRate: null,
      cd: { id: 7, title: 'Mezzanine', artist: ['Massive Attack'], cover: null, format: 'Enhanced CD', match: 'musicbrainz' },
    }),
    digital({
      navidromeId: 'nd-play', name: 'Play', bitRate: 128,
      listening: { favourites: 4, needed: 3, plays: 9, lastPlayed: '2026-10-12T20:00:00Z', score: 8.9 },
      buy: { listened: true, rated: false, wished: false },
    }),
    digital({ navidromeId: 'nd-18', name: '18', wishAlbumId: 42, buy: { listened: false, rated: false, wished: true } }),
    digital({ navidromeId: 'nd-hot', name: 'Hotel', bitRate: 160 }),
    digital({
      navidromeId: 'nd-bored', name: 'Wait for Me', dismissed: true,
      listening: { favourites: 3, needed: 3, plays: 6, lastPlayed: null, score: 6 },
      buy: { listened: true, rated: false, wished: false },
    }),
  ],
  physicalOnly: [{ id: 9, title: "Cosmo's Factory", artist: ['Creedence Clearwater Revival'], cover: null }],
  oldCopies: [],
};

beforeEach(() => {
  forgetDigitalPage();
  vi.mocked(musicService.getDigitalLibrary).mockResolvedValue(LIBRARY);
  vi.mocked(musicService.syncDigitalLibrary).mockResolvedValue({ editions: [], library: LIBRARY });
});

const titles = () => screen.getAllByRole('listitem').map(item => item.querySelector('.digital-title')?.textContent).filter(Boolean);

describe('DigitalPage', () => {
  it('ouvre sur Buy : les suggestions dans leur encadré, puis la wishlist, sans les albums écartés', async () => {
    renderPage();

    expect(await screen.findByRole('tab', { name: /Buy/, selected: true })).toBeInTheDocument();
    await waitFor(() => expect(titles()).toEqual(['Play', '18']));
    expect(screen.getByText(/4 tracks ×2\+/)).toBeInTheDocument();
    // The suggestions in their own box, so the wish list does not drown them.
    const box = screen.getByRole('region', { name: /Suggested from your listening/ });
    expect(within(box).getByText('Play')).toBeInTheDocument();
    expect(within(box).queryByText('18')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Wishlist 1$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Not interested \(1\)/ })).toBeInTheDocument();
  });

  it('dit combien d’albums de la wishlist sont dans l’encadré des suggestions', async () => {
    const played = { ...LIBRARY.albums[2], listening: { favourites: 3, needed: 3, plays: 6, lastPlayed: null, score: 6 },
      buy: { listened: true, rated: false, wished: true } };
    vi.mocked(musicService.getDigitalLibrary).mockResolvedValue({ ...LIBRARY, albums: LIBRARY.albums.map(a => (a.navidromeId === 'nd-18' ? played : a)) });
    vi.mocked(musicService.syncDigitalLibrary).mockResolvedValue({ editions: [], library: { ...LIBRARY, albums: LIBRARY.albums.map(a => (a.navidromeId === 'nd-18' ? played : a)) } });
    renderPage();

    expect(await screen.findByRole('heading', { name: /Wishlist 0 · 1 more in the suggestions above/ })).toBeInTheDocument();
  });

  it('écarte un album par « Not interested »', async () => {
    vi.mocked(musicService.setDigitalDismissed).mockResolvedValue({ ...LIBRARY.albums[1], dismissed: true });
    renderPage();
    await screen.findByText('Play');

    fireEvent.click(screen.getByRole('button', { name: 'Not interested' }));

    await waitFor(() => expect(titles()).toEqual(['18']));
    expect(musicService.setDigitalDismissed).toHaveBeenCalledWith('nd-play', true);
  });

  it('range le lossy du pire débit au meilleur, et masque les onglets vides', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Lossy/ }));

    expect(titles()).toEqual(['Play', 'Hotel', '18', 'Wait for Me']);
    expect(screen.getByText('MP3 128')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Near-lossless/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Physical only/ })).toBeInTheDocument();
  });

  it('ouvre la fiche du CD quand on clique un album dont on a le CD', async () => {
    vi.mocked(musicService.getAlbumById).mockResolvedValue({ id: 7, title: 'Mezzanine (detail)' });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Lossless/ }));
    // A CD is a CD, whatever its pressing: no "Enhanced CD" nor "Unknown".
    expect(within(screen.getByText('Mezzanine').closest('li')!).getByText('CD')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mezzanine'));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Mezzanine (detail)');
    expect(musicService.getAlbumById).toHaveBeenCalledWith(7);
  });

  it('déplie les pistes d’un album sans CD avec leurs écoutes', async () => {
    vi.mocked(musicService.getDigitalTracks).mockResolvedValue([
      { id: 's1', url: null, discNumber: 1, track: 1, title: 'Honey', durationSec: 190, suffix: 'mp3', bitRate: 128,
        bitDepth: null, samplingRate: 44100, plays: 3, lastPlayed: null, rating: 0, starred: false },
    ]);
    renderPage();

    fireEvent.click(await screen.findByText('Play'));

    expect(await screen.findByText('Honey')).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(musicService.getDigitalTracks).toHaveBeenCalledWith('nd-play');
  });

  it('joue l’album à partir d’une piste dépliée', async () => {
    vi.mocked(musicService.getDigitalTracks).mockResolvedValue([
      { id: 's1', url: null, discNumber: 1, track: 1, title: 'Honey', durationSec: 190, suffix: 'mp3', bitRate: 128,
        bitDepth: null, samplingRate: 44100, plays: 3, lastPlayed: null, rating: 0, starred: false },
      { id: 's2', url: null, discNumber: 1, track: 2, title: 'Find My Baby', durationSec: 160, suffix: 'mp3', bitRate: 128,
        bitDepth: null, samplingRate: 44100, plays: 0, lastPlayed: null, rating: 0, starred: false },
    ]);
    renderPage();

    fireEvent.click(await screen.findByText('Play'));
    fireEvent.click(await screen.findByRole('button', { name: 'Play Find My Baby' }));

    await waitFor(() => expect(playNavidromeAlbum).toHaveBeenCalledWith(expect.objectContaining({ navidromeId: 'nd-play' }), 's2', '/musicdex/digital?tab=buy&album=nd-play'));
  });

  it('met un album sans CD dans la wishlist depuis l’onglet No CD', async () => {
    vi.mocked(musicService.setDigitalWished).mockResolvedValue({ ...LIBRARY.albums[3], wishAlbumId: 99 });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /No CD/ }));

    const hotel = screen.getByText('Hotel').closest('li')!;
    const toggle = within(hotel).getByRole('checkbox', { name: 'Wishlist' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(within(hotel).getByRole('checkbox', { name: 'Wishlist' })).toBeChecked());
    expect(musicService.setDigitalWished).toHaveBeenCalledWith('nd-hot', true);
  });

  it('joue un album dans DexVault depuis ▶, Navidrome restant à côté', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Play Play' }));
    await waitFor(() => expect(playNavidromeAlbum).toHaveBeenCalledWith(expect.objectContaining({ navidromeId: 'nd-play' }), undefined, '/musicdex/digital?tab=buy&album=nd-play'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Play in Navidrome' }));
    expect(open).toHaveBeenCalledWith('https://music/nd-play', '_blank', 'noopener');
    open.mockRestore();
  });

  it('ramène à l’album lancé depuis la barre : son onglet, déplié', async () => {
    vi.mocked(musicService.getDigitalTracks).mockResolvedValue([
      { id: 's1', url: null, discNumber: 1, track: 1, title: 'Lobby Song', durationSec: 190, suffix: 'mp3', bitRate: 160,
        bitDepth: null, samplingRate: 44100, plays: 0, lastPlayed: null, rating: 0, starred: false },
    ]);
    renderPage('/musicdex/digital?tab=nocd&album=nd-hot');

    expect(await screen.findByText('Lobby Song')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /No CD/ })).toHaveAttribute('aria-selected', 'true');
    expect(musicService.getDigitalTracks).toHaveBeenCalledWith('nd-hot');
  });

  it('ramène dans No CD un album lancé depuis Buy et retiré de la wishlist depuis', async () => {
    vi.mocked(musicService.getDigitalTracks).mockResolvedValue([
      { id: 's1', url: null, discNumber: 1, track: 1, title: 'Lobby Song', durationSec: 190, suffix: 'mp3', bitRate: 160,
        bitDepth: null, samplingRate: 44100, plays: 0, lastPlayed: null, rating: 0, starred: false },
    ]);
    renderPage('/musicdex/digital?tab=buy&album=nd-hot');

    expect(await screen.findByText('Lobby Song')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /No CD/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('se montre aussitôt au retour, à jour en arrière-plan, sans tout resynchroniser', async () => {
    vi.mocked(musicService.syncDigitalLibrary).mockClear();
    const { unmount } = renderPage();
    expect(await screen.findByText('Play')).toBeInTheDocument();
    await waitFor(() => expect(musicService.syncDigitalLibrary).toHaveBeenCalledTimes(1));
    unmount();

    // Coming back: Navidrome takes its time, the page does not wait for it.
    vi.mocked(musicService.getDigitalLibrary).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Play')).toBeInTheDocument();
    expect(musicService.syncDigitalLibrary).toHaveBeenCalledTimes(1);
  });

  it('se montre aussitôt après un rechargement, depuis ce que le navigateur a gardé', async () => {
    const stored = new Map([['dexvault.digital', JSON.stringify({ library: LIBRARY, syncedAt: Date.now() })]]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
    });
    vi.mocked(musicService.getDigitalLibrary).mockReturnValue(new Promise(() => {}));
    vi.mocked(musicService.syncDigitalLibrary).mockClear();
    // A reload: the page's module is read anew.
    vi.resetModules();
    const { default: Reloaded } = await import('./DigitalPage');
    render(<MemoryRouter initialEntries={['/musicdex/digital']}><Reloaded /></MemoryRouter>);

    expect(screen.getByText('Play')).toBeInTheDocument();
    const { default: reloadedService } = await import('../services/musicService');
    expect(reloadedService.syncDigitalLibrary).not.toHaveBeenCalled();
  });

  it('dit quels autres comptes Navidrome sont comptés, et quand le plugin ne fait plus son rapport', async () => {
    const library = { ...LIBRARY, plugin: { accounts: ['violaine'], lastReportAt: 1792234449, stale: true } };
    vi.mocked(musicService.getDigitalLibrary).mockResolvedValue(library);
    vi.mocked(musicService.syncDigitalLibrary).mockResolvedValue({ editions: [], library });
    renderPage();

    expect(await screen.findByText(/plays and likes of violaine counted too/)).toBeInTheDocument();
    expect(screen.getByText(/plugin in Navidrome has not reported for over three hours/)).toBeInTheDocument();
  });

  it('cherche le CD sur Ricardo sans ce que le titre digital ajoute', () => {
    expect(ricardoUrl({ artist: 'Pink Floyd', name: 'Relics (Remastered) [Disc 1]' }))
      .toBe('https://www.ricardo.ch/fr/s/Pink%20Floyd%20Relics/');
  });
});
