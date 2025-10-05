# Custom Poster Upload Feature

## Overview
Added the ability to upload custom posters for movies that don't have good posters in TMDB (e.g., French movies). The upload option is seamlessly integrated into the existing poster selection grid as **Option 1** (recommended design).

## Implementation Summary

### ✅ Frontend Changes

#### 1. **PosterSelector.js** (`frontend/src/components/PosterSelector.js`)
- Added upload card as the first item in the poster grid
- Hidden file input with image type validation
- Upload state management (uploading spinner)
- Custom poster display with "CUSTOM" badge
- File validation (max 10MB, image types only)

#### 2. **InlinePosterSelector.js** (`frontend/src/components/InlinePosterSelector.js`)
- Same upload functionality adapted for inline popup
- Responsive design for smaller viewports
- Maintains consistency with PosterSelector

#### 3. **API Service** (`frontend/src/services/api.js`)
- New method: `uploadCustomPoster(movieId, file)`
- Handles FormData multipart uploads
- Returns poster metadata (path, width, height)

#### 4. **CSS Styling**
- **PosterSelector.css**: Upload card with dashed border, golden theme, hover effects, spinner animation
- **InlinePosterSelector.css**: Adapted styles for inline version
- Custom badge styling with purple gradient for uploaded posters

### ✅ Backend Changes

#### 1. **Movie Controller** (`backend/src/controllers/movieController.js`)
- Multer configuration for poster uploads
- Destination: `images/posters/custom/`
- File naming: `movie_{movieId}_{timestamp}.{ext}`
- File validation: JPEG, PNG, WebP only, 10MB max
- Image dimension detection (optional with sharp)
- **Surgical update**: Only updates `poster_path` field without affecting other movie data
- New endpoint handler: `uploadCustomPoster`

#### 2. **Routes** (`backend/index.js`)
- New route: `POST /api/movies/:id/upload-poster`
- Applied multer middleware for file handling
- Placed before JSON parsing middleware

#### 3. **Image Service** (`backend/src/services/imageService.js`)
- Already had `posters/custom` directory initialization
- No changes needed - works out of the box

## Design Features

### 🎨 Visual Design
- **Upload Card**: Dashed golden border, cloud upload icon
- **Hover Effect**: Glow effect, slight scale up
- **Loading State**: Animated spinner during upload
- **Custom Badge**: Purple gradient badge to distinguish custom posters
- **Grid Position**: Always first in the grid for easy access

### 🔒 Security & Validation
- **File Type**: Only JPEG, PNG, WebP images
- **File Size**: Maximum 10MB per upload
- **Path Security**: Files stored in dedicated `posters/custom/` directory
- **Validation**: Client-side and server-side validation

### 📱 User Experience
- **Seamless Integration**: Looks like another poster option
- **Instant Feedback**: Loading spinner, success/error messages
- **Non-Disruptive**: Doesn't hide TMDB posters
- **Responsive**: Works on desktop, tablet, and mobile
- **Progressive Enhancement**: Works in both modal and inline selectors
- **Drag-and-Drop**: Drag image files directly onto the upload card
- **Visual Feedback**: Pulsing glow effect when dragging over upload area

## Usage

### For Users

**Method 1: Click to Upload**
1. Click on any movie poster to open the poster selector
2. First card in the grid is "Upload Custom"
3. Click the upload card to select an image file
4. Wait for upload (spinner shows progress)
5. Custom poster appears with "CUSTOM" badge
6. Click to select it as the movie's poster

**Method 2: Drag and Drop**
1. Click on any movie poster to open the poster selector
2. Drag an image file from your computer
3. Drop it on the dotted "Upload Custom" card
4. Card glows and pulses when hovering with file
5. Release to upload - spinner shows progress
6. Custom poster appears automatically selected

### For Developers
```javascript
// Frontend: Upload a custom poster
const result = await apiService.uploadCustomPoster(movieId, fileObject);
// Returns: { posterPath, filename, width, height }

// Backend: Handle upload
POST /api/movies/:id/upload-poster
Content-Type: multipart/form-data
Body: poster=<file>
```

## File Structure
```
data/
  images/
    posters/
      custom/              # Custom uploaded posters
        movie_123_1234567890.jpg
        movie_456_1234567891.png
```

## Browser Compatibility
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Bug Fixes Applied
1. **Surgical Database Update**: Fixed issue where upload was overwriting all movie fields by using targeted SQL UPDATE for poster_path only
2. **URL Construction**: Fixed custom poster URL handling in MovieDetailCard and AddMovieDialog to distinguish between TMDB and local custom posters
3. **Image Preloading**: Custom posters now properly construct local URLs instead of attempting to load from TMDB CDN

## Feature Enhancements
1. **Drag-and-Drop Upload**: Added ability to drag image files directly onto the upload card
2. **Visual Drag Feedback**: Pulsing glow animation when hovering with a dragged file
3. **Refactored File Processing**: Unified file handling for both click and drag-drop methods

## Future Enhancements (Optional)
- [ ] Allow multiple custom posters per movie
- [ ] Add delete button for custom posters (on hover)
- [ ] Image cropping/resizing before upload
- [x] Drag-and-drop upload ✅ **Completed**
- [ ] Preview before confirming
- [ ] Bulk upload for multiple movies

## Testing Checklist

**Upload via Click:**
- [ ] Upload JPEG image by clicking upload card
- [ ] Upload PNG image by clicking upload card
- [ ] Upload WebP image by clicking upload card
- [ ] Try uploading file > 10MB (should fail gracefully)
- [ ] Try uploading non-image file (should fail gracefully)

**Upload via Drag-and-Drop:**
- [ ] Drag JPEG file onto upload card - verify glow effect
- [ ] Drop JPEG file - verify upload succeeds
- [ ] Drag PNG file onto upload card
- [ ] Drop PNG file - verify upload succeeds
- [ ] Drag non-image file - verify validation error
- [ ] Drag file over and move away - verify glow disappears

**Integration Tests:**
- [ ] Upload from InlinePosterSelector in MovieDetailCard
- [ ] Upload from InlinePosterSelector in AddMovieDialog  
- [ ] Verify custom poster displays with CUSTOM badge
- [ ] Verify uploaded poster can be selected
- [ ] **Verify detail view poster updates immediately without closing**
- [ ] Verify thumbnail view poster updates after upload
- [ ] Verify success message appears after upload
- [ ] Check mobile responsiveness (drag-drop may not work on mobile)

## Notes
- Sharp library is optional for image dimension detection
- If sharp is not installed, defaults to 500x750 dimensions
- Custom posters are stored permanently (not cleaned up automatically)
- **Only poster_path is updated** - all other movie fields remain unchanged (uses targeted SQL UPDATE)
- Upload is immediate and updates the movie record instantly

## Dependencies
### Frontend
- react
- react-icons (BsCloudUpload)
- Existing API service

### Backend
- multer (already installed)
- sharp (optional, for image dimensions)
- fs, path (Node.js built-ins)

