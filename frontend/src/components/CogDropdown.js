import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BsGear, BsPlus, BsUpload, BsDownload } from 'react-icons/bs';
import './CogDropdown.css';

const CogDropdown = ({ 
  onImportMovies, 
  onAddMovie, 
  onExportCSV
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside the button
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
        // Check if click is outside the dropdown menu (which is in a portal)
        if (!event.target.closest('.cog-dropdown-menu')) {
          setIsOpen(false);
        }
      }
    };

    if (isOpen) {
      // Use a small delay to prevent immediate closing when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: buttonRect.bottom + window.scrollY + 8,
        right: window.innerWidth - buttonRect.right - window.scrollX
      });
    }
    setIsOpen(!isOpen);
  };

  const handleMenuClick = (action) => {
    setIsOpen(false);
    if (action && typeof action === 'function') {
      action();
    }
  };

  return (
    <div className="cog-dropdown" ref={dropdownRef}>
      <button 
        ref={buttonRef}
        className="cog-button" 
        onClick={handleToggle}
        aria-label="Menu"
      >
        <BsGear  />
      </button>
      
      {isOpen && createPortal(
        <div 
          className="cog-dropdown-menu"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
            zIndex: 1001
          }}
        >
          <button 
            className="cog-menu-item"
            onClick={() => handleMenuClick(onImportMovies)}
          >
            <BsUpload className="menu-icon" />
            CSV Import
          </button>
          <button 
            className="cog-menu-item"
            onClick={() => handleMenuClick(onAddMovie)}
          >
            <BsPlus className="menu-icon" />
            Add Movie
          </button>
          {/* <button 
            className="cog-menu-item"
            onClick={() => handleMenuClick(onExportCSV)}
          >
            <span className="menu-icon">📊</span>
            Export CSV
          </button> */}
        </div>,
        document.body
      )}
    </div>
  );
};

export default CogDropdown;
