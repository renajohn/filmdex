import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TrackDetails, { type DetailedTrack } from './TrackDetails';

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
});
