class BookCommentService {
  private baseUrl: string | null;
  private configPromise: Promise<string> | null;

  constructor() {
    this.baseUrl = null;
    this.configPromise = null;
  }

  async getBaseUrl(): Promise<string> {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    if (!this.configPromise) {
      this.configPromise = this.loadConfig();
    }

    this.baseUrl = await this.configPromise;
    return this.baseUrl;
  }

  async loadConfig(): Promise<string> {
    const pathname = window.location.pathname;

    if (pathname.includes('/api/hassio_ingress/')) {
      const match = pathname.match(/\/api\/hassio_ingress\/[^/]+/);
      if (match) {
        const ingressPath = match[0];
        return `${ingressPath}/api`;
      }
    }

    return '/api';
  }

  async getCommentsByBookId(bookId: number | string): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/${bookId}/comments`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw error;
    }
  }

  async getCommentById(id: number | string): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/comments/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching comment:', error);
      throw error;
    }
  }

  async createComment(commentData: Record<string, unknown>): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commentData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        const errorMessage = (errorData.error as string) || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  async updateComment(id: number | string, commentData: Record<string, unknown>): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/comments/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commentData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        const errorMessage = (errorData.error as string) || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  async deleteComment(id: number | string): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const response = await fetch(`${baseUrl}/books/comments/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  async getCommentNameSuggestions(query: string = ''): Promise<unknown> {
    try {
      const baseUrl = await this.getBaseUrl();
      const searchQuery = query ? `?query=${encodeURIComponent(query)}` : '';
      const response = await fetch(`${baseUrl}/books/comments/autocomplete/names${searchQuery}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching comment name suggestions:', error);
      throw error;
    }
  }
}

const bookCommentServiceInstance = new BookCommentService();
export default bookCommentServiceInstance;
