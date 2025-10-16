# Track Drag-and-Drop Visual Guide

## Visual Feedback System

### Before Dragging
```
┌──────────────────────────────────────────────────┐
│ ⋮⋮ | # | Title           | Duration | Actions   │
├──────────────────────────────────────────────────┤
│ ⋮⋮ | 1 | Opening Track   | 3:45     | ✏️ 🗑️     │
│ ⋮⋮ | 2 | Second Song     | 4:12     | ✏️ 🗑️     │
│ ⋮⋮ | 3 | Middle Track    | 2:58     | ✏️ 🗑️     │
│ ⋮⋮ | 4 | Fourth Song     | 5:23     | ✏️ 🗑️     │
│ ⋮⋮ | 5 | Final Track     | 3:15     | ✏️ 🗑️     │
└──────────────────────────────────────────────────┘
```

### While Dragging Track #4
```
┌──────────────────────────────────────────────────┐
│ ⋮⋮ | # | Title           | Duration | Actions   │
├──════════════════════════════════════════════════┤ ← GREEN LINE (drop here)
│ ⋮⋮ | 1 | Opening Track   | 3:45     | ✏️ 🗑️     │   with subtle glow
│ ⋮⋮ | 2 | Second Song     | 4:12     | ✏️ 🗑️     │
│ ⋮⋮ | 3 | Middle Track    | 2:58     | ✏️ 🗑️     │
┃░░ | 4 | Fourth Song     | 5:23     | ✏️ 🗑️    ┃ ← DRAGGED (blue border,
│ ⋮⋮ | 5 | Final Track     | 3:15     | ✏️ 🗑️     │   50% opacity, blue bg)
└──────────────────────────────────────────────────┘
```

### Dragging Over Different Position
```
┌──────────────────────────────────────────────────┐
│ ⋮⋮ | # | Title           | Duration | Actions   │
├──────────────────────────────────────────────────┤
│ ⋮⋮ | 1 | Opening Track   | 3:45     | ✏️ 🗑️     │
│ ⋮⋮ | 2 | Second Song     | 4:12     | ✏️ 🗑️     │
├──════════════════════════════════════════════════┤ ← GREEN LINE (new drop target)
│ ⋮⋮ | 3 | Middle Track    | 2:58     | ✏️ 🗑️     │   with subtle glow
┃░░ | 4 | Fourth Song     | 5:23     | ✏️ 🗑️    ┃ ← DRAGGED
│ ⋮⋮ | 5 | Final Track     | 3:15     | ✏️ 🗑️     │
└──────────────────────────────────────────────────┘
```

### After Dropping at Position 3
```
┌──────────────────────────────────────────────────┐
│ ⋮⋮ | # | Title           | Duration | Actions   │
├──────────────────────────────────────────────────┤
│ ⋮⋮ | 1 | Opening Track   | 3:45     | ✏️ 🗑️     │
│ ⋮⋮ | 2 | Second Song     | 4:12     | ✏️ 🗑️     │
│ ⋮⋮ | 3 | Fourth Song     | 5:23     | ✏️ 🗑️     │ ← MOVED HERE (was #4)
│ ⋮⋮ | 4 | Middle Track    | 2:58     | ✏️ 🗑️     │ ← AUTO-RENUMBERED
│ ⋮⋮ | 5 | Final Track     | 3:15     | ✏️ 🗑️     │
└──────────────────────────────────────────────────┘
```

## Color Coding

### Dragged Track (Blue)
- **Border Left**: 3px solid blue (`rgba(96, 165, 250, 0.8)`)
- **Background**: Light blue highlight (`rgba(96, 165, 250, 0.1)`)
- **Opacity**: 50% (semi-transparent)

### Drop Target (Green)
- **Border Top**: 3px solid green (`rgba(34, 197, 94, 0.9)`)
- **Box Shadow**: Green glow above (`0 -2px 8px rgba(34, 197, 94, 0.3)`)
- Shows **exactly where** the track will be inserted

### Grip Handle
- **Icon**: ⋮⋮ (vertical grip)
- **Color**: Light gray (`rgba(255, 255, 255, 0.4)`)
- **Purpose**: Visual indicator that row is draggable

## Interaction Flow

1. **Hover** over any track → cursor changes to `move`
2. **Click and hold** → track becomes semi-transparent with blue border
3. **Drag over target position** → green line appears at insertion point
4. **Move mouse** → green line follows, showing new insertion point
5. **Release** → track drops at green line position, all tracks renumber
6. **Complete** → visual indicators disappear, new order saved

## Key Features

✨ **Real-time feedback**: Drop indicator updates as you drag  
✨ **Clear insertion point**: Green line shows exact position  
✨ **Visual distinction**: Blue for source, green for target  
✨ **Smooth transitions**: All changes animated for better UX  
✨ **Automatic numbering**: Track numbers update instantly  

## Technical Details

### State Tracking
```javascript
draggedTrack: { discIndex, trackIndex }  // Currently dragging
dropTarget: { discIndex, trackIndex }    // Where it will drop
```

### Visual Styling (Dynamic)
```javascript
isDragging = draggedTrack matches current track
isDropTarget = dropTarget matches current track

// Apply different styles based on state
style={{
  opacity: isDragging ? 0.5 : 1,
  borderLeft: isDragging ? '3px solid blue' : undefined,
  borderTop: isDropTarget ? '3px solid green' : undefined,
  boxShadow: isDropTarget ? 'green glow' : undefined
}}
```

### Cross-Disc Prevention
Tracks can only be reordered **within the same disc**. Dragging to a different disc shows no drop indicator and won't allow the drop.

## Accessibility

- **Visual**: Multiple indicators (color, opacity, border, shadow)
- **Cursor**: Changes to `move` to indicate draggable
- **Hint text**: "Drag tracks to reorder" above table
- **Intuitive**: Standard drag-and-drop UX pattern

---

This visual feedback system ensures users always know:
1. **What** they're dragging (blue highlight)
2. **Where** it will drop (green line)
3. **When** to release (position is clear)

