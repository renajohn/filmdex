/** A computer, with a pointer: the one that plays music and is told what to by a remote; a phone or a tablet is the remote. */
export const isComputer = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
