import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BsX } from 'react-icons/bs';
import musicService, { type TrackLyrics } from '../services/musicService';
import { player, usePlayer } from '../services/player';
import Button, { IconButton } from './shared/Button';
import { Loading } from './shared/Spinner';
import './LyricsPanel.css';

/** A line of a timed text; no words is a silence of the voice, shown as three dots. */
export interface LyricLine {
  at: number;
  text: string | null;
}

/** The eye reads a little before the voice sings: a line lights a fifth of a second early. */
const LEAD_SEC = 0.2;
/** Scrolled by hand, the words go back to the song after this long. */
const FOLLOW_AGAIN_MS = 5000;
/** An empty line opens a silence when the next words are this far. */
const SILENCE_SEC = 4;
/** Without an empty line, a gap this long after a line is a silence too, from a while after it was sung. */
const LONG_GAP_SEC = 12;
const SILENCE_AFTER_SEC = 6;
/** The line sung stands at this height of the panel. */
const ANCHOR = 0.3;

/**
 * The lines of an LRC text ("[mm:ss.xx] words"), in order, with the
 * silences of the voice: before the first words, at an empty line, in a long
 * gap. A line sung more than once carries all its times.
 */
export const parseLrc = (lrc: string): LyricLine[] => {
  const timed: Array<{ at: number; text: string }> = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/^(\s*\[[^\]]*\])+\s?/, '').trim();
    for (const stamp of stamps) timed.push({ at: Number(stamp[1]) * 60 + Number(stamp[2]), text });
  }
  timed.sort((a, b) => a.at - b.at);

  const lines: LyricLine[] = [];
  if (timed.length > 0 && timed[0].at > SILENCE_SEC) lines.push({ at: 0, text: null });
  timed.forEach((line, i) => {
    const next = timed[i + 1];
    if (!line.text) {
      if (next && next.at - line.at > SILENCE_SEC) lines.push({ at: line.at, text: null });
      return;
    }
    lines.push(line);
    if (next?.text && next.at - line.at > LONG_GAP_SEC) lines.push({ at: line.at + SILENCE_AFTER_SEC, text: null });
  });
  return lines;
};

/** The line sung at `seconds`: the last to have started, -1 before the first. */
export const lineAt = (lines: LyricLine[], seconds: number): number => {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i].at <= seconds; i++) index = i;
  return index;
};

/**
 * How far the lines may be moved by hand: from the first line to the last
 * standing where the line sung stands, as the song itself takes them.
 */
export const withinLines = (y: number, anchor: number, firstTop: number, lastTop: number): number =>
  Math.min(anchor - firstTop, Math.max(anchor - lastTop, y));

/**
 * The words of the track playing, in a card at the bottom left above the
 * player's bar, on a desktop: the line sung in white, the cover's colours
 * turning slowly behind. A click on a line plays from there. A record's card
 * opens beside it, on the right. It lies on the page's body, as the dialogs
 * do, to stand above a card's shade.
 */
const LyricsPanel: React.FC = () => {
  const open = usePlayer(state => state.lyricsOpen && state.barShown);
  const album = usePlayer(state => state.album);
  const track = usePlayer(state => state.tracks[state.index]);
  const albumId = album?.id ?? null;
  const shown = Boolean(open && album && albumId != null && track);
  const disc = track?.disc;
  const no = track?.no;

  // Undefined while they are looked for, null when they could not be read.
  const [lyrics, setLyrics] = useState<TrackLyrics | null | undefined>(undefined);
  useEffect(() => {
    if (!shown || albumId == null || disc == null || no == null) return undefined;
    let current = true;
    setLyrics(undefined);
    musicService.getLyrics(albumId, disc, no)
      .then(found => { if (current) setLyrics(found); })
      .catch(() => { if (current) setLyrics(null); });
    return () => { current = false; };
  }, [shown, albumId, disc, no]);

  const lines = useMemo(() => (lyrics?.synced ? parseLrc(lyrics.synced) : []), [lyrics]);
  const [index, setIndex] = useState(-1);
  const [following, setFollowing] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const offset = useRef(0);
  const followTimer = useRef<number | undefined>(undefined);

  // The line sung, read from the audio at each frame: the bar's position moves a few times a second only.
  useEffect(() => {
    setIndex(-1);
    setFollowing(true);
    offset.current = 0;
    if (!shown || lines.length === 0) return undefined;
    let frame = 0;
    const tick = () => {
      setIndex(lineAt(lines, player.currentTime() + LEAD_SEC));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [shown, lines]);

  const moveTo = useCallback((y: number, smooth = true) => {
    offset.current = y;
    const list = listRef.current;
    if (!list) return;
    list.classList.toggle('lyrics-panel-still', !smooth);
    list.style.transform = `translateY(${y}px)`;
  }, []);

  const place = useCallback(() => {
    const box = boxRef.current;
    const line = listRef.current?.children[Math.max(0, index)] as HTMLElement | undefined;
    if (box && line) moveTo(box.clientHeight * ANCHOR - line.offsetTop);
  }, [index, moveTo]);

  useLayoutEffect(() => {
    if (following) place();
  }, [following, place]);

  useEffect(() => {
    if (!following) return undefined;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [following, place]);

  const followAgain = useCallback(() => {
    window.clearTimeout(followTimer.current);
    setFollowing(true);
  }, []);
  useEffect(() => () => window.clearTimeout(followTimer.current), []);

  // Scrolled by hand, the words stop following the song a while. Not passive: the page must not scroll beneath.
  useEffect(() => {
    const box = boxRef.current;
    if (!shown || !box || lines.length === 0) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const lines = listRef.current?.children;
      const first = lines?.[0] as HTMLElement | undefined;
      const last = lines?.[lines.length - 1] as HTMLElement | undefined;
      if (!first || !last) return;
      moveTo(withinLines(offset.current - event.deltaY, box.clientHeight * ANCHOR, first.offsetTop, last.offsetTop), false);
      setFollowing(false);
      window.clearTimeout(followTimer.current);
      followTimer.current = window.setTimeout(() => setFollowing(true), FOLLOW_AGAIN_MS);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [shown, lines, moveTo]);

  if (!shown || !album || !track) return null;

  const playFrom = (line: LyricLine) => {
    player.seek(Math.max(0, line.at - 0.05));
    if (!player.getState().playing) player.toggle(true);
    followAgain();
  };

  let body: React.ReactNode;
  if (lyrics === undefined) {
    body = <Loading className="lyrics-panel-wait">Looking for the words…</Loading>;
  } else if (lyrics?.status === 'instrumental') {
    body = <p className="lyrics-panel-none">An instrumental: no words to sing.</p>;
  } else if (lines.length > 0) {
    body = (
      // Read by hand, every line comes clear; back with the song, those far from it blur again.
      <div className={`lyrics-panel-lines${following ? '' : ' lyrics-panel-browsing'}`} ref={boxRef}>
        <ol ref={listRef}>
          {lines.map((line, i) => {
            const state = i === index ? ' lyrics-panel-now' : i < index ? ' lyrics-panel-past' : '';
            const far = Math.abs(i - index) > 2 ? ' lyrics-panel-far' : '';
            return line.text === null ? (
              <li key={i} className={`lyrics-panel-silence${state}`} onClick={() => playFrom(line)} aria-label="Instrumental break">
                <i /><i /><i />
              </li>
            ) : (
              <li key={i} className={`${state}${far}`.trim() || undefined} onClick={() => playFrom(line)}
                aria-current={i === index ? 'true' : undefined}>
                {line.text}
              </li>
            );
          })}
        </ol>
        {!following && (
          <Button size="sm" className="lyrics-panel-follow" onClick={followAgain}>Back to the song</Button>
        )}
      </div>
    );
  } else if (lyrics?.plain) {
    body = (
      <div className="lyrics-panel-untimed">
        <span className="lyrics-panel-tag">Not timed</span>
        {lyrics.plain.split('\n').map((line, i) => (line.trim() ? <p key={i}>{line}</p> : <br key={i} />))}
      </div>
    );
  } else {
    body = <p className="lyrics-panel-none">No words found for this track.</p>;
  }

  return createPortal(
    <aside className="lyrics-panel" aria-label="Lyrics">
      {album.cover && (
        // Two copies of the cover turning against each other, blurred: the panel takes the album's colours.
        <div className="lyrics-panel-cover" key={album.cover} aria-hidden="true">
          <i style={{ backgroundImage: `url("${album.cover}")` }} />
          <i style={{ backgroundImage: `url("${album.cover}")` }} />
        </div>
      )}
      {/* No head: the bar below says the track, its album and its cover already. */}
      <IconButton label="Close lyrics" className="lyrics-panel-close" onClick={() => player.showLyrics(false)}><BsX /></IconButton>
      {body}
    </aside>,
    document.body,
  );
};

export default LyricsPanel;
