const BookComment = require('../models/bookComment');

class BookCommentService {
  async initializeTables() {
    try {
      await BookComment.createTable();
      console.log('Book comment tables initialized successfully');
    } catch (error) {
      console.error('Error initializing book comment tables:', error);
      throw error;
    }
  }

  async getCommentsByBookId(bookId) {
    try {
      return await BookComment.findByBookId(bookId);
    } catch (error) {
      console.error('Error getting comments for book:', error);
      throw error;
    }
  }

  async getCommentById(id) {
    try {
      const comment = await BookComment.findById(id);
      if (!comment) {
        throw new Error('Comment not found');
      }
      return comment;
    } catch (error) {
      console.error('Error getting comment:', error);
      throw error;
    }
  }

  async createComment(commentData) {
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
      return await BookComment.create({
        bookId: commentData.bookId,
        name: commentData.name.trim(),
        comment: commentData.comment.trim(),
        date: commentData.date || new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  async updateComment(id, commentData) {
    try {
      const existing = await BookComment.findById(id);
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
      });
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  async deleteComment(id) {
    try {
      const result = await BookComment.delete(id);
      if (!result.deleted) {
        throw new Error('Comment not found');
      }
      return result;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  async getCommentNameSuggestions(query = '') {
    try {
      return await BookComment.getCommentNameSuggestions(query);
    } catch (error) {
      console.error('Error getting comment name suggestions:', error);
      throw error;
    }
  }
}

module.exports = new BookCommentService();

