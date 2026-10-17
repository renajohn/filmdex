import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { DigitalAlbum } from '../../services/musicService';
import DigitalMarks from './DigitalMarks';

const album = (fields: Partial<DigitalAlbum>): DigitalAlbum => ({
  navidromeId: 'nd', name: 'Album', artist: 'Artist', songCount: 10, url: '', formats: ['FLAC'], quality: 'lossless',
  bitRate: null, hiRes: false, cd: null, oldCopy: false, wishAlbumId: null, albumId: 1, rating: 0, starred: false,
  favouriteTracks: 0, listening: { favourites: 0, needed: 3, plays: 0, lastPlayed: null, score: 0 }, buy: null, dismissed: false,
  ...fields,
});

const titles = (element: React.ReactElement) =>
  [...render(element).container.querySelectorAll('.digital-mark')].map(mark => mark.getAttribute('title'));

describe('DigitalMarks', () => {
  it('ne marque rien d’un CD rippé en lossless', () => {
    expect(titles(<DigitalMarks digital={{ album: album({}), notRipped: false }} titleStatus="owned" />)).toEqual([]);
  });

  it('marque un CD pas rippé, et un CD rippé en lossy de son format', () => {
    expect(titles(<DigitalMarks digital={{ album: null, notRipped: true }} titleStatus="owned" />)).toEqual(['Not ripped']);
    expect(titles(<DigitalMarks digital={{ album: album({ formats: ['MP3'], quality: 'lossy', bitRate: 128 }), notRipped: false }} titleStatus="owned" />))
      .toEqual(['Ripped in MP3 128: rip it again']);
  });

  it('met le nuage sur un album sans CD, en orange avec son format quand il est lossy', () => {
    const { container } = render(<DigitalMarks digital={{ album: album({ formats: ['MP3'], quality: 'lossy', bitRate: 160 }), notRipped: false }} titleStatus="digital" />);
    const mark = container.querySelector('.digital-mark')!;
    expect(mark.className).toContain('digital-mark-lossy');
    expect(mark.textContent).toBe('MP3 160');
    expect(titles(<DigitalMarks digital={{ album: album({}), notRipped: false }} titleStatus="digital" />)).toEqual(['No CD · FLAC']);
  });

  it('dit ce qui est à acheter : le chariot pour l’écoute, le cœur pour la wishlist', () => {
    const heard = album({ buy: { listened: true, rated: false, wished: false } });
    expect(titles(<DigitalMarks digital={{ album: heard, notRipped: false }} titleStatus="digital" />))
      .toEqual(['No CD · FLAC', 'Worth buying, from your listening']);
    expect(titles(<DigitalMarks digital={{ album: heard, notRipped: false }} titleStatus="wish" />))
      .toEqual(['No CD · FLAC', 'On your wish list']);
  });
});
