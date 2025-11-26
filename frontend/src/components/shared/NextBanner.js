import React from 'react';
import { BsX, BsFilm, BsMusicNote } from 'react-icons/bs';
import './shared.css';

/**
 * NextBanner - Unified "Watch Next" / "Listen Next" banner component
 * 
 * @param {Object} props
 * @param {Array} props.items - Array of items to display (movies or albums)
 * @param {'movie' | 'music'} props.type - Type of content
 * @param {string} props.title - Banner title (e.g., "Watch Next", "Listen Next")
 * @param {React.ReactNode} props.icon - Icon to display (SVG element or emoji string)
 * @param {Function} props.onItemClick - Called when an item is clicked, receives item id
 * @param {Function} props.onRemove - Called when remove button is clicked, receives (event, item)
 * @param {Function} props.getImageUrl - Function to get image URL from item
 * @param {Function} props.getTitle - Function to get title from item
 * @param {Function} props.getSubtitle - Optional function to get subtitle (e.g., artist name for music)
 * @param {Function} props.getYear - Optional function to get year
 * @param {Function} props.getFormat - Optional function to get format
 */
const NextBanner = ({
  items = [],
  type = 'movie',
  title = 'Next',
  icon,
  onItemClick,
  onRemove,
  getImageUrl,
  getTitle,
  getSubtitle,
  getYear,
  getFormat
}) => {
  if (!items || items.length === 0) return null;

  const handleRemove = (e, item) => {
    e.stopPropagation();
    
    // Get the card element for animation
    const cardElement = e.currentTarget.closest('.next-banner__card');
    if (cardElement) {
      cardElement.classList.add('removing');
    }
    
    // Check if this is the last item
    const isLastItem = items.length === 1;
    if (isLastItem) {
      const bannerElement = document.querySelector('.next-banner');
      if (bannerElement) {
        bannerElement.classList.add('closing');
      }
    }
    
    // Call the remove handler
    if (onRemove) {
      onRemove(e, item);
    }
  };

  const PlaceholderIcon = type === 'music' ? BsMusicNote : BsFilm;
  const itemLabel = type === 'music' ? 'album' : 'movie';
  const itemLabelPlural = type === 'music' ? 'albums' : 'movies';

  // Render the icon
  const renderIcon = () => {
    if (!icon) {
      // Default star icon for movies
      return (
        <svg 
          className="next-banner__icon" 
          viewBox="0 0 24 24" 
          fill="currentColor"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    }
    
    // If icon is a string, treat it as emoji
    if (typeof icon === 'string') {
      return <span className="next-banner__icon next-banner__icon--emoji">{icon}</span>;
    }
    
    // Otherwise render as-is (React element)
    return icon;
  };

  return (
    <div className="next-banner">
      <div className="next-banner__header">
        <div className="next-banner__title-section">
          {renderIcon()}
          <h2 className="next-banner__title">{title}</h2>
          <span className="next-banner__count">
            {items.length} {items.length === 1 ? itemLabel : itemLabelPlural}
          </span>
        </div>
      </div>
      
      <div className="next-banner__carousel">
        <div className="next-banner__track">
          {items.map((item) => (
            <div 
              key={item.id} 
              className="next-banner__card"
            >
              <button
                className="next-banner__remove-btn"
                onClick={(e) => handleRemove(e, item)}
                title={`Remove from ${title}`}
                aria-label={`Remove from ${title}`}
              >
                <BsX size={20} />
              </button>
              
              <div 
                className={`next-banner__image next-banner__image--${type}`}
                onClick={() => onItemClick && onItemClick(item.id)}
              >
                {getImageUrl && getImageUrl(item) ? (
                  <img 
                    src={getImageUrl(item)}
                    alt={getTitle ? getTitle(item) : ''}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.classList.add('no-image');
                    }}
                  />
                ) : (
                  <div className="next-banner__placeholder">
                    <PlaceholderIcon size={40} />
                  </div>
                )}
                
                {/* Movie-style hover overlay */}
                {type === 'movie' && (
                  <div className="next-banner__overlay">
                    <h3 className="next-banner__overlay-title">
                      {getTitle ? getTitle(item) : item.title}
                    </h3>
                    <div className="next-banner__overlay-meta">
                      {getYear && getYear(item) && (
                        <span>{getYear(item)}</span>
                      )}
                      {getFormat && getFormat(item) && (
                        <span className="next-banner__format-tag">{getFormat(item)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Music-style info below cover */}
              {type === 'music' && (
                <div className="next-banner__info">
                  <h3 className="next-banner__info-title" title={getTitle ? getTitle(item) : item.title}>
                    {getTitle ? getTitle(item) : item.title}
                  </h3>
                  {getSubtitle && (
                    <p className="next-banner__info-subtitle" title={getSubtitle(item)}>
                      {getSubtitle(item)}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NextBanner;

