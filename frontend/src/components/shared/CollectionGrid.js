import React from 'react';
import { BsChevronDown } from 'react-icons/bs';
import './shared.css';

/**
 * CollectionGrid - Unified grid/group display for collection items
 * 
 * @param {Object} props
 * @param {Array} props.items - Array of items to display
 * @param {'movie' | 'book' | 'music'} props.variant - Visual variant for grid sizing
 * @param {Function} props.renderItem - Function to render each item, receives (item, index)
 * @param {string} props.groupBy - Current grouping option ('none' for ungrouped)
 * @param {Object} props.groupedItems - Object with group names as keys and item arrays as values
 * @param {Set} props.expandedGroups - Set of expanded group keys
 * @param {Function} props.onToggleGroup - Called when a group header is clicked
 * @param {Function} props.sortItems - Function to sort items within groups
 * @param {string} props.sortBy - Current sort option
 * @param {boolean} props.loading - Whether the grid is loading
 * @param {boolean} props.sortLoading - Whether sorting is in progress
 * @param {React.ReactNode} props.emptyState - Content to show when no items
 * @param {string} props.className - Additional CSS class
 */
const CollectionGrid = ({
  items = [],
  variant = 'movie',
  renderItem,
  groupBy = 'none',
  groupedItems,
  expandedGroups = new Set(),
  onToggleGroup,
  sortItems,
  sortBy,
  loading = false,
  sortLoading = false,
  emptyState,
  className = ''
}) => {
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '200px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (items.length === 0 && emptyState) {
    return emptyState;
  }

  const gridClassName = `collection-grid collection-grid--${variant} ${sortLoading ? 'sort-loading' : ''} ${className}`;

  // Ungrouped view
  if (groupBy === 'none' || !groupedItems) {
    return (
      <div className={gridClassName}>
        {items.map((item, index) => renderItem(item, index))}
      </div>
    );
  }

  // Grouped view
  const sortedGroupKeys = Object.keys(groupedItems).sort((a, b) => {
    // Keep "Unknown" groups at the end
    if (a.startsWith('Unknown') && !b.startsWith('Unknown')) return 1;
    if (!a.startsWith('Unknown') && b.startsWith('Unknown')) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className={`collection-groups ${sortLoading ? 'sort-loading' : ''}`}>
      {sortedGroupKeys.map((groupKey) => {
        const groupItems = groupedItems[groupKey];
        const isExpanded = expandedGroups.has(groupKey);
        const sortedGroupItems = sortItems ? sortItems(groupItems, sortBy) : groupItems;
        
        return (
          <div key={groupKey} className="collection-group">
            <div 
              className="group-header"
              onClick={() => onToggleGroup && onToggleGroup(groupKey)}
            >
              <div className="group-title">
                <BsChevronDown className={`group-chevron ${isExpanded ? 'expanded' : ''}`} />
                <span>{groupKey}</span>
                <span className="group-count">({groupItems.length})</span>
              </div>
            </div>
            
            {isExpanded && (
              <div className={`collection-grid collection-grid--${variant}`}>
                {sortedGroupItems.map((item, index) => renderItem(item, index))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CollectionGrid;

