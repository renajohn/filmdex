import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TrackDetailPanel, { type PanelTrack } from './TrackDetailPanel';

const tracks: PanelTrack[] = [
  {
    disc: 1, no: 1, title: 'Danseuses de Delphes', durationSec: 149, work: 'Préludes, Book 1',
    composers: ['Claude Debussy'], performers: [{ name: 'Ruth Schmid-Gagnebin', role: 'piano' }],
    isrc: 'CHA000300001', musicbrainzRecordingId: 'rec-1',
  },
  { disc: 1, no: 2, title: 'Voiles', durationSec: 176 },
];

const rip = {
  configured: true, found: true, tracks: [{
    discNumber: 1, track: 1, title: 'Danseuses de Delphes', durationSec: 149, suffix: 'flac', bitRate: 900,
    bitDepth: 16, samplingRate: 44100, channelCount: 2, size: 20_000_000, path: 'Debussy/01.flac',
  }],
};

const renderPanel = (props: Partial<React.ComponentProps<typeof TrackDetailPanel>> = {}) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<TrackDetailPanel tracks={tracks} index={0} multiDisc={false} rip={rip} onSelect={onSelect} onClose={onClose} {...props} />);
  return { onSelect, onClose };
};

describe('TrackDetailPanel', () => {
  it('shows everything known of the track, and its rip', () => {
    renderPanel();

    expect(screen.getByText('Track 1')).toBeInTheDocument();
    expect(screen.getByText('2:29')).toBeInTheDocument();
    expect(screen.getByText('Préludes, Book 1')).toBeInTheDocument();
    expect(screen.getByText('Claude Debussy')).toBeInTheDocument();
    expect(screen.getByText('Ruth Schmid-Gagnebin')).toBeInTheDocument();
    expect(screen.getByText('piano')).toBeInTheDocument();
    expect(screen.getByText('CHA000300001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recording' })).toHaveAttribute('href', 'https://musicbrainz.org/recording/rec-1');
    expect(screen.getByText('FLAC · 16-bit · 44.1 kHz · stereo')).toBeInTheDocument();
    expect(screen.getByText('Debussy/01.flac')).toBeInTheDocument();
  });

  it('says when a track has no credits and the CD is not ripped', () => {
    renderPanel({ index: 1, rip: { configured: true, found: false, tracks: [] } });

    expect(screen.getByText(/No credits for this track/)).toBeInTheDocument();
    expect(screen.getByText('Not in Navidrome yet.')).toBeInTheDocument();
  });

  it('says nothing of the rip when Navidrome is not set up', () => {
    renderPanel({ rip: { configured: false, found: false, tracks: [] } });

    expect(screen.queryByText('Rip')).not.toBeInTheDocument();
  });

  it('walks the tracks with the arrows and closes with Esc', () => {
    const { onSelect, onClose } = renderPanel();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a swipe down of its head', () => {
    const { onClose } = renderPanel();
    const head = screen.getByText('Danseuses de Delphes', { selector: 'h5' }).parentElement!;

    fireEvent.touchStart(head, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(head, { touches: [{ clientY: 150 }] });
    fireEvent.touchEnd(head);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.touchStart(head, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(head, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(head);
    expect(onClose).toHaveBeenCalled();
  });
});
