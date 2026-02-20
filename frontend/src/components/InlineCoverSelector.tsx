import React, { useState, useRef } from 'react';
import { BsCloudUpload, BsLink45Deg } from 'react-icons/bs';
import bookService from '../services/bookService';
import './InlineCoverSelector.css';

interface Book {
  id: number;
}

interface InlineCoverSelectorProps {
  book: Book;
  isOpen: boolean;
  onCoverSelected: (cover: string) => void;
  currentCover?: string;
  onClose: () => void;
}

const InlineCoverSelector = ({ book, isOpen, onCoverSelected, currentCover, onClose }: InlineCoverSelectorProps) => {
  const [uploading, setUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef<number>(0);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);

      const result = await bookService.uploadCover(book.id, file) as { cover: string };

      // Notify parent of the new cover
      onCoverSelected(result.cover);
      onClose();

    } catch (error) {
      console.error('Error uploading cover:', error);
      alert((error as Error).message || 'Failed to upload cover. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) {
      setUrlError('Please enter a URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(urlInput);
    } catch {
      setUrlError('Please enter a valid URL');
      return;
    }

    setUrlError('');
    setUploading(true);

    try {
      // Update book with the new cover URL
      await bookService.updateBook(book.id, { cover: urlInput.trim() });
      onCoverSelected(urlInput.trim());
      setUrlInput('');
      setShowUrlInput(false);
      onClose();
    } catch (error) {
      console.error('Error setting cover URL:', error);
      setUrlError('Failed to set cover URL');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUrlSubmit();
    } else if (e.key === 'Escape') {
      setShowUrlInput(false);
      setUrlInput('');
      setUrlError('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="inline-cover-selector">
      <div className="inline-cover-content">
        <div className="cover-selector-header">
          <span>Change Cover</span>
          <button className="cover-selector-close" onClick={onClose}>×</button>
        </div>

        <div className="cover-selector-options">
          {/* Upload Card */}
          <div
            className={`cover-option upload-card ${isDragging ? 'dragging' : ''}`}
            onClick={handleUploadClick}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div className="upload-card-content">
              {uploading ? (
                <>
                  <div className="upload-spinner"></div>
                  <span className="upload-text">Uploading...</span>
                </>
              ) : (
                <>
                  <BsCloudUpload size={24} className="upload-icon" />
                  <span className="upload-text">Upload</span>
                  <span className="upload-hint">or drop</span>
                </>
              )}
            </div>
          </div>

          {/* URL Input Card */}
          <div
            className={`cover-option url-card ${showUrlInput ? 'expanded' : ''}`}
            onClick={() => !showUrlInput && setShowUrlInput(true)}
          >
            {showUrlInput ? (
              <div className="url-input-container">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrlInput(e.target.value)}
                  onKeyDown={handleUrlKeyDown}
                  placeholder="https://..."
                  autoFocus
                  className={urlError ? 'error' : ''}
                />
                {urlError && <span className="url-error">{urlError}</span>}
                <div className="url-actions">
                  <button
                    className="url-cancel"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      setShowUrlInput(false);
                      setUrlInput('');
                      setUrlError('');
                    }}
                  >
                    ✕
                  </button>
                  <button
                    className="url-submit"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      handleUrlSubmit();
                    }}
                    disabled={uploading}
                  >
                    ✓
                  </button>
                </div>
              </div>
            ) : (
              <div className="url-card-content">
                <BsLink45Deg size={24} className="url-icon" />
                <span className="url-text">URL</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InlineCoverSelector;
