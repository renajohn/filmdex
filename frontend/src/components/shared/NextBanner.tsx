import React, { useRef, useEffect } from 'react';
import { BsX, BsFilm, BsMusicNote } from 'react-icons/bs';
import './shared.css';

interface NextBannerItem {
  id: number;
  title?: string;
  [key: string]: any;
}

interface NextBannerProps {
  items?: NextBannerItem[];
  type?: 'movie' | 'music';
  title?: string;
  icon?: React.ReactNode | string;
  onItemClick?: (id: number) => void;
  onRemove?: (event: React.MouseEvent, item: NextBannerItem) => void;
  getImageUrl?: (item: NextBannerItem) => string | null;
  getTitle?: (item: NextBannerItem) => string;
  getSubtitle?: (item: NextBannerItem) => string;
  getYear?: (item: NextBannerItem) => string | number | null;
  getFormat?: (item: NextBannerItem) => string | null;
  onSmartFill?: () => void;
  smartFillLoading?: boolean;
  onShuffle?: (item: NextBannerItem) => void;
  shufflingItemId?: number | null;
}

const NextBanner: React.FC<NextBannerProps> = ({
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
  getFormat,
  onSmartFill,
  smartFillLoading = false,
  onShuffle,
  shufflingItemId = null
}) => {
  const bannerRef = useRef<HTMLDivElement>(null);

  // Show banner if there are items OR if smart fill is available
  const hasSmartFill = typeof onSmartFill === 'function';

  // Remove closing class when items change (banner should reappear fresh)
  useEffect(() => {
    if (bannerRef.current) {
      bannerRef.current.classList.remove('closing');
    }
  }, [items.length]);

  if ((!items || items.length === 0) && !hasSmartFill) return null;

  const handleRemove = (e: React.MouseEvent, item: NextBannerItem) => {
    e.stopPropagation();

    // Get the card element for animation
    const cardElement = (e.currentTarget as HTMLElement).closest('.next-banner__card');
    if (cardElement) {
      cardElement.classList.add('removing');
    }

    // Check if this is the last item - use ref instead of querySelector
    const isLastItem = items.length === 1;
    if (isLastItem && bannerRef.current && !hasSmartFill) {
      // Only close if there's no smart fill (otherwise banner should stay)
      bannerRef.current.classList.add('closing');
    }

    // Call the remove handler
    if (onRemove) {
      onRemove(e, item);
    }
  };

  const handleShuffle = (e: React.MouseEvent, item: NextBannerItem) => {
    e.stopPropagation();
    if (onShuffle && shufflingItemId === null) {
      onShuffle(item);
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

  // Show the "Help me choose" card if smart fill is available
  const showHelpMeChoose = hasSmartFill;

  return (
    <div className="next-banner" ref={bannerRef}>
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
              className={`next-banner__card ${shufflingItemId === item.id ? 'shuffling' : ''}`}
            >
              <button
                className="next-banner__remove-btn"
                onClick={(e) => handleRemove(e, item)}
                title={`Remove from ${title}`}
                aria-label={`Remove from ${title}`}
              >
                <BsX size={20} />
              </button>

              {/* Shuffle button - only for music type */}
              {type === 'music' && onShuffle && (
                <button
                  className={`next-banner__shuffle-btn ${shufflingItemId === item.id ? 'loading' : ''}`}
                  onClick={(e) => handleShuffle(e, item)}
                  disabled={shufflingItemId !== null}
                  title="Replace with another suggestion"
                  aria-label="Shuffle"
                >
                  {shufflingItemId === item.id ? (
                    <span className="next-banner__shuffle-spinner" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                  )}
                </button>
              )}

              <div
                className={`next-banner__image next-banner__image--${type}`}
                onClick={() => onItemClick && onItemClick(item.id)}
              >
                {getImageUrl && getImageUrl(item) ? (
                  <img
                    src={getImageUrl(item)!}
                    alt={getTitle ? getTitle(item) : ''}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.classList.add('no-image');
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

          {/* "Help me choose" placeholder card */}
          {showHelpMeChoose && (
            <button
              className={`next-banner__help-card next-banner__help-card--${type} ${smartFillLoading ? 'loading' : ''}`}
              onClick={onSmartFill}
              disabled={smartFillLoading}
              title="Get smart suggestions based on your collection"
            >
              {smartFillLoading ? (
                <div className="next-banner__help-loading">
                  <span className="next-banner__help-spinner" />
                  <span className="next-banner__help-loading-text">Choosing...</span>
                </div>
              ) : (
                <>
                  <span className="next-banner__help-text">Help me choose</span>
                  <span className="next-banner__help-icon">+</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NextBanner;
