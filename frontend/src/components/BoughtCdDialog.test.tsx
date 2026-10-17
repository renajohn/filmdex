import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import musicService from '../services/musicService';
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
});
