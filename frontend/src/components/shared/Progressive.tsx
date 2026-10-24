import React, { useEffect, useState } from 'react';

/**
 * A grid of hundreds of cards drawn in two goes: those of the first screen at
 * once, so that a section clicked shows in a moment, the rest a frame later.
 * Drawn whole in one go, a section kept the click waiting half a second.
 */
const Progressive: React.FC<{ children: React.ReactNode; first?: number }> = ({ children, first = 60 }) => {
  const [all, setAll] = useState(false);
  useEffect(() => {
    // After the first screen is painted: a frame, then a task.
    let timer = 0;
    const frame = requestAnimationFrame(() => { timer = window.setTimeout(() => setAll(true), 0); });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);
  const items = React.Children.toArray(children);
  return <>{all ? items : items.slice(0, first)}</>;
};

export default Progressive;
