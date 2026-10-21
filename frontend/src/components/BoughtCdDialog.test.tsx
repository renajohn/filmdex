import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import musicService from '../services/musicService';
import albumFinderService from '../services/albumFinderService';
import BoughtCdDialog from './BoughtCdDialog';
import { chooseValue } from '../test/select';

describe('BoughtCdDialog', () => {
  it('garde l’édition de l’album par défaut, et dit comment le CD a été acheté', async () => {
    const mark = vi.spyOn(musicService, 'markAlbumBought').mockResolvedValue({ id: 7, title: 'Play' });
    const onBought = vi.fn();
    render(<BoughtCdDialog album={{ id: 7, title: 'Play' }} onClose={() => undefined} onBought={onBought} />);

    chooseValue(screen.getByLabelText('Condition'), 'NM');
    fireEvent.change(screen.getByLabelText('Price CHF'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Into my collection' }));

    await waitFor(() => expect(onBought).toHaveBeenCalledWith({ id: 7, title: 'Play' }));
    expect(mark).toHaveBeenCalledWith(7, expect.objectContaining({ condition: 'NM', priceChf: '12' }));
    expect(mark.mock.calls[0][1]).not.toHaveProperty('barcode');
    expect(mark.mock.calls[0][1]).not.toHaveProperty('releaseId');
  });

  it('prend l’édition du code-barres quand on le choisit, et montre ce que le serveur refuse', async () => {
    const mark = vi.spyOn(musicService, 'markAlbumBought').mockRejectedValue(new Error('MusicBrainz knows no edition with the barcode 123'));
    render(<BoughtCdDialog album={{ id: 8, title: 'Hotel' }} onClose={() => undefined} onBought={() => undefined} />);

    fireEvent.click(screen.getByLabelText('From the barcode on its back'));
    fireEvent.change(screen.getByPlaceholderText(/724384546526/), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Into my collection' }));

    expect(await screen.findByText('MusicBrainz knows no edition with the barcode 123')).toBeTruthy();
    expect(mark).toHaveBeenCalledWith(8, expect.objectContaining({ barcode: '123' }));
  });

  it('demande d’abord quel CD, parmi les éditions de MusicBrainz, puis comment il a été acheté', async () => {
    vi.spyOn(albumFinderService, 'editions').mockResolvedValue({
      releaseGroup: { id: 'rg', title: 'Mezzanine', artist: 'Massive Attack', firstReleaseDate: '1998' },
      editions: [
        { id: 'eu', date: '1998', country: 'XE', barcode: '724384559922', labels: ['Circa'], catalogNumbers: ['WBRCD4'], packaging: 'Jewel Case',
          disambiguation: null, status: 'Official', formats: ['CD'], discs: 1, front: false },
        { id: 'deluxe', date: '2018', country: 'XE', barcode: null, labels: ['Virgin'], catalogNumbers: ['WBRX4'], packaging: 'Digipak',
          disambiguation: '2018 remaster', status: 'Official', formats: ['CD'], discs: 2, front: false },
      ],
    });
    const mark = vi.spyOn(musicService, 'markAlbumBought').mockResolvedValue({ id: 9, title: 'Mezzanine' });
    render(<BoughtCdDialog album={{ id: 9, title: 'Mezzanine', artist: ['Massive Attack'] }} onClose={() => undefined} onBought={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Which CD did you buy?' })).toBeTruthy();
    fireEvent.click(await screen.findByText('2018 remaster'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Digipak · 2018 remaster/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Into my collection' }));

    await waitFor(() => expect(mark).toHaveBeenCalledWith(9, expect.objectContaining({ releaseId: 'deluxe' })));
  });

  it('prend un code-barres tapé qu’aucune édition listée ne porte', async () => {
    vi.spyOn(albumFinderService, 'editions').mockResolvedValue({ releaseGroup: null, editions: [] });
    const mark = vi.spyOn(musicService, 'markAlbumBought').mockResolvedValue({ id: 10, title: 'Blue Lines' });
    render(<BoughtCdDialog album={{ id: 10, title: 'Blue Lines', artist: 'Massive Attack' }} onClose={() => undefined} onBought={() => undefined} />);

    fireEvent.change(await screen.findByRole('textbox', { name: /filter the editions/i }), { target: { value: '5099 9 0959' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Into my collection' }));

    await waitFor(() => expect(mark).toHaveBeenCalledWith(10, expect.objectContaining({ barcode: '509990959' })));
  });
});
