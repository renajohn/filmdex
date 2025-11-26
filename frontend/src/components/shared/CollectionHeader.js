import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { BsSortDown, BsGrid3X3Gap, BsPlus } from 'react-icons/bs';
import './shared.css';

/**
 * CollectionHeader - Unified header with sort, group, stack toggle, and add button
 * 
 * @param {Object} props
 * @param {number} props.filteredCount - Number of currently displayed items
 * @param {number} props.totalCount - Total number of items in collection
 * @param {string} props.itemLabel - Label for items (e.g., "movies", "books", "albums")
 * @param {string} props.sortBy - Current sort option value
 * @param {Array} props.sortOptions - Array of { value, label } objects
 * @param {Function} props.onSortChange - Called with new sort value
 * @param {boolean} props.sortLoading - Whether sort is in progress
 * @param {string} props.groupBy - Current group option value
 * @param {Array} props.groupOptions - Array of { value, label } objects
 * @param {Function} props.onGroupChange - Called with new group value
 * @param {boolean} props.groupLoading - Whether grouping is in progress
 * @param {boolean} props.expandAllGroups - Whether all groups are expanded
 * @param {Function} props.onToggleAllGroups - Called to toggle expand/collapse all
 * @param {boolean} props.stackEnabled - Whether stacking is enabled
 * @param {Function} props.onStackChange - Called with new stack value
 * @param {boolean} props.showStackToggle - Whether to show stack toggle (default: true when groupBy === 'none')
 * @param {string} props.addButtonLabel - Label for add button
 * @param {Function} props.onAdd - Called when add button is clicked
 * @param {boolean} props.loading - Overall loading state
 * @param {React.ReactNode} props.extraControls - Additional controls to render
 */
const CollectionHeader = ({
  filteredCount = 0,
  totalCount = 0,
  itemLabel = 'items',
  sortBy,
  sortOptions = [],
  onSortChange,
  sortLoading = false,
  groupBy = 'none',
  groupOptions = [],
  onGroupChange,
  groupLoading = false,
  expandAllGroups = false,
  onToggleAllGroups,
  stackEnabled = true,
  onStackChange,
  showStackToggle,
  addButtonLabel = 'Add Item',
  onAdd,
  loading = false,
  extraControls
}) => {
  // Default: show stack toggle when no grouping is active
  const shouldShowStackToggle = showStackToggle !== undefined 
    ? showStackToggle 
    : (groupBy === 'none' && onStackChange);

  const currentSortLabel = sortOptions.find(opt => opt.value === sortBy)?.label || 'Sort';
  const currentGroupLabel = groupOptions.find(opt => opt.value === groupBy)?.label || 'No grouping';

  return (
    <div className="collection-header">
      <div className="collection-controls">
        {/* Sort Dropdown */}
        {sortOptions.length > 0 && (
          <Dropdown className="sort-dropdown-container">
            <Dropdown.Toggle 
              as="button"
              className={`filter-pill sort-dropdown-button ${loading || sortLoading ? 'filter-pill-loading' : ''}`}
              disabled={sortLoading}
            >
              {sortLoading ? (
                <>
                  <span className="sort-loading-spinner"></span>
                  Sorting...
                </>
              ) : (
                <>
                  <BsSortDown className="sort-icon" />
                  Sort: {currentSortLabel}
                </>
              )}
            </Dropdown.Toggle>
            
            <Dropdown.Menu className="sort-dropdown-menu">
              {sortOptions.map(option => (
                <Dropdown.Item
                  key={option.value}
                  className={`sort-dropdown-item ${sortBy === option.value ? 'active' : ''}`}
                  onClick={() => onSortChange && onSortChange(option.value)}
                >
                  {option.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}

        {/* Group Dropdown */}
        {groupOptions.length > 0 && (
          <Dropdown className="group-dropdown-container">
            <Dropdown.Toggle 
              as="button"
              className={`filter-pill group-dropdown-button ${loading || groupLoading ? 'filter-pill-loading' : ''}`}
              disabled={groupLoading}
            >
              {groupLoading ? (
                <>
                  <span className="group-loading-spinner"></span>
                  Grouping...
                </>
              ) : (
                <>
                  <BsGrid3X3Gap className="group-icon" />
                  {currentGroupLabel}
                </>
              )}
            </Dropdown.Toggle>
            
            <Dropdown.Menu className="group-dropdown-menu">
              {groupOptions.map(option => (
                <Dropdown.Item
                  key={option.value}
                  className={`group-dropdown-item ${groupBy === option.value ? 'active' : ''}`}
                  onClick={() => onGroupChange && onGroupChange(option.value)}
                >
                  {option.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}

        {/* Collapse All Button - Only show when grouping is enabled */}
        {groupBy !== 'none' && onToggleAllGroups && (
          <button 
            className="collapse-all-btn"
            onClick={onToggleAllGroups}
          >
            {expandAllGroups ? 'Collapse All' : 'Expand All'}
          </button>
        )}

        {/* Stack Toggle */}
        {shouldShowStackToggle && (
          <div className="stack-toggle-container">
            <span className="stack-toggle-label">Stack</span>
            <label className="stack-toggle-switch">
              <input
                type="checkbox"
                checked={stackEnabled}
                onChange={(e) => onStackChange && onStackChange(e.target.checked)}
              />
              <span className="stack-toggle-slider"></span>
            </label>
          </div>
        )}

        {/* Extra Controls */}
        {extraControls}

        {/* Add Button */}
        {onAdd && (
          <button 
            className="add-item-btn"
            onClick={onAdd}
            title={addButtonLabel}
          >
            <BsPlus />
            {addButtonLabel}
          </button>
        )}
      </div>
      
      {/* Item Count */}
      <div className="collection-count">
        Showing {filteredCount} of {totalCount} {itemLabel}
      </div>
    </div>
  );
};

export default CollectionHeader;

