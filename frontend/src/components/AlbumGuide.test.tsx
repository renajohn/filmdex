import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlbumGuide, { GuideText } from './AlbumGuide';
import musicService from '../services/musicService';

vi.mock('../services/musicService', () => ({
  default: { getAlbumGuide: vi.fn(), saveAlbumGuide: vi.fn(), generateAlbumGuide: vi.fn() },
}));

const GUIDE = {
  albumId: 117, source: 'claude' as const, model: null, createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z',
  text: '### Le Sacre du printemps (1913), 35 min — plages 1 à 14\n**Contexte** : Stravinsky a *30 ans*.\n\n**À guetter** :\n- **Plage 1** : un basson seul.\n- **Plage 2** : des accents imprévisibles.',
};

beforeEach(() => vi.clearAllMocks());

describe('GuideText', () => {
  it('rend titres, gras, italique et puces sans HTML brut', () => {
    const { container } = render(<GuideText text={'### Titre\n**Gras** et *italique*\n- un\n- deux\n<b>pas du HTML</b>'} />);
    expect(container.querySelector('h5')).toHaveTextContent('Titre');
    expect(container.querySelector('strong')).toHaveTextContent('Gras');
    expect(container.querySelector('em')).toHaveTextContent('italique');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>pas du HTML</b>')).toBeInTheDocument();
  });
});

describe('AlbumGuide', () => {
  it('montre la fiche, sa source, et prévient la fenêtre qu’il y en a une', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(GUIDE);
    const onLoaded = vi.fn();
    render(<AlbumGuide albumId={117} onLoaded={onLoaded} />);

    expect(await screen.findByText('Before you listen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Le Sacre du printemps/ })).toBeInTheDocument();
    expect(screen.getByText(/Written by Claude/)).toBeInTheDocument();
    expect(onLoaded).toHaveBeenLastCalledWith(true);
  });

  it('se modifie à la main et passe en source manuelle', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(GUIDE);
    vi.mocked(musicService.saveAlbumGuide).mockResolvedValue({ ...GUIDE, source: 'manual', text: '### Ma version' });
    render(<AlbumGuide albumId={117} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const editor = screen.getByLabelText('Listening guide');
    expect(editor).toHaveValue(GUIDE.text);
    fireEvent.change(editor, { target: { value: '### Ma version' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Written by you', { exact: false })).toBeInTheDocument();
    expect(musicService.saveAlbumGuide).toHaveBeenCalledWith(117, '### Ma version');
  });

  it('ne remplace par le LLM local qu’après confirmation', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(GUIDE);
    vi.mocked(musicService.generateAlbumGuide).mockResolvedValue({ ...GUIDE, source: 'local_llm', model: 'Qwen3.6', text: '### Nouvelle' });
    render(<AlbumGuide albumId={117} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rewrite with the local LLM' }));
    expect(musicService.generateAlbumGuide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(await screen.findByText(/Written by the local LLM \(Qwen3\.6\)/)).toBeInTheDocument();
  });

  it('propose d’en écrire une quand il n’y en a pas', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(null);
    vi.mocked(musicService.generateAlbumGuide).mockResolvedValue({ ...GUIDE, source: 'local_llm', model: 'Qwen3.6' });
    const onLoaded = vi.fn();
    render(<AlbumGuide albumId={117} onLoaded={onLoaded} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Write one with the local LLM' }));
    await waitFor(() => expect(onLoaded).toHaveBeenLastCalledWith(true));
    expect(onLoaded).toHaveBeenCalledWith(false);
  });
});
