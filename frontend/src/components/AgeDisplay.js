import React from 'react';
import './AgeDisplay.css';

const AgeDisplay = ({ age, className = '' }) => {
  if (age === null || age === undefined) {
    return (
      <div className={`age-display age-unknown ${className}`}>
        NR
      </div>
    );
  }

  const getAgeGroup = (age) => {
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
