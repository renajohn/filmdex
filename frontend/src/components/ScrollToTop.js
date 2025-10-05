import React, { useState, useEffect } from 'react';
import { BsChevronUp } from 'react-icons/bs';
import './ScrollToTop.css';

/**
 * ScrollToTop - Floating Action Button (FAB)
 * Displays a scroll-to-top button on mobile devices after scrolling down
 */
function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if screen is mobile size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    // Initial check
    checkMobile();

    // Listen for resize events
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle scroll events
  useEffect(() => {
    const toggleVisibility = () => {
      // Show button after scrolling down 300px
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  // Scroll to top with smooth animation
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Only render on mobile devices
  if (!isMobile) {
    return null;
  }

  return (
    <button
      className={`scroll-to-top ${isVisible ? 'visible' : ''}`}
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <BsChevronUp />
    </button>
  );
}

export default ScrollToTop;

