import { describe, it, expect } from 'vitest';
import { joinNames, performersByPerson, ripFileFor, ripFormat, ripSize, splitNames } from './trackDetail';
import type { RipTrackFile } from '../services/musicService';

const file = (overrides: Partial<RipTrackFile> = {}): RipTrackFile => ({
  discNumber: 1, track: 1, title: 'Voiles', durationSec: 176, suffix: 'flac', bitRate: 912,
  bitDepth: 16, samplingRate: 44100, channelCount: 2, size: 38_400_000, path: 'Debussy/24 Préludes/02 Voiles.flac',
  ...overrides,
});

describe('trackDetail', () => {
  it('names each performer once, with all their roles', () => {
    expect(performersByPerson([
      { name: 'Ryan Tedder', role: 'drums' },
      { name: 'Adele', role: 'lead vocals' },
      { name: 'Ryan Tedder', role: 'piano, drums' },
    ])).toEqual([
      { name: 'Ryan Tedder', roles: ['drums', 'piano'] },
      { name: 'Adele', roles: ['lead vocals'] },
    ]);
  });

  it('finds the file of a track by disc and number', () => {
    const files = [file(), file({ discNumber: 2, track: 1, title: 'Brouillards' })];
    expect(ripFileFor(files, 2, 1)?.title).toBe('Brouillards');
    expect(ripFileFor(files, 1, 3)).toBeNull();
  });

  it('says what a rip is at a glance', () => {
    expect(ripFormat(file())).toBe('FLAC · 16-bit · 44.1 kHz · stereo');
    expect(ripFormat(file({ suffix: 'mp3', bitDepth: null, samplingRate: 48000, channelCount: 1 }))).toBe('MP3 · 48 kHz · mono');
    expect(ripSize(file())).toBe('912 kbps · 38.4 MB');
  });

  it('turns typed names into a list and back', () => {
    expect(splitNames(' Walter Becker ;Donald Fagen; ')).toEqual(['Walter Becker', 'Donald Fagen']);
    expect(joinNames(['Walter Becker', 'Donald Fagen'])).toBe('Walter Becker; Donald Fagen');
    expect(joinNames(undefined)).toBe('');
  });
});
