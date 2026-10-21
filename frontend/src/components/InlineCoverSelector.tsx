import React, { useState, useRef } from 'react';
import { BsCamera, BsCloudUpload, BsLink45Deg, BsCheck, BsX, BsJournalText } from 'react-icons/bs';
import bookService from '../services/bookService';
import './InlineCoverSelector.css';
import { IconButton } from './shared/Button';
import { TextField } from './shared/TextField';
import Spinner from './shared/Spinner';
import toast from './shared/Toast';
import CoverCropDialog from './CoverCropDialog';

interface Book {
  id: number;
}

interface InlineCoverSelectorProps {
  book: Book;
  isOpen: boolean;
  onCoverSelected: (cover: string) => void;
  /** The photograph of its back, its blurb, kept beside its cover. */
  onBackSelected?: (backCover: string) => void;
  currentCover?: string;
  onClose: () => void;
}

const InlineCoverSelector = ({ book, isOpen, onCoverSelected, onBackSelected, currentCover, onClose }: InlineCoverSelectorProps) => {
  const [uploading, setUploading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Always mounted: iOS opens the camera only from inside the tap, not from an input that appears after it.
  const frontPhotoRef = useRef<HTMLInputElement>(null);
  const backPhotoRef = useRef<HTMLInputElement>(null);
  // A photo to straighten, as a CD's sleeve is, before it becomes the cover or the back.
  const [cropping, setCropping] = useState<{ file: File; slot: 'front' | 'back' } | null>(null);
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
    if (file) processFile(file);
  };

  /** A photo or a file: straightened first, the camera rarely square to a book held in the hand. */
  const processFile = (file: File, slot: 'front' | 'back' = 'front') => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      toast('Please select an image file', { tone: 'warning' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast('Image size must be less than 20MB', { tone: 'warning' });
      return;
    }
    setCropping({ file, slot });
  };

  const upload = async (photo: File, slot: 'front' | 'back') => {
    try {
      setUploading(true);
      if (slot === 'back') {
        const result = await bookService.uploadBackCover(book.id, photo) as { cover: string };
        onBackSelected?.(result.cover);
        toast('Its back is kept', { tone: 'success' });
      } else {
        const result = await bookService.uploadCover(book.id, photo) as { cover: string };
        onCoverSelected(result.cover);
      }
      onClose();
    } catch (error) {
      toast((error as Error).message || 'Failed to upload the photo. Please try again.', { tone: 'danger' });
    } finally {
      setUploading(false);
      [fileInputRef, frontPhotoRef, backPhotoRef].forEach(ref => { if (ref.current) ref.current.value = ''; });
    }
  };

  const handleFileSelect = (slot: 'front' | 'back') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file, slot);
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
          <IconButton label="Close" className="cover-selector-close" onClick={onClose}><BsX /></IconButton>
        </div>

        <div className="cover-selector-options">
          <input ref={frontPhotoRef} type="file" accept="image/*,.heic,.heif" capture="environment" onChange={handleFileSelect('front')} style={{ display: 'none' }} />
          <input ref={backPhotoRef} type="file" accept="image/*,.heic,.heif" capture="environment" onChange={handleFileSelect('back')} style={{ display: 'none' }} />
          {/* Photographed: its front, as the cover; its back, kept beside it */}
          <div className="cover-option upload-card" onClick={() => frontPhotoRef.current?.click()} title="Photograph its cover">
            <div className="upload-card-content">
              <BsCamera size={24} className="upload-icon" />
              <span className="upload-text">Photo</span>
              <span className="upload-hint">its front</span>
            </div>
          </div>
          {onBackSelected && (
            <div className="cover-option upload-card" onClick={() => backPhotoRef.current?.click()} title="Photograph its back, its blurb">
              <div className="upload-card-content">
                <BsJournalText size={24} className="upload-icon" />
                <span className="upload-text">Back</span>
                <span className="upload-hint">its blurb</span>
              </div>
            </div>
          )}
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
              onChange={handleFileSelect('front')}
              style={{ display: 'none' }}
            />
            <div className="upload-card-content">
              {uploading ? (
                <>
                  <Spinner size="md" />
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
                <TextField
                  type="url"
                  value={urlInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrlInput(e.target.value)}
                  onKeyDown={handleUrlKeyDown}
                  placeholder="https://..."
                  autoFocus
                  isInvalid={!!urlError}
                />
                {urlError && <span className="url-error">{urlError}</span>}
                <div className="url-actions">
                  <IconButton label="Cancel" size="sm" className="url-cancel"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      setShowUrlInput(false);
                      setUrlInput('');
                      setUrlError('');
                    }}
                  ><BsX /></IconButton>
                  <IconButton label="Use this address" tone="confirm" size="sm" className="url-submit"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      handleUrlSubmit();
                    }}
                    disabled={uploading}
                  ><BsCheck /></IconButton>
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
      <CoverCropDialog
        show={Boolean(cropping)}
        file={cropping?.file || null}
        slot={cropping?.slot || 'front'}
        onCancel={() => { setCropping(null); [fileInputRef, frontPhotoRef, backPhotoRef].forEach(ref => { if (ref.current) ref.current.value = ''; }); }}
        onConfirm={photo => {
          const pending = cropping;
          setCropping(null);
          if (pending) upload(photo, pending.slot);
        }}
      />
    </div>
  );
};

export default InlineCoverSelector;
