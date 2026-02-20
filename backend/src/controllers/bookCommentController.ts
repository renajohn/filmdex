
import { Request, Response } from 'express';
import bookCommentService from '../services/bookCommentService';

const bookCommentController = {
  // Get all comments for a book
  getCommentsByBookId: async (req: Request, res: Response): Promise<void> => {
    try {
      const { bookId } = req.params;
      const comments = await bookCommentService.getCommentsByBookId(parseInt(bookId as string));
      res.json(comments);
    } catch (error) {
      console.error('Error getting comments:', error);
      res.status(500).json({ error: 'Failed to get comments' });
    }
  },

  // Get a single comment by ID
  getCommentById: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const comment = await bookCommentService.getCommentById(parseInt(id as string));
      res.json(comment);
    } catch (error) {
      console.error('Error getting comment:', error);
      if (error instanceof Error && error.message === 'Comment not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to get comment' });
      }
    }
  },

  // Create a new comment
  createComment: async (req: Request, res: Response): Promise<void> => {
    try {
      const commentData = req.body;
      const comment = await bookCommentService.createComment(commentData);
      res.status(201).json(comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      if (error instanceof Error && (
          error.message === 'Book ID is required' ||
          error.message === 'Comment name is required' ||
          error.message === 'Comment text is required')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create comment' });
      }
    }
  },

  // Update a comment
  updateComment: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const commentData = req.body;
      const comment = await bookCommentService.updateComment(parseInt(id as string), commentData);
      res.json(comment);
    } catch (error) {
      console.error('Error updating comment:', error);
      if (error instanceof Error && (
          error.message === 'Comment not found' ||
          error.message === 'Comment name cannot be empty' ||
          error.message === 'Comment text cannot be empty')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update comment' });
      }
    }
  },

  // Delete a comment
  deleteComment: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      await bookCommentService.deleteComment(parseInt(id as string));
      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      console.error('Error deleting comment:', error);
      if (error instanceof Error && error.message === 'Comment not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete comment' });
      }
    }
  },

  // Get comment name suggestions (from owners and comment names)
  getCommentNameSuggestions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { query } = req.query;
      const suggestions = await bookCommentService.getCommentNameSuggestions((query as string) || '');
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting comment name suggestions:', error);
      res.status(500).json({ error: 'Failed to get comment name suggestions' });
    }
  }
};

export default bookCommentController;
