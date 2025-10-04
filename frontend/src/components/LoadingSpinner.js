import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', className = '' }) => {
  return (
    <div className={`loading-spinner ${size} ${className}`}>
      <div className="spinner-ring"></div>
    </div>
  );
};

export default LoadingSpinner;
