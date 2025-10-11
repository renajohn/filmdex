# Watch Next Feature

This feature allows you to mark movies for future "popcorn sessions" with a simple toggle interface.

## Features Implemented

### 1. Database Schema
- **Collection-Based:** Watch Next is implemented as a system collection
- **Position-Based Ordering:** Movies are added at the end with `collection_order = count + 1`
- **Reverse Display:** UI shows newest additions first by sorting in reverse order
- **Clean Implementation:** Uses collection-based system instead of direct movie fields
- **System Collection:** Watch Next collection is protected and cannot be deleted

### 2. Backend API
- **Endpoint:** `PUT /api/movies/:id/watch-next`
- **Action:** Toggles movie in Watch Next collection (adds/removes from collection)
- **Response:** `{ id: number }` (success confirmation)
- **New Endpoint:** `GET /api/collections/watch-next/movies` - Get Watch Next movies in reverse order

### 3. Frontend Components

#### WatchNextToggle Component
- Location: `frontend/src/components/WatchNextToggle.js`
- Displays a popcorn emoji (🍿) that fills/unfills on toggle
- **Easy Icon Switching:** Change the `ICON_CONFIG.type` from `'popcorn'` to `'star'` to experiment with star icons (⭐/☆)

```javascript
// To switch to star icons, change this line in WatchNextToggle.js:
const ICON_CONFIG = {
  type: 'star', // Change from 'popcorn' to 'star'
  // ...
};
```

#### Movie Detail View
- **Full action button** appears alongside "Play Trailer" and "Delete Movie"
- Shows star icon (outline when inactive, filled when active)
- Button text changes: "Add to Watch Next" / "Remove from Watch Next"
- Styled with golden amber theme when active
- Shows success message when toggled

#### Movie Grid/List
- **Professional star toggle** appears on every movie poster (bottom-left corner)
- **Polished design:**
  - Clean gradient backgrounds (no blur for better poster visibility)
  - Subtle inner light effect
  - Rounded square button (modern, clean, 36x36px)
- **Visual states:**
  - Inactive: Semi-transparent dark background, white star outline
  - Hover: Darker background, brightens and scales up
  - Active: Golden star filled with amber glow and gentle pulse
- **Instant feedback:** Updates immediately when clicked (optimistic UI)
- **No need to open detail view** - toggle directly from the grid
- Positioned at bottom-left to avoid conflicting with age rating badge
- Minimal poster obstruction when inactive

### 4. Filtering
- **Filter Button:** "Watch Next" appears in the filter pills when movies are marked
- Shows count of movies in watch next list
- Click to filter and show only Watch Next movies
- Uses popcorn emoji (🍿) as the filter icon

## User Experience

### Simple Toggle Flow

**From Grid View (Fastest!):**
1. See the star icon at bottom-left of any movie poster
2. Click it to instantly toggle on/off
3. Watch it light up and pulse when active
4. No page changes, instant response!

**From Detail View:**
1. Open any movie's detail view
2. Click the star toggle below the title
3. See confirmation message
4. Movie is now marked for "Watch Next"

### Quick Filter
1. Look for the "🍿 Watch Next (N)" filter pill
2. Click to show only movies marked for watching
3. Click "All" or the filter again to show all movies

## Technical Details

### Icon Configuration
The popcorn/star icon is controlled by a single constant in `WatchNextToggle.js`:

```javascript
const ICON_CONFIG = {
  type: 'popcorn', // or 'star'
  icons: {
    popcorn: { filled: '🍿', outline: '🍿', title: 'Watch Next' },
    star: { filled: '⭐', outline: '☆', title: 'Watch Next' }
  }
};
```

Just change `type: 'popcorn'` to `type: 'star'` to experiment with different icons!

### Database Migration
The migration runs automatically when the backend starts:
1. **First-time setup:** Creates `watch_next_added` DATETIME column
2. **Existing databases:** Automatically migrates old `watch_next` BOOLEAN to `watch_next_added` DATETIME
3. **Migration logic:** 
   - Movies with `watch_next = 1` are converted to current timestamp
   - Movies with `watch_next = 0` become NULL
4. **Idempotent:** Safe to run multiple times

### API Integration
- Frontend: `apiService.toggleWatchNext(movieId)` and `apiService.getWatchNextMovies()`
- Backend: `Movie.toggleWatchNext(id)` 
  - If movie not in Watch Next collection → Add to collection with position = count + 1
  - If movie in Watch Next collection → Remove from collection
- Collection Service: `collectionService.getWatchNextMovies()` - Returns movies in reverse order

### Sorting Algorithm (Position-Based)
Watch Next movies are automatically sorted by **collection_order in reverse**:
```javascript
.filter(movie => watchNextMovies.some(wm => wm.id === movie.id))
.sort((a, b) => {
  const aOrder = a.collection_order || 0;
  const bOrder = b.collection_order || 0;
  return bOrder - aOrder;
})
```
This means the last movie you added to "Watch Next" appears first in the carousel!

## Files Modified

### Backend
- `backend/src/database.js` - Added migration for watch_next column
- `backend/src/models/movie.js` - Added toggleWatchNext method and watch_next field support
- `backend/src/controllers/movieController.js` - Added toggleWatchNext endpoint
- `backend/index.js` - Added route for watch-next toggle

### Frontend
- `frontend/src/services/api.js` - Added toggleWatchNext method
- `frontend/src/components/WatchNextToggle.js` - New component (easy icon switching)
- `frontend/src/components/WatchNextToggle.css` - New styles
- `frontend/src/components/MovieDetailCard.js` - Integrated toggle button
- `frontend/src/components/MovieDetailCard.css` - Updated title container styles
- `frontend/src/components/MovieSearch.js` - Added filter and badge display
- `frontend/src/components/MovieSearch.css` - Added badge styles with pulse animation

## Future Enhancements (Optional)
- ✅ ~~Sort by "Watch Next" to show marked movies first~~ **IMPLEMENTED!** (Sorted by most recently added)
- Bulk actions (mark multiple movies at once)
- Manual reordering of watch next queue (drag & drop)
- Notifications/reminders for unwatched movies
- Integration with calendar for movie nights
- Watch history tracking

