import React from 'react';
import './shared.css';

/**
 * EmptyState - Unified empty state display
 * 
 * @param {Object} props
 * @param {string} props.icon - Emoji icon to display
 * @param {string} props.title - Main title
 * @param {string} props.description - Description text
 * @param {string} props.hint - Smaller hint text
 * @param {string} props.collectionInfo - Info about the collection (e.g., "You have X items")
 * @param {React.ReactNode} props.action - Optional action button/content
 */
const EmptyState = ({
  icon = '📦',
  title = 'No Items',
  description,
  hint,
  collectionInfo,
  action
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {hint && <p className="empty-state-hint">{hint}</p>}
      {collectionInfo && (
        <div 
          className="empty-state-collection-info"
          dangerouslySetInnerHTML={{ __html: collectionInfo }}
        />
      )}
      {action}
    </div>
  );
};

export default EmptyState;

