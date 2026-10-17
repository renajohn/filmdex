import React from 'react';
import './NowPlayingBars.css';

/** Three bars that bounce while DexVault plays, and stand still while it is paused. */
const NowPlayingBars: React.FC<{ playing: boolean }> = ({ playing }) => (
  <span className={`now-playing-bars${playing ? ' playing' : ''}`} role="img" aria-label={playing ? 'Playing' : 'Paused'}>
    <i /><i /><i />
  </span>
);

export default NowPlayingBars;
