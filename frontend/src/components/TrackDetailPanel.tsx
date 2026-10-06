import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BsChevronDown, BsChevronUp, BsX } from 'react-icons/bs';
import type { RipTracks } from '../services/musicService';
import type { TrackPerformer } from '../utils/trackCredits';
import { performersByPerson, ripFileFor, ripFormat, ripSize } from '../utils/trackDetail';
import './TrackDetailPanel.css';

export interface PanelTrack {
  disc: number;
  no?: number | string;
  title: string;
  durationSec?: number | null;
  isrc?: string | null;
  musicbrainzRecordingId?: string | null;
  work?: string | null;
  artist?: string[];
  composers?: string[];
  performers?: TrackPerformer[];
}

interface TrackDetailPanelProps {
  tracks: PanelTrack[];
  index: number;
  multiDisc: boolean;
  /** Undefined while Navidrome is being read. */
  rip?: RipTracks | null;
  ripError?: string | null;
  onSelect: (index: number) => void;
  onClose: () => void;
}

const MOBILE = '(max-width: 768px)';
const SWIPE_CLOSE_PX = 80;
let openSheets = 0;

const formatDuration = (seconds?: number | null) =>
  seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : null;

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="track-panel-field">
    <div className="track-panel-label">{label}</div>
    <div className="track-panel-value">{children}</div>
  </div>
);

/**
 * Everything DexVault knows of one track, beside the track list: a drawer on
 * the right on a computer, a sheet from the bottom on a phone, which a swipe
 * down or the back button closes. ↑ and ↓ walk the tracks, Esc closes.
 */
const TrackDetailPanel: React.FC<TrackDetailPanelProps> = ({ tracks, index, multiDisc, rip, ripError, onSelect, onClose }) => {
  const track = tracks[index];
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ startY: number; dy: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keys reach the panel wherever the focus is in the album dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'ArrowDown' && index < tracks.length - 1) {
        event.preventDefault();
        onSelect(index + 1);
      } else if (event.key === 'ArrowUp' && index > 0) {
        event.preventDefault();
        onSelect(index - 1);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, tracks.length, onSelect]);

  // On a phone the back button closes the sheet, not the album. One history
  // entry for the sheet, whichever panel holds it: a panel unmounted and
  // mounted again at once (React's strict mode does so) keeps the entry, and
  // only a sheet really closed by its own button takes it back.
  useEffect(() => {
    if (!window.matchMedia?.(MOBILE).matches) return;
    openSheets += 1;
    if (!window.history.state?.trackPanel) window.history.pushState({ trackPanel: true }, '');
    const onPop = () => { if (!window.history.state?.trackPanel) onCloseRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      openSheets -= 1;
      window.removeEventListener('popstate', onPop);
      setTimeout(() => {
        if (openSheets === 0 && window.history.state?.trackPanel) window.history.back();
      }, 0);
    };
  }, []);

  useEffect(() => { bodyRef.current?.scrollTo?.({ top: 0 }); }, [index]);

  const onTouchStart = (event: React.TouchEvent) => {
    swipe.current = { startY: event.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (!swipe.current || !sheetRef.current) return;
    swipe.current.dy = Math.max(0, event.touches[0].clientY - swipe.current.startY);
    sheetRef.current.style.transform = `translateY(${swipe.current.dy}px)`;
  };
  const onTouchEnd = () => {
    if (!swipe.current || !sheetRef.current) return;
    const { dy } = swipe.current;
    swipe.current = null;
    sheetRef.current.style.transform = '';
    if (dy > SWIPE_CLOSE_PX) onClose();
  };

  if (!track) return null;

  const people = performersByPerson(track.performers || []);
  const file = rip?.found ? ripFileFor(rip.tracks, track.disc, Number(track.no)) : null;
  const position = multiDisc ? `Disc ${track.disc} · Track ${track.no}` : `Track ${track.no}`;

  // In <body>: inside the album dialog, whose ancestors Bootstrap transforms,
  // "position: fixed" would pin the panel to the dialog, not to the screen.
  return createPortal(
    <>
      <div className="track-panel-backdrop" onClick={onClose} />
      <aside ref={sheetRef} className="track-panel" role="dialog" aria-label={`Track details: ${track.title}`}>
        <div className="track-panel-head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="track-panel-grip" aria-hidden="true" />
          <div className="track-panel-nav">
            <span className="track-panel-position">{position}</span>
            <button type="button" className="track-panel-button" aria-label="Previous track" disabled={index === 0} onClick={() => onSelect(index - 1)}>
              <BsChevronUp />
            </button>
            <button type="button" className="track-panel-button" aria-label="Next track" disabled={index === tracks.length - 1} onClick={() => onSelect(index + 1)}>
              <BsChevronDown />
            </button>
            <button type="button" className="track-panel-button" aria-label="Close" onClick={onClose}>
              <BsX size={22} />
            </button>
          </div>
          <h5 className="track-panel-title">{track.title}</h5>
          {formatDuration(track.durationSec) && <div className="track-panel-duration">{formatDuration(track.durationSec)}</div>}
        </div>

        <div ref={bodyRef} className="track-panel-body">
          {track.work && track.work !== track.title && <Field label="Work">{track.work}</Field>}
          {(track.composers || []).length > 0 && (
            <Field label={track.composers!.length > 1 ? 'Composers' : 'Composer'}>{track.composers!.join(', ')}</Field>
          )}
          {(track.artist || []).length > 0 && <Field label="Track artist">{track.artist!.join(', ')}</Field>}
          {people.length > 0 && (
            <Field label="Performers">
              <ul className="track-panel-people">
                {people.map(person => (
                  <li key={person.name}>
                    <span className="track-panel-person">{person.name}</span>
                    <span className="track-panel-roles">{person.roles.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </Field>
          )}
          {!track.work && !(track.composers || []).length && !people.length && (
            <p className="track-panel-empty">No credits for this track. Edit the album to add them.</p>
          )}

          {(track.isrc || track.musicbrainzRecordingId) && (
            <div className="track-panel-section">
              {track.isrc && <Field label="ISRC"><code>{track.isrc}</code></Field>}
              {track.musicbrainzRecordingId && (
                <Field label="MusicBrainz">
                  <a href={`https://musicbrainz.org/recording/${track.musicbrainzRecordingId}`} target="_blank" rel="noopener noreferrer">
                    Recording
                  </a>
                </Field>
              )}
            </div>
          )}

          {rip?.configured !== false && (
            <div className="track-panel-section">
              <div className="track-panel-label">Rip</div>
              {ripError ? (
                <p className="track-panel-muted">Could not read Navidrome: {ripError}</p>
              ) : rip === undefined ? (
                <p className="track-panel-muted">Reading Navidrome…</p>
              ) : !rip?.found ? (
                <p className="track-panel-muted">Not in Navidrome yet.</p>
              ) : !file ? (
                <p className="track-panel-muted">No file at this position in the rip.</p>
              ) : (
                <>
                  <div className="track-panel-value">{ripFormat(file)}</div>
                  {ripSize(file) && <div className="track-panel-muted">{ripSize(file)}</div>}
                  {file.path && <div className="track-panel-path">{file.path}</div>}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body
  );
};

export default TrackDetailPanel;
