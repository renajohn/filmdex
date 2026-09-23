import { Request, Response } from 'express';
import dropbox from '../services/dropboxService';
import nightly, { BackupAlreadyRunningError, BACKUP_HOUR, nextRunAt } from '../services/nightlyBackupService';

const currentStatus = () => {
  const configured = dropbox.isConfigured();
  return {
    configured,
    running: nightly.isRunning(),
    nextRunAt: configured ? nextRunAt(BACKUP_HOUR, new Date()).toISOString() : null,
    ...nightly.readStatus(),
  };
};

const dropboxBackupController = {
  getStatus(req: Request, res: Response): void {
    res.json(currentStatus());
  },

  // Waits for the upload: the button on the Backup page shows the outcome right away.
  async run(req: Request, res: Response): Promise<void> {
    if (!dropbox.isConfigured()) {
      res.status(400).json({ error: 'Dropbox backup is not configured' });
      return;
    }
    try {
      const { ok } = await nightly.runOnce();
      res.json({ ok, status: currentStatus() });
    } catch (error) {
      if (error instanceof BackupAlreadyRunningError) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: (error as Error).message });
    }
  },
};

export default dropboxBackupController;
