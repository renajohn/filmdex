import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlbumFinder from './AlbumFinder';
import Dialog from './shared/Dialog';
import albumFinderService, { CdEdition, FinderAlbum } from '../services/albumFinderService';
import musicService from '../services/musicService';

vi.mock('../services/albumFinderService', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/albumFinderService')>()),
  default: { search: vi.fn(), discography: vi.fn(), editions: vi.fn(), addAlbum: vi.fn() },
}));
vi.mock('../services/musicService', () => ({ default: { deleteAlbum: vi.fn() } }));

const album = (title: string, fields: Partial<FinderAlbum> = {}): FinderAlbum => ({
  source: 'itunes', sourceId: title, title, artist: 'Muse', artistId: '10', year: '2003', tracks: 12,
  cover: `https://is1-ssl.mzstatic.com/${title}/600x600bb.jpg`, editions: 1, have: null, ...fields,
});

const edition = (id: string, fields: Partial<CdEdition> = {}): CdEdition => ({
  id, date: '2003-09-15', country: 'XE', barcode: null, labels: ['Taste Media'], catalogNumbers: [], packaging: null,
  disambiguation: null, status: 'Official', formats: ['CD'], discs: 1, front: false, ...fields,
});

const MUSE = { source: 'itunes' as const, id: '10', name: 'Muse', genre: 'Alternative', covers: ['https://is1-ssl.mzstatic.com/a/600x600bb.jpg'], albums: 2 };

const open = (mode: 'wish' | 'cd', props: Record<string, unknown> = {}) => {
  const handlers = { onHead: vi.fn(), onChanged: vi.fn(), onAddRelease: vi.fn().mockResolvedValue(undefined), onClose: vi.fn() };
  render(<Dialog show onClose={() => undefined} title="Add"><AlbumFinder mode={mode} {...handlers} {...props} /></Dialog>);
  return handlers;
};

const type = (words: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: /search for an album/i }), { target: { value: words } });

beforeEach(() => {
  vi.mocked(albumFinderService.search).mockReset().mockResolvedValue({
    albums: [album('Absolution', { have: { status: 'owned', id: 3 } }), album('Drones')], artists: [MUSE], source: 'itunes',
  });
  vi.mocked(albumFinderService.addAlbum).mockReset().mockResolvedValue({ id: 42, title: 'Drones' });
  vi.mocked(albumFinderService.discography).mockReset().mockResolvedValue([album('Showbiz', { year: '1999' }), album('Drones', { year: '2015' })]);
  vi.mocked(albumFinderService.editions).mockReset().mockResolvedValue({
    releaseGroup: { id: 'rg-1', title: 'Drones', artist: 'Muse', firstReleaseDate: '2015' },
    editions: [
      edition('eu', { barcode: '825646098406', catalogNumbers: ['0825646098406'], packaging: 'Jewel Case' }),
      edition('jp', { country: 'JP', catalogNumbers: ['WPCR-16575'], disambiguation: 'bonus track', packaging: 'Digipak' }),
    ],
  });
  vi.mocked(musicService.deleteAlbum).mockReset().mockResolvedValue({});
});

describe('AlbumFinder', () => {
  it('trouve les albums pendant la frappe, et l’artiste nommé en pastille', async () => {
    open('wish');
    type('muse');

    expect(await screen.findByText('Drones')).toBeInTheDocument();
    expect(albumFinderService.search).toHaveBeenCalledWith('muse', expect.anything());
    expect(screen.getByTitle('All the albums of Muse')).toBeInTheDocument();
    expect(screen.getByText('Owned')).toBeInTheDocument();
  });

  it('sur la wish list, un clic ajoute l’album, la fenêtre restant ouverte, et un second le retire', async () => {
    const { onChanged, onClose } = open('wish');
    type('muse');

    fireEvent.click(await screen.findByText('Drones'));
    await waitFor(() => expect(albumFinderService.addAlbum).toHaveBeenCalledWith(expect.objectContaining({ title: 'Drones', artist: 'Muse', titleStatus: 'wish' })));
    expect(await screen.findByText('Wished')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith({ id: 42, title: 'Drones' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /take it off the wish list/i }));
    await waitFor(() => expect(musicService.deleteAlbum).toHaveBeenCalledWith(42));
  });

  it('↵ ajoute l’album choisi aux flèches', async () => {
    open('wish');
    type('muse');
    await screen.findByText('Drones');

    const field = screen.getByRole('textbox', { name: /search for an album/i });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(albumFinderService.addAlbum).toHaveBeenCalledWith(expect.objectContaining({ title: 'Drones' })));
  });

  it('la pastille ouvre la discographie, que le champ filtre', async () => {
    const { onHead } = open('wish');
    type('muse');

    fireEvent.click(await screen.findByTitle('All the albums of Muse'));

    expect(await screen.findByText('Showbiz')).toBeInTheDocument();
    expect(albumFinderService.discography).toHaveBeenCalledWith(MUSE);
    expect(onHead).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Muse', onBack: expect.any(Function) }));

    fireEvent.change(screen.getByRole('textbox', { name: /filter the albums of muse/i }), { target: { value: '2015' } });
    expect(screen.queryByText('Showbiz')).not.toBeInTheDocument();
    expect(screen.getByText('Drones')).toBeInTheDocument();
  });

  it('pour la collection, demande quel CD, et l’ajoute de MusicBrainz', async () => {
    const { onAddRelease, onHead } = open('cd');
    type('muse');

    fireEvent.click(await screen.findByText('Drones'));

    expect(await screen.findByText('bonus track')).toBeInTheDocument();
    expect(onHead).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Which CD do you have?' }));
    expect(screen.getByRole('button', { name: /add this cd/i })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: /filter the editions/i }), { target: { value: 'WPCR' } });
    await waitFor(() => expect(screen.getByRole('radio', { checked: true })).toHaveTextContent('WPCR-16575'));

    fireEvent.click(screen.getByRole('button', { name: /add this cd/i }));
    await waitFor(() => expect(onAddRelease).toHaveBeenCalledWith('jp'));
  });

  it('ajoute le CD sans son édition quand on ne sait pas laquelle', async () => {
    const { onClose } = open('cd');
    type('muse');
    fireEvent.click(await screen.findByText('Drones'));
    await screen.findByText('bonus track');

    fireEvent.click(screen.getByRole('button', { name: /add without the edition/i }));

    await waitFor(() => expect(albumFinderService.addAlbum).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Drones', titleStatus: 'owned', releaseGroupId: 'rg-1',
    })));
    expect(onClose).toHaveBeenCalled();
  });

  it('montre ce qui distingue une édition : son conditionnement, sa mention', async () => {
    open('cd');
    type('muse');
    fireEvent.click(await screen.findByText('Drones'));

    const japanese = (await screen.findByText('bonus track')).closest('button') as HTMLElement;
    expect(within(japanese).getByText('Digipak')).toBeInTheDocument();
    expect(within(japanese).getByText(/Japan/)).toBeInTheDocument();
  });
});
