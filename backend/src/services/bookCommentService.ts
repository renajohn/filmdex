import BookComment from '../models/bookComment';
import type { BookCommentFormatted, BookCommentCreateData, DeleteResult } from '../types';

interface CommentInput {
  bookId?: number;
  name?: string;
  comment?: string;
  date?: string;
}

interface NameSuggestion {
  name: string;
}

class BookCommentService {
  async initializeTables(): Promise<void> {
    try {
      await BookComment.createTable();
      console.log('Book comment tables initialized successfully');
    } catch (error) {
      console.error('Error initializing book comment tables:', error);
      throw error;
    }
  }

  async getCommentsByBookId(bookId: number): Promise<BookCommentFormatted[]> {
    try {
      return await BookComment.findByBookId(bookId) as BookCommentFormatted[];
    } catch (error) {
      console.error('Error getting comments for book:', error);
      throw error;
    }
  }

  async getCommentById(id: number): Promise<BookCommentFormatted> {
    try {
      const comment = await BookComment.findById(id) as BookCommentFormatted | null;
      if (!comment) {
        throw new Error('Comment not found');
      }
      return comment;
    } catch (error) {
      console.error('Error getting comment:', error);
      throw error;
    }
  }

  async createComment(commentData: CommentInput): Promise<BookCommentFormatted> {
    try {
      if (!commentData.bookId) {
        throw new Error('Book ID is required');
      }
      if (!commentData.name || !commentData.name.trim()) {
        throw new Error('Comment name is required');
      }
      if (!commentData.comment || !commentData.comment.trim()) {
        throw new Error('Comment text is required');
      }
      const createData: BookCommentCreateData = {
        bookId: commentData.bookId,
        name: commentData.name.trim(),
        comment: commentData.comment.trim(),
        date: commentData.date || new Date().toISOString()
      };
      return await BookComment.create(createData) as BookCommentFormatted;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  async updateComment(id: number, commentData: CommentInput): Promise<BookCommentFormatted> {
    try {
      const existing = await BookComment.findById(id) as BookCommentFormatted | null;
      if (!existing) {
        throw new Error('Comment not found');
      }
      if (commentData.name !== undefined && !commentData.name.trim()) {
        throw new Error('Comment name cannot be empty');
      }
      if (commentData.comment !== undefined && !commentData.comment.trim()) {
        throw new Error('Comment text cannot be empty');
      }
      return await BookComment.update(id, {
        name: commentData.name !== undefined ? commentData.name.trim() : existing.name,
        comment: commentData.comment !== undefined ? commentData.comment.trim() : existing.comment,
        date: existing.date // Preserve original date, never update it
      }) as BookCommentFormatted;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  async deleteComment(id: number): Promise<DeleteResult> {
    try {
      const result = await BookComment.delete(id) as DeleteResult;
      if (!result.deleted) {
        throw new Error('Comment not found');
      }
      return result;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  async getCommentNameSuggestions(query: string = ''): Promise<NameSuggestion[]> {
    try {
      return await BookComment.getCommentNameSuggestions(query) as NameSuggestion[];
    } catch (error) {
      console.error('Error getting comment name suggestions:', error);
      throw error;
    }
  }
}

export default new BookCommentService();
