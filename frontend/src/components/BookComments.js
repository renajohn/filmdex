import React, { useState, useEffect } from 'react';
import { Form, Button, Row, Col, ListGroup, Modal } from 'react-bootstrap';
import { BsPencil, BsTrash, BsPlus, BsX } from 'react-icons/bs';
import bookCommentService from '../services/bookCommentService';
import './BookComments.css';

const BookComments = ({ bookId, onCommentsChange }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [formData, setFormData] = useState({ name: '', comment: '', date: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (bookId) {
      loadComments();
    }
  }, [bookId]);

  const loadComments = async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const fetchedComments = await bookCommentService.getCommentsByBookId(bookId);
      setComments(fetchedComments || []);
    } catch (error) {
      console.error('Error loading comments:', error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name || !formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.comment || !formData.comment.trim()) {
      newErrors.comment = 'Comment is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const commentData = {
        bookId: bookId,
        name: formData.name.trim(),
        comment: formData.comment.trim(),
        date: formData.date || new Date().toISOString()
      };

      if (editingComment) {
        await bookCommentService.updateComment(editingComment.id, commentData);
      } else {
        await bookCommentService.createComment(commentData);
      }

      await loadComments();
      handleCloseModal();
      if (onCommentsChange) {
        onCommentsChange();
      }
    } catch (error) {
      console.error('Error saving comment:', error);
      setErrors({ submit: error.message || 'Failed to save comment' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (comment) => {
    setEditingComment(comment);
    setFormData({
      name: comment.name,
      comment: comment.comment,
      date: comment.date ? comment.date.split('T')[0] : ''
    });
    setShowEditModal(true);
    setErrors({});
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    setLoading(true);
    try {
      await bookCommentService.deleteComment(id);
      await loadComments();
      if (onCommentsChange) {
        onCommentsChange();
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingComment(null);
    setFormData({ name: '', comment: '', date: new Date().toISOString().split('T')[0] });
    setShowEditModal(true);
    setErrors({});
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setEditingComment(null);
    setFormData({ name: '', comment: '', date: '' });
    setErrors({});
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <>
      <Form.Group className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <Form.Label className="mb-0">Comments</Form.Label>
          <Button 
            variant="outline-primary" 
            size="sm" 
            onClick={handleAddNew}
            disabled={!bookId || loading}
          >
            <BsPlus className="me-1" />
            Add Comment
          </Button>
        </div>
        
        {loading && comments.length === 0 ? (
          <div className="text-muted">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="text-muted">No comments yet. Click "Add Comment" to add one.</div>
        ) : (
          <ListGroup variant="flush" className="comments-list-group">
            {comments.map((comment) => (
              <ListGroup.Item key={comment.id} className="comment-list-item">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center mb-1">
                      <strong className="comment-name">{comment.name}</strong>
                      {comment.date && (
                        <span className="comment-date ms-2 text-muted">
                          {formatDate(comment.date)}
                        </span>
                      )}
                    </div>
                    <p className="comment-text mb-0">{comment.comment}</p>
                  </div>
                  <div className="comment-actions ms-2">
                    <Button
                      variant="link"
                      size="sm"
                      className="text-warning p-1"
                      onClick={() => handleEdit(comment)}
                      title="Edit comment"
                    >
                      <BsPencil />
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-danger p-1"
                      onClick={() => handleDelete(comment.id)}
                      title="Delete comment"
                    >
                      <BsTrash />
                    </Button>
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Form.Group>

      <Modal show={showEditModal} onHide={handleCloseModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingComment ? 'Edit Comment' : 'Add Comment'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errors.submit && (
            <div className="alert alert-danger">{errors.submit}</div>
          )}
          <Form.Group className="mb-3">
            <Form.Label>Name *</Form.Label>
            <Form.Control
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              isInvalid={!!errors.name}
              placeholder="Enter commenter name"
            />
            <Form.Control.Feedback type="invalid">
              {errors.name}
            </Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Date</Form.Label>
            <Form.Control
              type="date"
              value={formData.date}
              onChange={(e) => handleInputChange('date', e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Comment *</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={formData.comment}
              onChange={(e) => handleInputChange('comment', e.target.value)}
              isInvalid={!!errors.comment}
              placeholder="Enter comment text"
            />
            <Form.Control.Feedback type="invalid">
              {errors.comment}
            </Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : (editingComment ? 'Update' : 'Create')}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default BookComments;

