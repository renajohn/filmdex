/**
 * localStorage that cannot take the page down with it.
 *
 * Every one of these accesses throws in a browser that blocks site data:
 * Safari in private browsing reports a zero quota and throws on write, a
 * locked-down profile throws on read, and in a test environment the object may
 * simply not be there. Several call sites sit inside useState initialisers and
 * render effects, so an exception loses the whole component tree rather than a
 * remembered sort order -- which is all that is actually at stake here.
 */

export const readStored = (key: string, fallback: string | null = null): string | null => {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
};

export const writeStored = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {
    // A preference we cannot remember is not worth interrupting anything for.
  }
};
