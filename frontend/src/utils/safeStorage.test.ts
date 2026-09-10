import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readStored, writeStored } from './safeStorage';

const withStorage = (impl: unknown) =>
  Object.defineProperty(window, 'localStorage', { value: impl, configurable: true, writable: true });

/**
 * A working store, installed explicitly.
 *
 * The runtime does not reliably provide one: Node 26 ships an experimental
 * localStorage that shadows the jsdom implementation and is undefined unless
 * --localstorage-file is passed, so `window.localStorage` here is the very
 * "no storage object at all" case the last test covers.
 */
const fakeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v)
  };
};

beforeEach(() => {
  withStorage(fakeStorage());
});

afterEach(() => {
  withStorage(undefined);
});

describe('readStored', () => {
  it('returns the stored value', () => {
    writeStored('k', 'stored');

    expect(readStored('k')).toBe('stored');
  });

  it('returns the fallback when nothing is stored', () => {
    expect(readStored('never-written', 'title')).toBe('title');
  });

  it('keeps an empty string rather than treating it as missing', () => {
    writeStored('empty', '');

    expect(readStored('empty', 'fallback')).toBe('');
  });

  it('returns the fallback when the browser refuses to read', () => {
    // A locked-down profile throws rather than answering.
    withStorage({
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }
    });

    expect(readStored('k', 'title')).toBe('title');
  });

  it('returns the fallback when there is no storage object at all', () => {
    withStorage(undefined);

    expect(readStored('k', 'title')).toBe('title');
  });
});

describe('writeStored', () => {
  it('stores the value', () => {
    writeStored('k', 'v');

    expect(readStored('k')).toBe('v');
  });

  it('stays quiet when the quota is zero', () => {
    // Safari in private browsing throws on every write.
    withStorage({
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
    });

    expect(() => writeStored('k', 'v')).not.toThrow();
  });

  it('stays quiet when there is no storage object at all', () => {
    withStorage(undefined);

    expect(() => writeStored('k', 'v')).not.toThrow();
  });
});
