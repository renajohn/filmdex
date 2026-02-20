import React from 'react';
import { BsChevronDown } from 'react-icons/bs';
import './shared.css';

interface CollectionGridProps {
  items?: any[];
  variant?: 'movie' | 'book' | 'music';
  renderItem: (item: any, index: number) => React.ReactNode;
  groupBy?: string;
  groupedItems?: Record<string, any[]>;
  expandedGroups?: Set<string>;
  onToggleGroup?: (groupKey: string) => void;
  sortItems?: (items: any[], sortBy: string) => any[];
  sortBy?: string;
  loading?: boolean;
  sortLoading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

const CollectionGrid: React.FC<CollectionGridProps> = ({
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
    return <>{emptyState}</>;
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
        const sortedGroupItems = sortItems && sortBy ? sortItems(groupItems, sortBy) : groupItems;

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
