import { useEffect, useRef } from 'react';
import { player, usePlayer } from '../services/player';
import { listenNextQueue } from '../services/listenNextQueue';
import { playAlbumById } from '../utils/playAlbum';
import remote, { deviceName, type RemoteCommand } from '../services/remote';
import toast from './shared/Toast';

/** How often the place in a track is told, while it plays: the remote's bar moves between. */
const POSITION_EVERY_MS = 10_000;

/** A command from the remote, done here as a click on the bar would. */
const run = async (command: RemoteCommand): Promise<void> => {
  switch (command.action) {
    case 'toggle': player.toggle(); break;
    case 'next': player.next(); break;
    case 'previous': player.previous(); break;
    case 'listenNext':
      if (!(await listenNextQueue.start())) toast('Listen Next has nothing to play', { tone: 'warning' });
      break;
    case 'playAlbum':
      if (!(await playAlbumById(command.albumId, undefined, command.index || 0, false, command.disc || 0))) {
        toast('Not in Navidrome: this album has no rip to play', { tone: 'warning' });
      }
      break;
    default: break;
  }
};

/**
 * On a computer, the player told to the remote: what it plays, as it changes
 * and every few seconds while it plays; and the remote's commands, done.
 * Nothing on screen.
 */
const RemoteReporter: React.FC = () => {
  const album = usePlayer(state => state.album);
  const tracks = usePlayer(state => state.tracks);
  const index = usePlayer(state => state.index);
  const playing = usePlayer(state => state.playing);
  const name = useRef(deviceName());

  const tell = () => {
    const state = player.getState();
    const track = state.tracks[state.index];
    remote.report({
      name: name.current,
      playing: state.playing,
      album: state.album ? { id: state.album.id, title: state.album.title, artist: state.album.artist, cover: track?.cover || state.album.cover } : null,
      track: track ? { title: track.title, disc: track.disc, no: track.no } : null,
      index: state.index,
      count: state.tracks.length,
      position: Math.round(player.currentTime()),
      duration: Math.round(state.duration || track?.durationSec || 0),
    }).catch(() => undefined);
  };

  // Its commands, from the remote, for as long as the page is open.
  useEffect(() => remote.listen(command => { void run(command).catch(e => toast((e as Error).message, { tone: 'danger' })); }), []);

  // What it plays, at once when it changes.
  useEffect(() => { tell(); }, [album, tracks, index, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Its place in the track, now and then while it plays.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(tell, POSITION_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

export default RemoteReporter;
