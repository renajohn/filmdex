import React, { useEffect, useState } from 'react';
import { BsPauseFill, BsPlayFill, BsSkipBackwardFill, BsSkipForwardFill, BsLaptop } from 'react-icons/bs';
import remote, { chooseTarget, chosenTarget, targetOf, useRemotePlayers, type RemoteCommand, type RemotePlayer } from '../services/remote';
import Menu, { MenuChevron } from './shared/Menu';
import Dialog from './shared/Dialog';
import { TextField } from './shared/TextField';
import { usePlayer } from '../services/player';
import musicService from '../services/musicService';
import toast from './shared/Toast';
import Button from './shared/Button';
import './PlayerBar.css';
import './RemoteBar.css';

const BAR_HEIGHT = 54;
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * On a phone, the music playing on a computer, at the foot of the screen
 * where the player's own bar would be: what plays there and on which, its
 * place in the track, and ⏮ ⏯ ⏭ sent to it; Listen Next started there when
 * nothing plays. Out while this phone plays nothing itself, over its own bar
 * paused (a play kept from before) when the computer plays.
 */
const RemoteBar: React.FC = () => {
  const players = useRemotePlayers();
  const localShown = usePlayer(state => state.barShown);
  const localPlaying = usePlayer(state => state.playing);
  // The computer chosen in its menu, kept while it is there; else the last one started playing.
  const [chosen, setChosen] = useState<string | null>(() => chosenTarget());
  const target = targetOf(players, chosen);
  const [naming, setNaming] = useState<string | null>(null);
  // A toggle sent shows at once; the next report says how it went.
  const [pending, setPending] = useState<boolean | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { setPending(null); }, [target?.playing, target?.seenAt]);
  // The place in the track moves between reports.
  useEffect(() => {
    if (!target?.playing) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target?.playing]);

  // This phone's own bar comes first while it plays, or while it is out (a play kept from before, paused) and
  // the computer plays nothing; a computer playing covers this phone's bar paused.
  const out = Boolean(target) && !localPlaying && !(localShown && !target?.playing);
  useEffect(() => {
    if (localShown) return;
    document.documentElement.style.setProperty('--player-h', out ? `${BAR_HEIGHT}px` : '0px');
  }, [out, localShown]);

  if (!target || !out) return null;

  const send = (command: RemoteCommand) => remote.send(target.id, command).catch(e => toast((e as Error).message, { tone: 'danger' }));
  const playing = pending ?? target.playing;
  const position = Math.min(target.duration || Infinity, target.position + (target.playing ? Math.max(0, now - target.seenAt) / 1000 : 0));
  const cover = target.album?.cover ? musicService.getImageUrl(target.album.cover) : null;

  const pick = (id: string) => { setChosen(id); chooseTarget(id); };
  // Its name, a menu: the computers there, each with what it plays, to speak to another; and its name to give.
  const which = (
    <Menu drop="up" label="Which computer" trigger={(props, open) => (
      <button type="button" {...props} className="remote-bar-which">
        <BsLaptop aria-hidden="true" /> {target.online ? target.name : `${target.name}, away`}<MenuChevron open={open} />
      </button>
    )}>
      <Menu.Section title="Speak to" />
      {players.filter(p => p.online || p.id === target.id).map(p => (
        <Menu.Choice key={p.id} selected={p.id === target.id} onSelect={() => pick(p.id)}
          hint={!p.online ? 'away' : p.playing ? p.track?.title || p.album?.title || 'playing' : 'nothing playing'}>
          {p.name}
        </Menu.Choice>
      ))}
      <Menu.Separator />
      <Menu.Item onSelect={() => setNaming(target.name)}>Rename {target.name}…</Menu.Item>
    </Menu>
  );
  const naming_ = naming !== null && (
    <Dialog show onClose={() => setNaming(null)} title={`Name ${target.name}`} size="sm">
      <Dialog.Body>
        <TextField value={naming} autoFocus placeholder="MacBook du salon" aria-label="Its name" onChange={event => setNaming(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { void remote.rename(target.id, naming).then(() => setNaming(null)).catch(e => toast((e as Error).message, { tone: 'danger' })); } }} />
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="quiet" onClick={() => setNaming(null)}>Cancel</Button>
        <Button variant="primary" onClick={() => { void remote.rename(target.id, naming).then(() => setNaming(null)).catch(e => toast((e as Error).message, { tone: 'danger' })); }}>Keep it</Button>
      </Dialog.Footer>
    </Dialog>
  );

  return (
    <>
    {naming_}
    <div className={`player-bar player-bar-out remote-bar${target.online ? '' : ' remote-bar--away'}`} role="region" aria-label={`Playing on ${target.name}`}>
      {target.duration > 0 && (
        <div className={`player-bar-progress${playing ? '' : ' player-bar-progress--paused'}`} aria-hidden="true">
          <span style={{ width: `${Math.min(100, (position / target.duration) * 100)}%` }} />
        </div>
      )}
      <div className="player-bar-inner remote-bar-inner">
        {target.album ? (
          <>
            <span className="player-bar-cover remote-bar-cover">{cover ? <img src={cover} alt="" /> : <span className="player-bar-nocover" aria-hidden="true" />}</span>
            <div className="remote-bar-meta">
              <span className="remote-bar-track">{target.track?.title || target.album.title}</span>
              <span className="remote-bar-from">
                {which}
                {target.duration > 0 && ` · ${time(position)} / ${time(target.duration)}`}
              </span>
            </div>
            <div className="remote-bar-transport">
              <button type="button" className="player-bar-button" disabled={!target.online} onClick={() => send({ action: 'previous' })} aria-label="Previous"><BsSkipBackwardFill /></button>
              <button type="button" className="player-bar-button player-bar-play" disabled={!target.online}
                onClick={() => { setPending(!playing); void send({ action: 'toggle' }); }} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <BsPauseFill /> : <BsPlayFill />}
              </button>
              <button type="button" className="player-bar-button" disabled={!target.online} onClick={() => send({ action: 'next' })} aria-label="Next"><BsSkipForwardFill /></button>
            </div>
          </>
        ) : (
          <>
            <div className="remote-bar-meta">
              <span className="remote-bar-track">{which}</span>
              <span className="remote-bar-from">Nothing playing there</span>
            </div>
            <Button size="sm" icon={<BsPlayFill />} onClick={() => send({ action: 'listenNext' })}>Listen Next</Button>
          </>
        )}
      </div>
    </div>
    </>
  );
};

export default RemoteBar;
