# Track Editing Feature

## Overview
Users can now add, edit, delete, and **reorder tracks via drag-and-drop** when creating or editing albums in the MusicDex feature.

## Implementation Details

### Frontend Changes (MusicForm.js)

1. **New UI Components**:
   - Tracks section with accordion layout for multiple discs
   - Add Disc button to create new discs
   - Add Track button for each disc
   - **Drag-and-drop reordering** with visual grip handles
   - Edit and Delete buttons for individual tracks
   - Track edit dialog with fields for:
     - Title (required)
     - Duration (mm:ss format)
     - ISRC code
   - Track numbers are **automatically calculated** based on position

2. **State Management**:
   - `editingTrack`: Tracks the currently edited track
   - `showTrackDialog`: Controls track edit dialog visibility
   - `formData.discs`: Array of discs, each containing an array of tracks

3. **Track Management Functions**:
   - `addDisc()`: Add a new disc to the album
   - `deleteDisc(discIndex)`: Remove a disc and renumber remaining discs
   - `addTrack(discIndex)`: Open dialog to add a new track to a disc
   - `editTrack(discIndex, trackIndex)`: Open dialog to edit an existing track
   - `saveTrack()`: Save track changes and auto-renumber based on position
   - `deleteTrack(discIndex, trackIndex)`: Remove a track and renumber remaining tracks
   - `formatDuration(seconds)`: Convert seconds to mm:ss format
   - `parseDuration(timeString)`: Convert mm:ss format to seconds
   - **Drag-and-Drop Functions**:
     - `handleDragStart()`: Initialize drag operation with visual feedback
     - `handleDragEnd()`: Clean up after drag operation
     - `handleDragOver()`: Allow drop targets
     - `handleDrop()`: Reorder tracks and auto-renumber

4. **Data Normalization**:
   - Handles both `no` and `trackNumber` fields from backend
   - Normalizes track data when loading existing albums
   - Ensures consistent data format when saving

## Backend Integration

The backend already supports tracks through the `discs` array:

```javascript
{
  title: "Album Title",
  artist: ["Artist Name"],
  // ... other album fields
  discs: [
    {
      number: 1,
      tracks: [
        {
          trackNumber: 1,
          title: "Track Title",
          durationSec: 215,
          isrc: "USRC17607839",
          musicbrainzRecordingId: "...",
          musicbrainzTrackId: "..."
        }
      ]
    }
  ]
}
```

When creating or updating an album:
- If `discs` array is provided, tracks are saved to the database
- When updating, existing tracks are deleted and replaced with new data
- Tracks are stored in the `tracks` table with foreign key to album

## Usage Scenarios

### 1. Creating a New Album with Tracks
1. Click "Add Album" button
2. Enter album information
3. Scroll to "Tracks" section
4. Click "Add Disc" to create disc 1
5. Click "Add Track" within the disc
6. Fill in track details (title required, duration optional)
7. Repeat for all tracks
8. **Drag tracks to reorder** if needed
9. Save the album

### 2. Editing Tracks on an Existing Album
1. Open an existing album for editing
2. Existing tracks are displayed in the Tracks section
3. Click pencil icon to edit a track
4. Click trash icon to delete a track
5. Click "Add Track" to add new tracks
6. **Drag and drop tracks** to reorder them
7. Click "Delete Disc" to remove an entire disc
8. Save changes

### 3. Reordering Tracks (NEW!)
1. Hover over the grip icon (⋮⋮) on the left side of any track
2. Click and hold to start dragging
3. Drag the track to its new position
4. Release to drop the track
5. Track numbers automatically update based on new positions
6. Visual feedback shows which track is being dragged

### 4. Manual Entry (Albums without MusicBrainz data)
1. Use "Manual Entry" option in Add Music Dialog
2. Enter basic album information
3. Add discs and tracks manually as needed
4. All track fields are available for manual input

## Track Data Fields

- **Track Number**: **Automatically calculated** based on position in the list (read-only, displayed as index)
- **Title**: Track name (required)
- **Duration**: Length in mm:ss format (e.g., 3:45)
- **ISRC**: International Standard Recording Code (optional)
- **MusicBrainz IDs**: Automatically populated when adding from MusicBrainz

> **Note**: Track numbers are no longer manually editable. They are automatically assigned based on the track's position in the list. Reorder tracks by dragging them to change their numbers.

## UI Features

- **Accordion Layout**: Discs are collapsible for better organization
- **Track Count Display**: Shows number of tracks per disc in header
- **Drag-and-Drop Reordering**: 
  - Visual grip handle (⋮⋮) on each track row
  - Smooth drag-and-drop interaction
  - Blue highlight on dragged track
  - 3px blue border on left side during drag
  - Opacity reduction on drag source
  - **Green drop indicator line** shows exactly where track will be inserted
  - Subtle green glow/shadow under drop target for better visibility
  - Helpful hint text: "Drag tracks to reorder"
- **Inline Editing**: Track details can be edited without leaving the form
- **Confirmation Dialogs**: Prompts before deleting discs or tracks
- **Empty States**: Clear messages when no tracks are present
- **Validation**: Track title is required before saving
- **Auto-Focus**: Title field automatically focused in edit dialog

## Testing Checklist

- [x] Add disc to a new album
- [x] Add tracks to a disc
- [x] Edit track information
- [x] Delete individual tracks
- [x] Delete entire disc
- [x] Track numbering updates after deletions
- [x] Duration format parsing (mm:ss)
- [x] Save album with tracks
- [x] Load existing album with tracks
- [x] Edit existing album's tracks
- [x] Data persists after saving
- [x] **Drag and drop track to reorder**
- [x] **Track numbers auto-update after reorder**
- [x] **Visual feedback during drag (opacity, highlight, border)**
- [x] **Grip handle icon displays correctly**
- [x] **Drag only within same disc (no cross-disc dragging)**
- [x] **Track number field removed from edit dialog**

## Files Modified

- `/frontend/src/components/MusicForm.js` - Added track management UI and logic
- No backend changes required (already supported tracks)

## Notes

- Track management is fully integrated with the existing album form
- All track operations are performed in-memory until the album is saved
- The backend handles track persistence automatically when albums are saved
- Track data is normalized to handle both new and existing album formats

