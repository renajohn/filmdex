import React, { useRef, useEffect } from 'react';
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BsX, BsFilm, BsDisc } from 'react-icons/bs';
import ShelfCode from './ShelfCode';
import CoverButton from './CoverButton';
import './shared.css';
import Spinner from './Spinner';
import { thumbProps } from '../../utils/thumb';

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
  /** Always-visible markers laid over each image (the hover overlay stays for title/meta). */
  renderBadges?: (item: NextBannerItem) => React.ReactNode;
  onSmartFill?: () => void;
  /** A second way to choose: the card splits in two, onSmartFill's half on top with its label. */
  smartFillAlso?: { label: string; hint: string; icon?: React.ReactNode; onClick: () => void };
  smartFillLabel?: { label: string; hint: string; icon?: React.ReactNode };
  smartFillLoading?: boolean;
  onShuffle?: (item: NextBannerItem) => void;
  shufflingItemId?: number | null;
  /** A play button laid on each image, at its foot on the left. */
  renderPlay?: (item: NextBannerItem) => React.ReactNode;
  /** A button laid on an image, at its foot on the right (where a CD's shelf shows under the pointer). */
  renderFootRight?: (item: NextBannerItem) => React.ReactNode;
  /** In the header in place of the count: controls of the list's own. */
  headerControls?: React.ReactNode;
  /** A line under the cards. */
  footer?: React.ReactNode;
  /** A class of a card's own: one leaving the list, say. */
  getCardClassName?: (item: NextBannerItem) => string;
  /** Laid over each image, above everything else on it. */
  renderOverlay?: (item: NextBannerItem) => React.ReactNode;
  /** The cards can be dragged into a new order: the ids of those that can, from the first to the last. */
  onReorder?: (ids: number[]) => void;
  /** Whether a card can be dragged (all of them by default); one that cannot keeps its place among the others. */
  canReorder?: (item: NextBannerItem) => boolean;
}

interface SortableCardProps {
  id: number;
  disabled: boolean;
  className: string;
  children: React.ReactNode;
}

/** A card of the banner, which a drag moves along the others. */
const SortableCard: React.FC<SortableCardProps> = ({ id, disabled, className, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = { transform: CSS.Translate.toString(transform), transition: transition || undefined };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className}${isDragging ? ' next-banner__card--dragging' : ''}${disabled ? '' : ' next-banner__card--sortable'}`}
      {...attributes}
      {...listeners}
      // The card is not a control of its own: its image and its buttons are.
      role={undefined}
      tabIndex={undefined}
      aria-roledescription={disabled ? undefined : 'sortable'}
    >
      {children}
    </div>
  );
};

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
  renderBadges,
  onSmartFill,
  smartFillAlso,
  smartFillLabel,
  smartFillLoading = false,
  onShuffle,
  shufflingItemId = null,
  renderPlay,
  renderFootRight,
  headerControls,
  footer,
  getCardClassName,
  renderOverlay,
  onReorder,
  canReorder
}) => {
  const bannerRef = useRef<HTMLDivElement>(null);
  /** Set from a drag's end to the click that follows it, which must not open the card. */
  const justDragged = useRef(false);

  // A few pixels before a mouse drags, so that a click stays a click; a touch holds first, so that a swipe scrolls.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 0);
    if (!onReorder || !over || active.id === over.id) return;
    const from = items.findIndex(item => item.id === active.id);
    const to = items.findIndex(item => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to).filter(item => !canReorder || canReorder(item)).map(item => item.id));
  };

  const PlaceholderIcon = type === 'music' ? BsDisc : BsFilm;
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
          {headerControls ?? (
            <span className="next-banner__count">
              {items.length} {items.length === 1 ? itemLabel : itemLabelPlural}
            </span>
          )}
        </div>
      </div>

      <div className="next-banner__carousel">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(item => item.id)} strategy={horizontalListSortingStrategy}>
        <div className="next-banner__track">
          {items.map((item) => (
            <SortableCard
              key={item.id}
              id={item.id}
              disabled={!onReorder || (canReorder ? !canReorder(item) : false)}
              className={`next-banner__card cover-host ${shufflingItemId === item.id ? 'shuffling' : ''} ${getCardClassName ? getCardClassName(item) : ''}`}
            >
              <CoverButton className="next-banner__remove-btn" onClick={(e) => handleRemove(e, item)} label={`Remove from ${title}`}>
                <BsX size={20} />
              </CoverButton>

              {/* Shuffle button - only for music type */}
              {type === 'music' && onShuffle && (
                <CoverButton
                  className="next-banner__shuffle-btn"
                  reveal={shufflingItemId === item.id ? 'always' : 'hover'}
                  onClick={(e) => handleShuffle(e, item)}
                  disabled={shufflingItemId !== null}
                  title="Replace with another suggestion"
                  label="Shuffle"
                >
                  {shufflingItemId === item.id ? (
                    <Spinner size="sm" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                  )}
                </CoverButton>
              )}

              <div
                className={`next-banner__image next-banner__image--${type}`}
                onClick={() => !justDragged.current && onItemClick && onItemClick(item.id)}
              >
                {getImageUrl && getImageUrl(item) ? (
                  <img
                    {...thumbProps(getImageUrl(item)!)}
                    decoding="async"
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

                {renderBadges && <div className="next-banner__badges">{renderBadges(item)}</div>}
                {renderPlay && renderPlay(item)}
                {renderFootRight && renderFootRight(item)}
                <ShelfCode kind={type === 'music' ? 'album' : 'movie'} id={item.id} />
                {renderOverlay && renderOverlay(item)}

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
            </SortableCard>
          ))}

          {/* "Help me choose" placeholder card */}
          {showHelpMeChoose && smartFillAlso && (
            // Two ways to choose, one above the other, each half its own button.
            <div className={`next-banner__help-card next-banner__help-card--${type} next-banner__help-card--split ${smartFillLoading ? 'loading' : ''}`}>
              {smartFillLoading ? (
                <div className="next-banner__help-loading">
                  <Spinner size="lg" />
                  <span className="next-banner__help-loading-text">Choosing...</span>
                </div>
              ) : (
                [
                  { ...smartFillLabel!, onClick: onSmartFill! },
                  smartFillAlso,
                ].map(half => (
                  <button key={half.label} type="button" className="next-banner__help-half" onClick={half.onClick} title={half.hint}>
                    {half.icon && <span className="next-banner__help-half-icon" aria-hidden="true">{half.icon}</span>}
                    <span className="next-banner__help-half-label">
                      {half.label}
                      <small>{half.hint}</small>
                    </span>
                    <span className="next-banner__help-icon" aria-hidden="true">+</span>
                  </button>
                ))
              )}
            </div>
          )}
          {showHelpMeChoose && !smartFillAlso && (
            <button
              className={`next-banner__help-card next-banner__help-card--${type} ${smartFillLoading ? 'loading' : ''}`}
              onClick={onSmartFill}
              disabled={smartFillLoading}
              title="Get smart suggestions based on your collection"
            >
              {smartFillLoading ? (
                <div className="next-banner__help-loading">
                  <Spinner size="lg" />
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
        </SortableContext>
        </DndContext>
      </div>
      {footer}
    </div>
  );
};

export default NextBanner;
