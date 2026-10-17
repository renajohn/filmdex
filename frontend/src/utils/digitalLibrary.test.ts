import { describe, expect, it } from 'vitest';
import type { DigitalAlbum } from '../services/musicService';
import { buyOrder, buyReason, formatLabel, isDismissed, isLossy, isToBuy, ricardoUrl } from './digitalLibrary';

const album = (fields: Partial<DigitalAlbum>): DigitalAlbum => ({
  navidromeId: 'nd', name: 'Album', artist: 'Artist', songCount: 10, url: '', formats: ['FLAC'], quality: 'lossless',
  bitRate: null, hiRes: false, cd: null, oldCopy: false, wishAlbumId: null, albumId: 1, rating: 0, starred: false,
  favouriteTracks: 0, listening: { favourites: 0, needed: 3, plays: 0, lastPlayed: null, score: 0 }, buy: null, dismissed: false,
  ...fields,
});

describe('digitalLibrary', () => {
  it('cherche le CD sur Ricardo sans ce qu’un titre digital ajoute', () => {
    expect(ricardoUrl({ artist: 'Pink Floyd', name: 'Relics (Remastered) [Disc 1]' }))
      .toBe('https://www.ricardo.ch/fr/s/Pink%20Floyd%20Relics/');
  });

  it('dit le format et le débit des fichiers', () => {
    expect(formatLabel(album({}))).toBe('FLAC');
    expect(formatLabel(album({ hiRes: true }))).toBe('FLAC hi-res');
    expect(formatLabel(album({ formats: ['MP3'], quality: 'lossy', bitRate: 128 }))).toBe('MP3 128');
    expect(formatLabel(album({ formats: ['MP3'], quality: 'near', bitRate: 320 }))).toBe('MP3 320');
  });

  it('ne compte comme lossy que ce qui est sous 256 kbps', () => {
    expect(isLossy(album({ quality: 'lossy' }))).toBe(true);
    expect(isLossy(album({ quality: 'near' }))).toBe(false);
    expect(isLossy(null)).toBe(false);
  });

  it('dit pourquoi un album est à acheter', () => {
    expect(buyReason(album({
      buy: { listened: true, rated: true, wished: false }, rating: 4,
      listening: { favourites: 5, needed: 3, plays: 31, lastPlayed: null, score: 9 },
    }))).toBe('5 tracks ×2+ · ★4');
  });

  it('garde dans Buy un souhait même écarté, et met de côté ce qui est seulement écouté', () => {
    const heard = { listened: true, rated: false, wished: false };
    expect(isToBuy(album({ buy: heard }))).toBe(true);
    expect(isToBuy(album({ buy: heard, dismissed: true }))).toBe(false);
    expect(isDismissed(album({ buy: heard, dismissed: true }))).toBe(true);
    expect(isToBuy(album({ buy: { ...heard, wished: true }, dismissed: true }))).toBe(true);
  });

  it('met l’écoute avant les simples souhaits, la plus récente d’abord', () => {
    const wished = album({ name: 'W', buy: { listened: false, rated: false, wished: true } });
    const old = album({ name: 'O', buy: { listened: true, rated: false, wished: false }, listening: { favourites: 3, needed: 3, plays: 6, lastPlayed: null, score: 1 } });
    const recent = album({ name: 'R', buy: { listened: true, rated: false, wished: false }, listening: { favourites: 3, needed: 3, plays: 6, lastPlayed: null, score: 5 } });
    expect([wished, old, recent].sort(buyOrder).map(entry => entry.name)).toEqual(['R', 'O', 'W']);
  });
});
