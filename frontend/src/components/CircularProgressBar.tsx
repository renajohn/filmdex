import React from 'react';
import './CircularProgressBar.css';

interface CircularProgressBarProps {
  percentage: number;
  color: string;
  children?: React.ReactNode;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

const CircularProgressBar = ({ percentage, color, children, className = '', size = 'medium' }: CircularProgressBarProps) => {
  const radius = size === 'small' ? 20 : size === 'large' ? 35 : 25;
  const strokeWidth = size === 'small' ? 4 : size === 'large' ? 6 : 5;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`circular-progress ${className}`}>
      <svg
        height={radius * 2}
        width={radius * 2}
        className="circular-progress-svg"
      >
        <circle
          className="circular-progress-bg"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          className="circular-progress-fill"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          style={{
            strokeDashoffset,
            stroke: color
          }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="circular-progress-content">
        {children}
      </div>
    </div>
  );
};

export default CircularProgressBar;
