import React from 'react';
import Menu, { MenuChevron } from './Menu';
import Button from './Button';
import { BsSortDown, BsGrid3X3Gap, BsPlus } from 'react-icons/bs';
import './shared.css';
import Spinner from './Spinner';

interface SortOption {
  value: string;
  label: string;
}

interface GroupOption {
  value: string;
  label: string;
}

interface CollectionHeaderProps {
  filteredCount?: number;
  totalCount?: number;
  itemLabel?: string;
  sortBy?: string;
  sortOptions?: SortOption[];
  onSortChange?: (value: string) => void;
  sortLoading?: boolean;
  groupBy?: string;
  groupOptions?: GroupOption[];
  onGroupChange?: (value: string) => void;
  groupLoading?: boolean;
  expandAllGroups?: boolean;
  onToggleAllGroups?: () => void;
  stackEnabled?: boolean;
  onStackChange?: (value: boolean) => void;
  showStackToggle?: boolean;
  addButtonLabel?: string;
  onAdd?: () => void;
  loading?: boolean;
  extraControls?: React.ReactNode;
  /** Beside the count, at the right end: a button that acts on the whole list, say. */
  countExtra?: React.ReactNode;
  /** First in the controls: which view of the section (BookDex's Library and Reading). */
  leading?: React.ReactNode;
}

const CollectionHeader: React.FC<CollectionHeaderProps> = ({
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
  extraControls,
  countExtra,
  leading
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
        {leading}

        {/* Sort */}
        {sortOptions.length > 0 && (
          <Menu label="Sort" trigger={(props, open) => (
            <button type="button" {...props}
              className={`menu-pill sort-dropdown-button ${loading || sortLoading ? 'filter-pill-loading' : ''}`}
              disabled={sortLoading}>
              {sortLoading ? (
                <>
                  <Spinner size="sm" />
                  Sorting...
                </>
              ) : (
                <>
                  <span className="menu-pill__lead"><BsSortDown /></span>
                  <span className="menu-pill__muted">Sort:</span> {currentSortLabel}
                  <MenuChevron open={open} />
                </>
              )}
            </button>
          )}>
            {sortOptions.map(option => (
              <Menu.Choice key={option.value} selected={sortBy === option.value} onSelect={() => onSortChange && onSortChange(option.value)}>
                {option.label}
              </Menu.Choice>
            ))}
          </Menu>
        )}

        {/* Grouping */}
        {groupOptions.length > 0 && (
          <Menu label="Grouping" trigger={(props, open) => (
            <button type="button" {...props}
              className={`menu-pill group-dropdown-button ${loading || groupLoading ? 'filter-pill-loading' : ''}`}
              disabled={groupLoading}>
              {groupLoading ? (
                <>
                  <Spinner size="sm" />
                  Grouping...
                </>
              ) : (
                <>
                  <span className="menu-pill__lead"><BsGrid3X3Gap /></span>
                  {currentGroupLabel}
                  <MenuChevron open={open} />
                </>
              )}
            </button>
          )}>
            {groupOptions.map(option => (
              <Menu.Choice key={option.value} selected={groupBy === option.value} onSelect={() => onGroupChange && onGroupChange(option.value)}>
                {option.label}
              </Menu.Choice>
            ))}
          </Menu>
        )}

        {/* Collapse All Button - Only show when grouping is enabled */}
        {groupBy !== 'none' && onToggleAllGroups && (
          <Button variant="quiet" size="sm" className="collapse-all-btn" onClick={onToggleAllGroups}>
            {expandAllGroups ? 'Collapse All' : 'Expand All'}
          </Button>
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
          <Button variant="primary" size="sm" icon={<BsPlus />} className="add-item-btn" onClick={onAdd}>
            {addButtonLabel}
          </Button>
        )}
      </div>

      {/* Item Count */}
      <div className="collection-count">
        Showing {filteredCount} of {totalCount} {itemLabel}
        {countExtra}
      </div>
    </div>
  );
};

export default CollectionHeader;
