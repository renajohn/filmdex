import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlbumGuide, { GuideText, briefOf, readingOf } from './AlbumGuide';
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

describe('briefOf', () => {
  it('garde de chaque œuvre son titre et son contexte', () => {
    const text = '### Consolations\n**Contexte** : six pièces calmes.\n\n**À guetter** :\n- plage 1\n\n### Liebesträume\n**Contexte** : trois mélodies.\n\n**Le son** : un piano.\n\n### Votre version\nUn Steinway.';
    expect(briefOf(text)).toBe('### Consolations\n**Contexte** : six pièces calmes.\n\n### Liebesträume\n**Contexte** : trois mélodies.');
  });

  it('ne replie rien sans contexte, ni quand il n’y a rien de plus', () => {
    expect(briefOf('### Ma version\nQuelques mots.')).toBeNull();
    expect(briefOf('### Titre\n**Context**: all of it.')).toBeNull();
  });
});

describe('readingOf', () => {
  it('ôte le titre qui ne fait que répéter l’album, pas ceux de plusieurs œuvres', () => {
    expect(readingOf('### Abbey Road (1969), 47 min — plages 1 à 17\n**Contexte** : le dernier.\n\n### Votre version\nUn remaster.'))
      .toBe('**Contexte** : le dernier.\n\n### Votre version\nUn remaster.');
    const two = '### Consolations\n**Contexte** : calmes.\n\n### Liebesträume\n**Contexte** : trois mélodies.';
    expect(readingOf(two)).toBe(two);
  });
});

describe('AlbumGuide', () => {
  it('montre le contexte, le reste et sa source sur demande, et prévient la fenêtre qu’il y en a une', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(GUIDE);
    const onLoaded = vi.fn();
    render(<AlbumGuide albumId={117} onLoaded={onLoaded} />);

    expect(await screen.findByText('Before you listen')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Le Sacre du printemps/ })).not.toBeInTheDocument();
    expect(screen.getByText('30 ans')).toBeInTheDocument();
    expect(screen.queryByText(/un basson seul/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Written by Claude/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See more…' }));
    expect(screen.getByText(/un basson seul/)).toBeInTheDocument();
    expect(screen.getByText(/Written by Claude/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See less…' }));
    expect(screen.queryByText(/un basson seul/)).not.toBeInTheDocument();
    expect(onLoaded).toHaveBeenLastCalledWith(true);
  });

  it('se modifie à la main et passe en source manuelle', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(GUIDE);
    vi.mocked(musicService.saveAlbumGuide).mockResolvedValue({ ...GUIDE, source: 'manual', text: '### Ma version' });
    render(<AlbumGuide albumId={117} />);

    fireEvent.click(await screen.findByRole('button', { name: 'See more…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
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

    fireEvent.click(await screen.findByRole('button', { name: 'See more…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite with the local LLM' }));
    expect(musicService.generateAlbumGuide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(await screen.findByText(/Written by the local LLM \(Qwen3\.6\)/)).toBeInTheDocument();
  });

  it('propose d’en écrire une quand il n’y en a pas', async () => {
    vi.mocked(musicService.getAlbumGuide).mockResolvedValue(null);
    vi.mocked(musicService.generateAlbumGuide).mockResolvedValue({ ...GUIDE, source: 'local_llm', model: 'Qwen3.6' });
    const onLoaded = vi.fn();
    render(<AlbumGuide albumId={117} onLoaded={onLoaded} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Write a listening guide with the local LLM…' }));
    await waitFor(() => expect(onLoaded).toHaveBeenLastCalledWith(true));
    expect(onLoaded).toHaveBeenCalledWith(false);
  });
});
