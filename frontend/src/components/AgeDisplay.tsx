import React from 'react';
import './AgeDisplay.css';

interface AgeDisplayProps {
  age: number | null | undefined;
  className?: string;
}

const AgeDisplay = ({ age, className = '' }: AgeDisplayProps) => {
  if (age === null || age === undefined) {
    return (
      <div className={`age-display age-unknown ${className}`}>
        NR
      </div>
    );
  }

  const getAgeGroup = (age: number): string => {
    if (age === 0) return 'all';
    if (age <= 6) return 'children';
    if (age <= 12) return 'kids';
    if (age <= 16) return 'teens';
    return 'adults';
  };

  const ageGroup = getAgeGroup(age);

  return (
    <div className={`age-display age-${ageGroup} ${className}`}>
      {age}+
    </div>
  );
};

export default AgeDisplay;
