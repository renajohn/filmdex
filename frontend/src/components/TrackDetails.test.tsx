import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TrackDetails, { lyricsText, type DetailedTrack } from './TrackDetails';
import musicService from '../services/musicService';

const credited: DetailedTrack = {
  disc: 1, no: 1, title: 'Danseuses de Delphes', work: 'Préludes, Livre I: I. Danseuses de Delphes',
  composers: ['Claude Debussy'], performers: [{ name: 'Ruth Schmid-Gagnebin', role: 'piano' }],
  isrc: 'CHA000300001', musicbrainzRecordingId: 'rec-1',
};

const rip = {
  configured: true, found: true, tracks: [{
    id: 'song-1', url: 'https://music.example/app/#/song?filter=x',
    discNumber: 1, track: 1, title: 'Danseuses de Delphes', durationSec: 149, suffix: 'flac', bitRate: 900,
    bitDepth: 16, samplingRate: 44100, channelCount: 2, size: 20_000_000, path: 'Debussy/01.flac',
  }],
};

describe('TrackDetails', () => {
  it('shows everything known of the track, and its rip', () => {
    render(<TrackDetails track={credited} rip={rip} />);

    expect(screen.getByText('Préludes, Livre I: I. Danseuses de Delphes')).toBeInTheDocument();
    expect(screen.getByText('Claude Debussy')).toBeInTheDocument();
    expect(screen.getByText('Ruth Schmid-Gagnebin', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('piano')).toBeInTheDocument();
    expect(screen.getByText('CHA000300001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Navidrome' })).toHaveAttribute('href', 'https://music.example/app/#/song?filter=x');
    expect(screen.queryByRole('link', { name: 'Recording' })).not.toBeInTheDocument();
    expect(screen.getByText('FLAC · 16-bit · 44.1 kHz · stereo', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Debussy/01.flac')).toBeInTheDocument();
  });

  it('opens the CDs that credit a composer, a performer, a conductor or an instrument too', () => {
    const onSearch = vi.fn();
    render(<TrackDetails onSearch={onSearch} track={{
      disc: 1, no: 1, title: 'I. Allegro', work: 'Piano Concerto No. 20 in D minor, K. 466', composers: ['Wolfgang Amadeus Mozart'],
      performers: [{ name: 'Sir Neville Marriner', role: 'conductor' }, { name: 'Alfred Brendel', role: 'piano' }],
    }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Wolfgang Amadeus Mozart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alfred Brendel' }));
    fireEvent.click(screen.getByRole('button', { name: 'conductor' }));
    fireEvent.click(screen.getByRole('button', { name: 'piano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Piano Concerto No. 20 in D minor, K. 466' }));
    expect(onSearch.mock.calls.map(([predicate]) => predicate)).toEqual([
      'composer:"Wolfgang Amadeus Mozart"', 'performer:"Alfred Brendel"', 'conductor:"Sir Neville Marriner"',
      'instrument:"piano"', 'work:"Piano Concerto No. 20 in D minor, K. 466"',
    ]);
  });

  it('says when a track has no credits and the CD is not ripped', () => {
    render(<TrackDetails track={{ disc: 1, no: 2, title: 'Voiles' }} rip={{ configured: true, found: false, tracks: [] }} />);

    expect(screen.getByText(/No credits for this track/)).toBeInTheDocument();
    expect(screen.getByText('Not in Navidrome yet.')).toBeInTheDocument();
  });

  it('says it is reading Navidrome until the rip arrives', () => {
    render(<TrackDetails track={credited} />);

    expect(screen.getByText('Reading Navidrome…')).toBeInTheDocument();
  });

  it('says nothing of the rip when Navidrome is not set up', () => {
    render(<TrackDetails track={credited} rip={{ configured: false, found: false, tracks: [] }} />);

    expect(screen.queryByText('Rip')).not.toBeInTheDocument();
  });

  it('leaves the work out when it only repeats the title', () => {
    render(<TrackDetails track={{ disc: 1, no: 1, title: 'Ondine', work: 'Ondine', composers: ['Claude Debussy'] }} rip={rip} />);

    expect(screen.queryByText('Work')).not.toBeInTheDocument();
  });

  it('names the track artist only when it differs from the album', () => {
    const track = { disc: 1, no: 1, title: 'Ondine', artist: ['Claude Debussy', 'Ruth Schmid-Gagnebin'] };
    const { rerender } = render(<TrackDetails track={track} albumArtists={['Ruth Schmid-Gagnebin', 'Claude Debussy']} rip={rip} />);
    expect(screen.queryByText('Track artist')).not.toBeInTheDocument();

    rerender(<TrackDetails track={{ ...track, artist: ['Aretha Franklin'] }} albumArtists={['Various Artists']} rip={rip} />);
    expect(screen.getByText('Aretha Franklin')).toBeInTheDocument();
  });

  describe('lyrics', () => {
    afterEach(() => vi.restoreAllMocks());
    const lyrics = (fields: object) => ({ status: 'found', plain: null, synced: null, source: 'lrclib', checkedAt: '2026-10-13', ...fields });

    it('shows the words of the track, asked for by album, disc and track', async () => {
      const get = vi.spyOn(musicService, 'getLyrics').mockResolvedValue(lyrics({ plain: 'Karma police\nArrest this man', synced: '[00:01.00] Karma police' }) as never);
      render(<TrackDetails albumId={42} track={{ disc: 1, no: 6, title: 'Karma Police' }} />);

      // Folded: the fold says the words are there, opening it shows them.
      expect(await screen.findByText('synced')).toBeInTheDocument();
      expect(screen.queryByText(/Arrest this man/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Lyrics/ }));
      expect(screen.getByRole('button', { name: /Lyrics/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/Arrest this man/)).toBeInTheDocument();
      expect(get).toHaveBeenCalledWith(42, 1, 6);
    });

    it('reads timed lines without their times when there is no plain text', () => {
      expect(lyricsText({ plain: null, synced: '[00:01.00] One\n[00:02.50][00:40.00] Two' })).toBe('One\nTwo');
    });

    it('says a track is instrumental', async () => {
      vi.spyOn(musicService, 'getLyrics').mockResolvedValue(lyrics({ status: 'instrumental' }) as never);
      render(<TrackDetails albumId={42} track={{ disc: 1, no: 1, title: 'Guitar Flute & String' }} />);
      expect(await screen.findByText('instrumental')).toBeInTheDocument();
    });

    it('looks again for words not found', async () => {
      const get = vi.spyOn(musicService, 'getLyrics')
        .mockResolvedValueOnce(lyrics({ status: 'missing' }) as never)
        .mockResolvedValueOnce(lyrics({ plain: 'Found now' }) as never);
      render(<TrackDetails albumId={42} track={{ disc: 1, no: 2, title: 'Sitting' }} />);

      expect(await screen.findByText('none found')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Lyrics/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Look again' }));
      expect(await screen.findByText('Found now')).toBeInTheDocument();
      expect(get).toHaveBeenLastCalledWith(42, 1, 2, true);
    });

    it('asks for nothing without an album', () => {
      const get = vi.spyOn(musicService, 'getLyrics');
      render(<TrackDetails track={{ disc: 1, no: 2, title: 'Voiles' }} />);
      expect(get).not.toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Lyrics' })).not.toBeInTheDocument();
    });
  });
});
