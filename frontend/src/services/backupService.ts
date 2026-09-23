export interface DropboxStatus {
  configured: boolean;
  running: boolean;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  lastSuccessFile: string | null;
  lastSuccessSize: number | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
}

class BackupService {
  async getBaseUrl(): Promise<string> {
    return '/api';
  }

  async createBackup(): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error((error.error as string) || 'Failed to create backup');
    }

    return await response.json();
  }

  async listBackups(): Promise<unknown[]> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/list`);

    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error((error.error as string) || 'Failed to list backups');
    }

    const data = await response.json() as Record<string, unknown>;
    return (data.backups as unknown[]) || [];
  }

  async getDropboxStatus(): Promise<DropboxStatus> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/dropbox/status`);
    if (!response.ok) {
      throw new Error('Failed to load the Dropbox backup status');
    }
    return await response.json() as DropboxStatus;
  }

  async runDropboxBackup(): Promise<{ ok: boolean; status: DropboxStatus }> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/dropbox/run`, { method: 'POST' });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new Error((data.error as string) || 'Failed to run the Dropbox backup');
    }
    return data as unknown as { ok: boolean; status: DropboxStatus };
  }

  async downloadBackup(filename: string): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}/backup/download/${encodeURIComponent(filename)}`;

    try {
      // Use fetch() and blob approach
      console.log('Downloading backup from URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/zip, application/octet-stream, */*'
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', {
        'Content-Type': response.headers.get('Content-Type'),
        'Content-Disposition': response.headers.get('Content-Disposition'),
        'Content-Length': response.headers.get('Content-Length')
      });

      if (!response.ok) {
        // Try to parse error as JSON, fallback to status text
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const error = await response.json() as Record<string, unknown>;
          errorMessage = (error.error as string) || errorMessage;
        } catch (e) {
          // Not JSON, try to get text
          try {
            const text = await response.text();
            if (text) {
              errorMessage = text.substring(0, 200); // Limit error message length
            }
          } catch (e2) {
            // Use status text
            errorMessage = response.statusText || errorMessage;
          }
        }
        throw new Error(errorMessage);
      }

      // Check if we got HTML or JSON instead of a file
      const contentType = response.headers.get('Content-Type');
      if (contentType) {
        if (contentType.includes('text/html')) {
          // Try to read the HTML to see what error we got
          const text = await response.text();
          console.error('Received HTML instead of file:', text.substring(0, 500));
          throw new Error('Received HTML instead of file. The download URL may be incorrect.');
        }
        if (contentType.includes('application/json')) {
          // Try to read the JSON error
          const text = await response.text();
          console.error('Received JSON instead of file:', text.substring(0, 500));
          try {
            const error = JSON.parse(text) as Record<string, unknown>;
            throw new Error((error.error as string) || 'Server returned an error instead of the file');
          } catch (e) {
            throw new Error('Received JSON response instead of file. The download URL may be incorrect.');
          }
        }
      }

      // Get the blob
      const blob = await response.blob();

      console.log('Blob size:', blob.size, 'bytes');
      console.log('Blob type:', blob.type);

      // Verify blob is not empty
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      // Additional check: if blob type suggests it's not a zip file
      if (blob.type && blob.type !== 'application/zip' && blob.type !== 'application/octet-stream' && !blob.type.includes('zip')) {
        // If it's a small file and not a zip, it might be an error message
        if (blob.size < 10000) { // Less than 10KB
          try {
            const text = await blob.text();
            console.error('Received non-zip file (small size):', text.substring(0, 500));
            throw new Error('Received non-zip file. The server may have returned an error.');
          } catch (e) {
            // If we can't read as text, it might be binary but wrong type
            if ((e as Error).message.includes('non-zip')) {
              throw e;
            }
            // Otherwise continue - might be a valid binary file
          }
        }
      }

      // Get filename from Content-Disposition header or use provided filename
      const contentDisposition = response.headers.get('Content-Disposition');
      let downloadFilename = filename;
      if (contentDisposition) {
        // Try to match quoted filename first: filename="something"
        let filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
        if (!filenameMatch) {
          // Fallback to unquoted: filename=something
          filenameMatch = contentDisposition.match(/filename=([^;]+)/i);
        }
        if (filenameMatch) {
          downloadFilename = decodeURIComponent(filenameMatch[1].trim());
        }
      }

      // Create a blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading backup:', error);
      throw error;
    }
  }

  async restoreBackup(filename: string): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename })
    });

    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error((error.error as string) || 'Failed to restore backup');
    }

    return await response.json();
  }

  async uploadAndRestoreBackup(file: File): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const formData = new FormData();
    formData.append('backup', file);

    const response = await fetch(`${baseUrl}/backup/upload-restore`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error((error.error as string) || 'Failed to upload and restore backup');
    }

    return await response.json();
  }

  async deleteBackup(filename: string): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error((error.error as string) || 'Failed to delete backup');
    }

    return await response.json();
  }

  async cleanupRestoreBackups(): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/cleanup-restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error((error.error as string) || 'Failed to cleanup restore backups');
    }

    return await response.json();
  }
}

const backupService = new BackupService();
export default backupService;
