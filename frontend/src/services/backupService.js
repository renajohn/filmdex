class BackupService {
  constructor() {
    this.baseUrl = null;
    this.configPromise = null;
  }

  async getBaseUrl() {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    if (this.configPromise) {
      return await this.configPromise;
    }

    this.configPromise = this.loadConfig();
    this.baseUrl = await this.configPromise;
    return this.baseUrl;
  }

  async loadConfig() {
    // Detect if we're running in Home Assistant ingress mode
    const pathname = window.location.pathname;
    
    if (pathname.includes('/api/hassio_ingress/')) {
      // Extract the ingress path from the current URL
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        return `${ingressPath}/api`;
      }
    }
    
    // Default to /api for normal mode
    return '/api';
  }

  async createBackup() {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create backup');
    }

    return await response.json();
  }

  async listBackups() {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/list`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list backups');
    }

    const data = await response.json();
    return data.backups || [];
  }

  async downloadBackup(filename) {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}/backup/download/${encodeURIComponent(filename)}`;
    
    try {
      console.log('Downloading backup from URL:', url);
      
      // Always use fetch() to get the file as a blob
      // This works in both normal and ingress mode
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
          const error = await response.json();
          errorMessage = error.error || errorMessage;
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
      
      // Check if we got HTML or JSON instead of a file (common in ingress mode if route is wrong)
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
            const error = JSON.parse(text);
            throw new Error(error.error || 'Server returned an error instead of the file');
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
            if (e.message.includes('non-zip')) {
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

  async restoreBackup(filename) {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to restore backup');
    }

    return await response.json();
  }

  async uploadAndRestoreBackup(file) {
    const baseUrl = await this.getBaseUrl();
    const formData = new FormData();
    formData.append('backup', file);

    const response = await fetch(`${baseUrl}/backup/upload-restore`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload and restore backup');
    }

    return await response.json();
  }

  async deleteBackup(filename) {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete backup');
    }

    return await response.json();
  }

  async cleanupRestoreBackups() {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}/backup/cleanup-restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cleanup restore backups');
    }

    return await response.json();
  }
}

const backupService = new BackupService();
export default backupService;

