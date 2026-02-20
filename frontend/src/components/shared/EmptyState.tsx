import React from 'react';
import './shared.css';

interface EmptyStateProps {
  icon?: string;
  title?: string;
  description?: string;
  hint?: string;
  collectionInfo?: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({
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
