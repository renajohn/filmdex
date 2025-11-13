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
      // Check if we're in ingress mode - if so, use direct link approach
      const pathname = window.location.pathname;
      const isIngressMode = pathname.includes('/api/hassio_ingress/');
      
      if (isIngressMode) {
        // In ingress mode, use a direct link approach
        // Extract ingress path if available
        let ingressPath = '';
        if (pathname.includes('/api/hassio_ingress/')) {
          const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
          if (match) {
            ingressPath = match[0];
          }
        }
        
        // Use full URL with ingress path
        const fullUrl = ingressPath ? `${ingressPath}${url}` : url;
        
        // Create a temporary link and trigger download
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = filename;
        link.target = '_blank'; // Open in new tab as fallback
        document.body.appendChild(link);
        link.click();
        
        // Cleanup after a short delay
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
        
        return;
      }
      
      // Normal mode: Fetch the file as a blob
      const response = await fetch(url);
      
      if (!response.ok) {
        // Try to parse error as JSON, fallback to status text
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (e) {
          // Not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      // Get the blob
      const blob = await response.blob();
      
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

