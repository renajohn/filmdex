import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScoreCard from './ScoreCard';
import scorePiecesService, { ScorePiece } from '../services/scorePiecesService';
import { player } from '../services/player';
import { loadPlayable } from '../utils/playAlbum';
import type { Score } from '../services/bookSectionsService';

vi.mock('../services/scorePiecesService', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/scorePiecesService')>()),
  default: { pieces: vi.fn(), addPieces: vi.fn(), removePiece: vi.fn(), choose: vi.fn(), suggestions: vi.fn(), search: vi.fn(), contentsPhoto: vi.fn(), imslpPage: vi.fn() },
}));
vi.mock('../utils/playAlbum', () => ({ loadPlayable: vi.fn() }));
vi.mock('../services/bookService', () => ({ default: { getImageUrl: (p: string | null) => p } }));

const score: Score = {
  id: 219, title: 'Préludes Vol. 1 - piano - (HN 383)', authors: [], publisher: 'G. Henle Verlag', cover: null, composer: 'Claude Debussy',
  composerSuggestion: null, ebookFile: null, isbn13: null, urls: {}, titleStatus: 'owned',
};
const rec = (albumId: number, no: number, durationSec = 150) => ({ trackId: albumId * 100 + no, albumId, disc: 1, no, title: `Track ${no}`, durationSec });
const album = (albumId: number, performers: string[], covered: number, year = 2003) => ({
  albumId, title: `Album ${albumId}`, artist: [], performers, year, cover: null, rating: null, titleStatus: 'owned', covered,
});
const livre: ScorePiece = {
  id: 1, workId: 'w-livre', imslp: null, title: 'Préludes, Livre I, L. 117, CD 125', single: false, whole: [], preferredAlbumId: 177,
  parts: [
    { workId: 'w1', title: '…: I. Danseuses de Delphes', name: 'Danseuses de Delphes', sub: 'Lent et grave', imslp: 'Danseuses_de_Delphes_(Debussy)', recordings: [rec(177, 1, 149), rec(903, 1, 160)] },
    { workId: 'w2', title: '…: II. Voiles', name: 'Voiles', sub: 'Modéré', imslp: null, recordings: [rec(177, 2, 176)] },
    { workId: 'w3', title: '…: III. Le vent dans la plaine', name: 'Le vent dans la plaine', sub: 'Animé', imslp: null, recordings: [] },
  ],
  albums: [album(177, ['Ruth Schmid-Gagnebin'], 2), album(903, ['Krystian Zimerman'], 1, 1994)],
};
const clair: ScorePiece = { id: 2, workId: 'w-clair', imslp: null, title: 'Clair de lune', single: true, parts: [], whole: [], albums: [], preferredAlbumId: null };

const card = () => render(<ScoreCard score={score} title="Préludes Vol. 1" onClose={vi.fn()} onDetails={vi.fn()} onAttach={vi.fn()} onChanged={vi.fn()} />);

beforeEach(() => {
  vi.mocked(scorePiecesService.pieces).mockReset().mockResolvedValue([livre, clair]);
  vi.mocked(scorePiecesService.choose).mockReset().mockResolvedValue();
  vi.mocked(scorePiecesService.imslpPage).mockReset().mockResolvedValue({ page: 'Préludes, Livre 1, CD 125 (Debussy, Claude)' });
  vi.mocked(loadPlayable).mockReset().mockResolvedValue({
    album: { id: 177, title: '24 Préludes', artist: 'Ruth Schmid-Gagnebin', cover: null },
    tracks: [1, 2, 3].map(no => ({ songId: `s${no}`, title: `Track ${no}`, disc: 1, no, durationSec: 150 })),
  });
  vi.spyOn(player, 'playAlbum').mockImplementation(() => undefined);
});

describe('ScoreCard', () => {
  it('montre ses pièces, chacune avec l’enregistrement choisi, et le joue', async () => {
    card();
    const voiles = (await screen.findByText('Voiles')).closest('.score-piece__row') as HTMLElement;
    expect(screen.getByText(/2 of 4 in your music/)).toBeInTheDocument();

    fireEvent.click(within(voiles).getByRole('button', { name: /Schmid-Gagnebin/ }));

    await waitFor(() => expect(player.playAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 177 }), [expect.objectContaining({ songId: 's2' })], 0));
  });

  it('joue toute l’œuvre dans l’enregistrement choisi, et en change', async () => {
    card();
    fireEvent.click(await screen.findByRole('button', { name: /All · Schmid-Gagnebin/ }));
    await waitFor(() => expect(player.playAlbum).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ songId: 's1' }), expect.objectContaining({ songId: 's2' })], 0));

    fireEvent.click(screen.getByRole('button', { name: 'Which recording' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Krystian Zimerman/ }));
    await waitFor(() => expect(scorePiecesService.choose).toHaveBeenCalledWith(219, 1, 903));
    expect(screen.getByRole('button', { name: /All · Zimerman/ })).toBeInTheDocument();
  });

  it('garde les autres enregistrements d’une pièce derrière +N', async () => {
    card();
    const danseuses = (await screen.findByText('Danseuses de Delphes')).closest('.score-piece__row') as HTMLElement;
    fireEvent.click(within(danseuses).getByRole('button', { name: '+1' }));
    expect(await screen.findByRole('menuitem', { name: /Krystian Zimerman/ })).toBeInTheDocument();
  });

  it('cherche sur YouTube ce que la musique ne joue pas', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    card();
    const clairRow = (await screen.findByText('Not in your music')).closest('.score-piece__row') as HTMLElement;
    fireEvent.click(within(clairRow).getByRole('button', { name: /YouTube/ }));
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/results?search_query=Claude%20Debussy%20Clair%20de%20lune', '_blank', 'noopener');
  });

  it('mène à la page IMSLP d’une pièce quand on la connaît', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    card();
    const danseuses = (await screen.findByText('Danseuses de Delphes')).closest('.score-piece__row') as HTMLElement;
    fireEvent.click(within(danseuses).getByRole('button', { name: 'Its score on IMSLP' }));
    expect(open).toHaveBeenCalledWith('https://imslp.org/wiki/Danseuses_de_Delphes_(Debussy)', '_blank', 'noopener');
    expect(within((screen.getByText('Voiles')).closest('.score-piece__row') as HTMLElement).queryByRole('button', { name: 'Its score on IMSLP' })).toBeNull();
  });

  it('mène à la page IMSLP de la partition pour trouver son PDF', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    card();
    const button = await screen.findByRole('button', { name: /Find the PDF on IMSLP/ });
    await waitFor(() => expect(button).toHaveAttribute('title', expect.stringMatching(/Its page on IMSLP/)));
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith('https://imslp.org/wiki/Pr%C3%A9ludes,_Livre_1,_CD_125_(Debussy,_Claude)', '_blank', 'noopener');
  });

  it('propose le contenu d’une partition qui n’en a pas, et garde ce qu’on coche', async () => {
    vi.mocked(scorePiecesService.pieces).mockResolvedValue([]);
    vi.mocked(scorePiecesService.suggestions).mockResolvedValue([
      { workId: 'bwv812', title: 'Französische Suite Nr. 1 d-Moll, BWV 812', composers: [], parts: 6, inYourMusic: 0, why: 'number' },
      { workId: 'bwv813', title: 'Französische Suite Nr. 2 c-Moll, BWV 813', composers: [], parts: 6, inYourMusic: 0, why: 'number' },
    ]);
    vi.mocked(scorePiecesService.addPieces).mockResolvedValue([{ ...livre, id: 5, title: 'Französische Suite Nr. 1 d-Moll, BWV 812' }]);
    card();

    fireEvent.click(await screen.findByRole('checkbox', { name: /BWV 813/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(scorePiecesService.addPieces).toHaveBeenCalledWith(219, { workIds: ['bwv812'] }));
    expect(await screen.findByText('Französische Suite Nr. 1 d-Moll, BWV 812')).toBeInTheDocument();
  });

  it('ajoute une pièce trouvée par la recherche', async () => {
    vi.mocked(scorePiecesService.search).mockResolvedValue([{ workId: 'w-tr', title: 'Kinderszenen, op. 15: VII. Träumerei', composers: ['Robert Schumann'], parts: 0, inYourMusic: 1, why: 'search' }]);
    vi.mocked(scorePiecesService.addPieces).mockResolvedValue([livre, clair]);
    card();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add a piece' }));

    fireEvent.change(screen.getByLabelText('Find a piece'), { target: { value: 'träumerei' } });
    fireEvent.click(await screen.findByRole('option', { name: /Träumerei/ }, { timeout: 2000 }));

    await waitFor(() => expect(scorePiecesService.addPieces).toHaveBeenCalledWith(219, { workIds: ['w-tr'] }));
  });
});
