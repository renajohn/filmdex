import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const LoadingSpinner = ({ size = 'medium', className = '' }: LoadingSpinnerProps) => {
  return (
    <div className={`loading-spinner ${size} ${className}`}>
      <div className="spinner-ring"></div>
    </div>
  );
};

export default LoadingSpinner;
