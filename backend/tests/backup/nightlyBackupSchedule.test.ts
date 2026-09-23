const previousTz = process.env.TZ;
// Must be set before any Date is built: the schedule is computed in local time.
process.env.TZ = 'Europe/Zurich';

import { BACKUP_HOUR, isStale, msUntilNext, nextRunAt } from '../../src/services/nightlyBackupService';

const DAY = 24 * 3600 * 1000;
const at = (iso: string) => new Date(iso);

// Jest may reuse this worker for other files: give them back their time zone.
afterAll(() => { if (previousTz === undefined) delete process.env.TZ; else process.env.TZ = previousTz; });

describe('nextRunAt', () => {
  it('prend 3 h le jour même quand il n\'est pas encore 3 h', () => {
    expect(nextRunAt(BACKUP_HOUR, at('2026-09-23T22:30:00Z')).toISOString()).toBe('2026-09-24T01:00:00.000Z');
  });

  it('prend le lendemain quand 3 h est passé ou atteint', () => {
    expect(nextRunAt(BACKUP_HOUR, at('2026-09-24T01:00:00Z')).toISOString()).toBe('2026-09-25T01:00:00.000Z');
    expect(nextRunAt(BACKUP_HOUR, at('2026-09-24T10:00:00Z')).toISOString()).toBe('2026-09-25T01:00:00.000Z');
  });

  it('tombe une fois a 3 h la nuit du passage a l\'heure d\'ete', () => {
    // 29 mars 2026 : 2 h CET devient 3 h CEST ; 3 h CEST = 01:00Z.
    expect(nextRunAt(BACKUP_HOUR, at('2026-03-28T23:30:00Z')).toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('tombe une fois a 3 h la nuit du retour a l\'heure d\'hiver', () => {
    // 25 octobre 2026 : 3 h CEST redevient 2 h CET ; 3 h CET = 02:00Z.
    expect(nextRunAt(BACKUP_HOUR, at('2026-10-24T22:30:00Z')).toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });

  it('garde 3 h le lendemain d\'un changement d\'heure', () => {
    expect(nextRunAt(BACKUP_HOUR, at('2026-10-25T02:00:00Z')).toISOString()).toBe('2026-10-26T02:00:00.000Z');
  });
});

describe('msUntilNext', () => {
  it('donne le delai jusqu\'a la prochaine execution', () => {
    expect(msUntilNext(BACKUP_HOUR, at('2026-09-23T22:30:00Z'))).toBe(2.5 * 3600 * 1000);
  });
});

describe('isStale', () => {
  const status = (lastSuccessAt: string | null) => ({
    lastSuccessAt, lastSuccessFile: null, lastSuccessSize: null, lastErrorAt: null, lastError: null, lastWarning: null,
  });

  it('est vrai sans aucune reussite', () => {
    expect(isStale(status(null), at('2026-09-24T12:00:00Z'), DAY)).toBe(true);
  });

  it('compare l\'age de la derniere reussite au seuil', () => {
    expect(isStale(status('2026-09-24T01:00:00Z'), at('2026-09-24T12:00:00Z'), DAY)).toBe(false);
    expect(isStale(status('2026-09-22T01:00:00Z'), at('2026-09-24T12:00:00Z'), DAY)).toBe(true);
  });
});
