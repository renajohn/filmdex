import React from 'react';
import { BsCartFill, BsCloud, BsHeartFill } from 'react-icons/bs';
import { formatLabel, isLossy, isSuggested, isToBuy, type AlbumDigital } from '../../utils/digitalLibrary';
import './DigitalMarks.css';

/** A disc struck through: a CD with no copy in Navidrome. */
export const NotRippedIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="digital-mark-svg" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M5 5l14 14" />
  </svg>
);

interface DigitalMarksProps {
  digital: AlbumDigital | undefined;
  /** 'owned' for a CD of the collection, 'wish' or 'digital' for an album with no CD. */
  titleStatus?: string | null;
  className?: string;
}

/**
 * What sets an album apart from a CD ripped in lossless, which wears nothing:
 * no CD (a cloud, orange with its format when the files are lossy), a CD
 * ripped lossy (its format in orange), a CD not ripped (a disc struck
 * through), and what is to buy (a cart when listening suggests it, a heart
 * on the wish list).
 */
const DigitalMarks: React.FC<DigitalMarksProps> = ({ digital, titleStatus, className = '' }) => {
  const album = digital?.album ?? null;
  const hasCd = titleStatus !== 'digital' && titleStatus !== 'wish';
  const marks: React.ReactNode[] = [];
  if (!hasCd) {
    marks.push(
      <span key="cloud" className={`digital-mark${isLossy(album) ? ' digital-mark-lossy' : ''}`}
        title={album ? `No CD · ${formatLabel(album)}` : 'No CD'}>
        <BsCloud aria-hidden="true" />
        {isLossy(album) && <small>{formatLabel(album!)}</small>}
      </span>);
  } else if (digital?.notRipped) {
    marks.push(<span key="unripped" className="digital-mark digital-mark-unripped" title="Not ripped"><NotRippedIcon /></span>);
  } else if (isLossy(album)) {
    marks.push(<span key="lossy" className="digital-mark digital-mark-lossy" title={`Ripped in ${formatLabel(album!)}: rip it again`}><small>{formatLabel(album!)}</small></span>);
  }
  if (!hasCd && titleStatus === 'wish') {
    marks.push(<span key="wish" className="digital-mark digital-mark-wish" title="On your wish list"><BsHeartFill aria-hidden="true" /></span>);
  } else if (!hasCd && isToBuy(album) && isSuggested(album)) {
    marks.push(<span key="buy" className="digital-mark digital-mark-buy" title="Worth buying, from your listening"><BsCartFill aria-hidden="true" /></span>);
  }
  if (marks.length === 0) return null;
  return <div className={`digital-marks ${className}`}>{marks}</div>;
};

export default DigitalMarks;
