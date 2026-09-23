import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DropboxBackupCard, { formatAge } from './DropboxBackupCard';
import backupService, { DropboxStatus } from '../services/backupService';

vi.mock('../services/backupService', () => ({
  default: { getDropboxStatus: vi.fn(), runDropboxBackup: vi.fn() },
}));

const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const status = (over: Partial<DropboxStatus> = {}): DropboxStatus => ({
  configured: true, running: false, nextRunAt: new Date(Date.now() + 10 * HOUR).toISOString(),
  lastSuccessAt: ago(5 * HOUR), lastSuccessFile: 'dexvault_2026-09-24.zip', lastSuccessSize: 68 * 1024 * 1024,
  lastErrorAt: null, lastError: null, lastWarning: null, ...over,
});

const show = async (s: DropboxStatus) => {
  vi.mocked(backupService.getDropboxStatus).mockResolvedValue(s);
  render(<DropboxBackupCard />);
  await screen.findByText('Dropbox backup');
};

afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});

describe('formatAge', () => {
  it('parle en minutes, puis en heures, puis en jours', () => {
    expect(formatAge(5 * 60 * 1000)).toBe('5 min ago');
    expect(formatAge(5 * HOUR)).toBe('5 h ago');
    expect(formatAge(3 * 24 * HOUR)).toBe('3 days ago');
  });
});

describe('DropboxBackupCard', () => {
  it("explique les variables à définir quand rien n'est configuré", async () => {
    await show(status({ configured: false, nextRunAt: null, lastSuccessAt: null }));
    expect(screen.getByText(/DROPBOX_REFRESH_TOKEN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back up now' })).not.toBeInTheDocument();
  });

  it('affiche la dernière réussite sans alerte quand elle est récente', async () => {
    await show(status());
    expect(screen.getByText(/Last backup: 5 h ago \(68 MB\)/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("affiche l'erreur plus récente que la dernière réussite", async () => {
    await show(status({ lastErrorAt: ago(HOUR), lastError: 'Dropbox 401: expired_access_token' }));
    expect(screen.getByText(/Dropbox 401: expired_access_token/)).toBeInTheDocument();
  });

  it('alerte quand la dernière réussite a plus de 48 h', async () => {
    await show(status({ lastSuccessAt: ago(50 * HOUR) }));
    expect(screen.getByRole('alert')).toHaveTextContent('No successful Dropbox backup in the last 48 hours');
  });

  it("alerte quand aucune sauvegarde n'a jamais réussi", async () => {
    await show(status({ lastSuccessAt: null, lastSuccessFile: null, lastSuccessSize: null }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it("désactive le bouton pendant l'exécution puis recharge l'état", async () => {
    let finish: (v: { ok: boolean; status: DropboxStatus }) => void = () => {};
    vi.mocked(backupService.runDropboxBackup).mockImplementation(() => new Promise(r => { finish = r; }));
    await show(status({ lastSuccessAt: ago(50 * HOUR) }));

    const button = screen.getByRole('button', { name: 'Back up now' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /Backing up/ })).toBeDisabled();

    finish({ ok: true, status: status() });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("désactive le bouton quand l'exécution nocturne tourne déjà", async () => {
    await show(status({ running: true }));
    expect(screen.getByRole('button', { name: /Backing up/ })).toBeDisabled();
  });

  it('recharge l\'état toutes les 10 secondes pendant l\'exécution nocturne', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls: number[] = [];
      vi.mocked(backupService.getDropboxStatus).mockImplementation(() => {
        calls.push(Date.now());
        if (calls.length === 1) return Promise.resolve(status({ running: true }));
        return Promise.resolve(status());
      });
      render(<DropboxBackupCard />);
      await screen.findByText('Dropbox backup');
      expect(screen.getByRole('button', { name: /Backing up/ })).toBeDisabled();

      vi.advanceTimersByTime(10000);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
    } finally {
      vi.useRealTimers();
    }
  });
});
