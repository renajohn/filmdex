import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import './AlphabeticalIndex.css';

/**
 * AlphabeticalIndex - iOS-style alphabetical quick navigation
 * 
 * @param {Object} props
 * @param {Array} props.items - Array of items to index
 * @param {Function} props.getTitle - Function to extract title from item (default: item => item.title)
 * @param {Function} props.onLetterSelect - Callback when a letter is selected, receives the letter
 * @param {HTMLElement|null} props.scrollContainer - The scrollable container element
 * @param {string} props.sortBy - Current sort option (index only shows when sorted by title)
 * @param {boolean} props.disabled - Whether to hide the index
 */
const AlphabeticalIndex = ({ 
  items = [], 
  getTitle = (item) => item.title,
  onLetterSelect,
  scrollContainer,
  sortBy = 'title',
  disabled = false
}) => {
  const [activeLetter, setActiveLetter] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const indexRef = useRef(null);
  const hoverZoneRef = useRef(null);
  const letterRefs = useRef({});
  const feedbackTimeoutRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  
  // Show when sorting alphabetically (title or artist, ascending or descending)
  const isReversed = sortBy === 'titleReverse' || sortBy === 'artistReverse' || sortBy === 'authorReverse';
  const shouldShow = (
    sortBy === 'title' || 
    sortBy === 'titleReverse' || 
    sortBy === 'artist' || 
    sortBy === 'artistReverse' ||
    sortBy === 'author' ||
    sortBy === 'authorReverse'
  ) && !disabled;
  
  // Calculate which letters have items
  const availableLetters = useMemo(() => {
    if (!items.length) return new Set();
    
    const letters = new Set();
    items.forEach(item => {
      const title = getTitle(item);
      if (title && typeof title === 'string') {
        const firstChar = title.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstChar)) {
          letters.add(firstChar);
        } else if (/[0-9]/.test(firstChar)) {
          letters.add('#');
        } else {
          // Special characters go under #
          letters.add('#');
        }
      }
    });
    return letters;
  }, [items, getTitle]);
  
  // Create letter index array - reversed for titleReverse sort
  const allLetters = useMemo(() => {
    const letters = [];
    for (let i = 65; i <= 90; i++) {
      letters.push(String.fromCharCode(i));
    }
    letters.push('#'); // # at end for A-Z
    
    if (isReversed) {
      // For Z-A sorting: Z...A, then #
      return letters.reverse();
    }
    // For A-Z sorting: #, A...Z
    return ['#', ...letters.slice(0, -1)];
  }, [isReversed]);
  
  // Handle hover zone mouse events
  const handleHoverEnter = useCallback(() => {
    setIsHovering(true);
    // Clear any hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
  }, []);
  
  const handleHoverLeave = useCallback(() => {
    setIsHovering(false);
    // Start hide timer if not scrolled enough
    const currentScrollTop = scrollContainer === document.documentElement 
      ? window.scrollY 
      : (scrollContainer?.scrollTop || 0);
    
    if (currentScrollTop <= 100 && !isDragging) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 300);
    }
  }, [scrollContainer, isDragging]);
  
  // Track scrolling to show/hide the index
  useEffect(() => {
    if (!shouldShow || !scrollContainer) return;
    
    const handleScroll = () => {
      const currentScrollTop = scrollContainer === document.documentElement 
        ? window.scrollY 
        : scrollContainer.scrollTop;
      
      // Only show if we've scrolled more than 100px
      if (currentScrollTop > 100) {
        setIsVisible(true);
        
        // Clear existing hide timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
        
        // Hide after 1.5s of no scrolling (unless dragging or hovering)
        hideTimeoutRef.current = setTimeout(() => {
          if (!isDragging && !isHovering) {
            setIsVisible(false);
          }
        }, 1500);
      } else if (!isHovering) {
        setIsVisible(false);
      }
      
      lastScrollTopRef.current = currentScrollTop;
    };
    
    // Listen to scroll events
    const target = scrollContainer === document.documentElement ? window : scrollContainer;
    target.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();
    
    return () => {
      target.removeEventListener('scroll', handleScroll);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [shouldShow, scrollContainer, isDragging, isHovering]);
  
  // Find the first item starting with a letter and scroll to it
  const scrollToLetter = useCallback((letter) => {
    if (!items.length || !scrollContainer) return;
    
    // Find the DOM element with data-first-letter attribute
    const searchRoot = scrollContainer === document.documentElement 
      ? document.body 
      : scrollContainer;
    
    const element = searchRoot.querySelector(`[data-first-letter="${letter}"]`);
    
    if (element) {
      // Get the element's position relative to the document
      const elementRect = element.getBoundingClientRect();
      const offset = 120; // Account for sticky headers
      
      if (scrollContainer === document.documentElement) {
        // For window scrolling, use window.scrollTo with absolute position
        const absoluteTop = window.scrollY + elementRect.top - offset;
        window.scrollTo({
          top: Math.max(0, absoluteTop),
          behavior: 'smooth'
        });
      } else {
        // For custom scroll container
        const containerRect = scrollContainer.getBoundingClientRect();
        const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset;
        scrollContainer.scrollTo({
          top: Math.max(0, scrollTop),
          behavior: 'smooth'
        });
      }
    }
    
    // Call the callback
    if (onLetterSelect) {
      const targetItem = items.find(item => {
        const title = getTitle(item);
        if (!title || typeof title !== 'string') return false;
        const firstChar = title.charAt(0).toUpperCase();
        if (letter === '#') return !/[A-Z]/.test(firstChar);
        return firstChar === letter;
      });
      onLetterSelect(letter, targetItem);
    }
  }, [items, getTitle, scrollContainer, onLetterSelect]);
  
  // Handle letter selection
  const handleLetterSelect = useCallback((letter, fromDrag = false) => {
    if (!availableLetters.has(letter)) return;
    
    setActiveLetter(letter);
    scrollToLetter(letter);
    
    // Clear previous timeout
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    
    // Keep letter highlighted briefly after selection
    if (!fromDrag) {
      feedbackTimeoutRef.current = setTimeout(() => {
        setActiveLetter(null);
      }, 500);
    }
  }, [availableLetters, scrollToLetter]);
  
  // Get letter from touch/mouse position
  const getLetterFromPosition = useCallback((clientY) => {
    if (!indexRef.current) return null;
    
    const indexRect = indexRef.current.getBoundingClientRect();
    const letters = indexRef.current.querySelectorAll('.alpha-index-letter');
    
    for (const letterEl of letters) {
      const rect = letterEl.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return letterEl.dataset.letter;
      }
    }
    
    // Check if above or below the index
    if (clientY < indexRect.top) {
      return allLetters.find(l => availableLetters.has(l));
    }
    if (clientY > indexRect.bottom) {
      return [...allLetters].reverse().find(l => availableLetters.has(l));
    }
    
    return null;
  }, [allLetters, availableLetters]);
  
  // Touch handlers for iOS-style dragging
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    // Keep visible while dragging
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    const touch = e.touches[0];
    const letter = getLetterFromPosition(touch.clientY);
    if (letter) {
      handleLetterSelect(letter, true);
    }
  }, [getLetterFromPosition, handleLetterSelect]);
  
  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const letter = getLetterFromPosition(touch.clientY);
    if (letter && letter !== activeLetter) {
      handleLetterSelect(letter, true);
    }
  }, [isDragging, activeLetter, getLetterFromPosition, handleLetterSelect]);
  
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    feedbackTimeoutRef.current = setTimeout(() => {
      setActiveLetter(null);
    }, 500);
    // Start hide timer
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 1500);
  }, []);
  
  // Mouse handlers for desktop
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    // Keep visible while dragging
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    const letter = getLetterFromPosition(e.clientY);
    if (letter) {
      handleLetterSelect(letter, true);
    }
  }, [getLetterFromPosition, handleLetterSelect]);
  
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const letter = getLetterFromPosition(e.clientY);
    if (letter && letter !== activeLetter) {
      handleLetterSelect(letter, true);
    }
  }, [isDragging, activeLetter, getLetterFromPosition, handleLetterSelect]);
  
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      feedbackTimeoutRef.current = setTimeout(() => {
        setActiveLetter(null);
      }, 500);
      // Start hide timer
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 1500);
    }
  }, [isDragging]);
  
  // Add global mouse up listener when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mousemove', handleMouseMove);
    }
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDragging, handleMouseUp, handleMouseMove]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);
  
  if (!shouldShow || availableLetters.size === 0) {
    return null;
  }
  
  // Show if scrolled, hovering, or dragging
  const showIndex = isVisible || isHovering || isDragging;
  
  return (
    <>
      {/* Invisible hover zone on right edge */}
      <div 
        ref={hoverZoneRef}
        className="alpha-index-hover-zone"
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      />
      
      {/* Letter feedback indicator */}
      {activeLetter && isDragging && (
        <div className="alpha-index-feedback">
          <span className="alpha-index-feedback-letter">{activeLetter}</span>
        </div>
      )}
      
      {/* Alphabetical index */}
      <div 
        ref={indexRef}
        className={`alpha-index ${isDragging ? 'dragging' : ''} ${showIndex ? 'visible' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      >
        {allLetters.map(letter => {
          const isAvailable = availableLetters.has(letter);
          const isActive = activeLetter === letter;
          
          return (
            <div
              key={letter}
              ref={el => letterRefs.current[letter] = el}
              data-letter={letter}
              className={`alpha-index-letter ${isAvailable ? 'available' : 'disabled'} ${isActive ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isAvailable) {
                  handleLetterSelect(letter);
                }
              }}
            >
              {letter}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default AlphabeticalIndex;
