import React, { useEffect, useState } from 'react';
import { Form, Image } from 'react-bootstrap';
import { BsCheck } from 'react-icons/bs';
import './CoverChoices.css';

/** A cover to choose: a thumbnail, the image kept, and what tells its edition apart. */
export interface CoverChoice {
  url: string;
  fullUrl?: string;
  type: string;
  country?: string | null;
  year?: string | number | null;
  catalogNumber?: string | null;
  /** Where it comes from, when the covers come from several places. */
  source?: string;
}

export type ImageDimensions = Record<string, { width: number; height: number }>;

export const coverKey = (cover: CoverChoice): string => cover.fullUrl || cover.url;

const measure = (imageUrl: string): Promise<{ width: number; height: number }> => new Promise(resolve => {
  const img = document.createElement('img');
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve({ width: 0, height: 0 });
  img.src = imageUrl;
});

/** The size of each cover's image, measured as it loads: to show it, and to put the largest first. */
export const useImageDimensions = (covers: CoverChoice[]): ImageDimensions => {
  const [dimensions, setDimensions] = useState<ImageDimensions>({});
  useEffect(() => {
    let current = true;
    const missing = covers.map(coverKey).filter(key => !dimensions[key]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async key => [key, await measure(key)] as const)).then(found => {
      if (current) setDimensions(prev => ({ ...prev, ...Object.fromEntries(found) }));
    });
    return () => { current = false; };
  }, [covers]);
  return dimensions;
};

/** Largest first; those not measured yet keep their place after. */
export const largestFirst = <T extends CoverChoice>(covers: T[], dimensions: ImageDimensions): T[] => {
  const area = (cover: T) => (dimensions[coverKey(cover)]?.width || 0) * (dimensions[coverKey(cover)]?.height || 0);
  return [...covers].sort((a, b) => area(b) - area(a));
};

const formatImageSize = (width: number, height: number) => {
  if (width === 0 || height === 0) return 'Loading...';
  // Cap display at 1200px as mentioned
  return `${Math.min(width, 1200)}×${Math.min(height, 1200)}px`;
};

interface CoverChoicesProps {
  label: string;
  /** "Front" or "Back", under each thumbnail. */
  side: string;
  covers: CoverChoice[];
  /** The key (coverKey) of the cover chosen. */
  selected: string | null;
  onSelect: (cover: CoverChoice) => void;
  /** A click on the image itself shows it large. */
  onZoom: (cover: CoverChoice) => void;
  dimensions: ImageDimensions;
}

/**
 * The covers of one side to choose from, as a row of thumbnails: the one
 * chosen wears a gold ✓, a click on an image shows it large. The dialog
 * adding a CD and the one finding a missing cover share it.
 */
const CoverChoices: React.FC<CoverChoicesProps> = ({ label, side, covers, selected, onSelect, onZoom, dimensions }) => (
  <div className="cover-type-section mb-4">
    <Form.Label className="text-light">{label}</Form.Label>
    <div className="cover-thumbnails">
      {covers.map((cover, index) => {
        const key = coverKey(cover);
        return (
          <div
            key={key}
            className={`cover-thumbnail ${selected === key ? 'selected' : ''}`}
            onClick={() => onSelect(cover)}
          >
            <Image
              src={key}
              alt={`${side} cover ${index + 1}`}
              thumbnail
              className="cover-image cover-clickable loading"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onZoom(cover);
              }}
              onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).classList.remove('loading'); }}
            />
            {selected === key && (
              <div className="album-cover-check">
                <BsCheck />
              </div>
            )}
            <div className="cover-info">
              <small className="text-light">{cover.source || side}</small>
              <small className="text-muted">{cover.country} {cover.year}</small>
              {cover.catalogNumber && <small className="text-muted">{cover.catalogNumber}</small>}
              <div className="text-muted">
                <small className="cover-dimensions me-2">
                  {formatImageSize(dimensions[key]?.width || 0, dimensions[key]?.height || 0)}
                </small>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default CoverChoices;
