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
  lastErrorAt: null, lastError: null, lastWarning: null, lastRefused: false, ...over,
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

  it("n'affiche pas le bouton Back up anyway quand l'erreur n'est pas un refus", async () => {
    await show(status({ lastErrorAt: ago(HOUR), lastError: 'Dropbox 401: expired_access_token', lastRefused: false }));
    expect(screen.queryByRole('button', { name: 'Back up anyway' })).not.toBeInTheDocument();
  });

  it("affiche le bouton Back up anyway quand la dernière erreur est un refus", async () => {
    await show(status({ lastErrorAt: ago(HOUR), lastError: 'Refused: the collection is empty (0 items). Nothing was uploaded.', lastRefused: true }));
    expect(screen.getByRole('button', { name: 'Back up anyway' })).toBeInTheDocument();
  });

  it("n'affiche pas Back up anyway quand le refus est plus ancien que la dernière réussite", async () => {
    await show(status({ lastSuccessAt: ago(HOUR), lastErrorAt: ago(2 * HOUR), lastError: 'Refused: the collection is empty (0 items). Nothing was uploaded.', lastRefused: true }));
    expect(screen.queryByRole('button', { name: 'Back up anyway' })).not.toBeInTheDocument();
  });

  it('force la sauvegarde quand on clique sur Back up anyway', async () => {
    vi.mocked(backupService.runDropboxBackup).mockResolvedValue({ ok: true, status: status() });
    await show(status({ lastErrorAt: ago(HOUR), lastError: 'Refused: the collection is empty (0 items). Nothing was uploaded.', lastRefused: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Back up anyway' }));

    await waitFor(() => expect(backupService.runDropboxBackup).toHaveBeenCalledWith(true));
  });

  it("désactive Back up anyway pendant une exécution", async () => {
    let finish: (v: { ok: boolean; status: DropboxStatus }) => void = () => {};
    vi.mocked(backupService.runDropboxBackup).mockImplementation(() => new Promise(r => { finish = r; }));
    await show(status({ lastErrorAt: ago(HOUR), lastError: 'Refused: the collection is empty (0 items). Nothing was uploaded.', lastRefused: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Back up anyway' }));
    expect(screen.getByRole('button', { name: 'Back up anyway' })).toBeDisabled();

    finish({ ok: true, status: status() });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
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

  it("efface l'erreur de requête après un rechargement réussi", async () => {
    const initial = status();
    let resolveSecondLoad: (s: DropboxStatus) => void = () => {};
    let callCount = 0;
    vi.mocked(backupService.getDropboxStatus).mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve(initial);
      return new Promise(resolve => { resolveSecondLoad = resolve; });
    });
    vi.mocked(backupService.runDropboxBackup).mockRejectedValue(new Error('Network error'));

    render(<DropboxBackupCard />);
    await screen.findByText('Dropbox backup');

    const button = screen.getByRole('button', { name: 'Back up now' });
    fireEvent.click(button);

    // handleRun's catch sets the error, then reloads; the reload is still pending here.
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());

    // The pending reload now succeeds: the stale error must be cleared.
    resolveSecondLoad(initial);
    await waitFor(() => expect(screen.queryByText('Network error')).not.toBeInTheDocument());
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
