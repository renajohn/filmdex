import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AlbumNotes from './AlbumNotes';

const stored = [{ id: 1, albumId: 7, note: 'Slow movement, wonderful.', date: '2026-10-01', createdAt: '', updatedAt: '' }];

vi.mock('../services/musicService', () => ({
  default: {
    getAlbumNotes: vi.fn(() => Promise.resolve(stored)),
    addAlbumNote: vi.fn((albumId: number, note: string, date: string) =>
      Promise.resolve({ id: 2, albumId, note, date, createdAt: '', updatedAt: '' })),
    updateAlbumNote: vi.fn((id: number, note: string, date: string) =>
      Promise.resolve({ id, albumId: 7, note, date, createdAt: '', updatedAt: '' })),
    deleteAlbumNote: vi.fn(() => Promise.resolve({ deleted: true })),
  },
}));

import musicService from '../services/musicService';

describe('AlbumNotes', () => {
  it('adds a dated note above the earlier ones', async () => {
    render(<AlbumNotes albumId={7} />);
    await screen.findByText('Slow movement, wonderful.');

    fireEvent.change(screen.getByLabelText('New listening note'), { target: { value: 'Second listening, the finale.' } });
    fireEvent.change(screen.getByLabelText('Day of the listening'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await screen.findByText('Second listening, the finale.');
    expect(musicService.addAlbumNote).toHaveBeenCalledWith(7, 'Second listening, the finale.', '2026-10-05');
    const texts = screen.getAllByText(/listening|movement/).map(el => el.textContent);
    expect(texts.indexOf('Second listening, the finale.')).toBeLessThan(texts.indexOf('Slow movement, wonderful.'));
  });

  it('edits and deletes a note', async () => {
    render(<AlbumNotes albumId={7} />);
    await screen.findByText('Slow movement, wonderful.');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit the note'), { target: { value: 'Slow movement, sublime.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Slow movement, sublime.');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Slow movement, sublime.')).not.toBeInTheDocument());
  });
});
