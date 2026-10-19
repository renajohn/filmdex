import React from 'react';
import { BsBookmarkFill, BsCartFill, BsCloud } from 'react-icons/bs';
import { formatLabel, isLossy, isSuggested, isToBuy, type AlbumDigital } from '../../utils/digitalLibrary';
import './DigitalMarks.css';
import CoverTag, { CoverTagStack } from './CoverTag';

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
  /** Leaves the bookmark out where the card's own bookmark button says it already (in Buy). */
  hideWish?: boolean;
  /** A mark of the card's own before these: a disc of Listen Next, say. */
  lead?: React.ReactNode;
  className?: string;
}

/**
 * What sets an album apart from a CD ripped in lossless, which wears nothing:
 * no CD (a cloud, orange with its format when the files are lossy), a CD
 * ripped lossy (its format in orange), a CD not ripped (a disc struck
 * through), and what is to buy (a cart when listening suggests it, a bookmark
 * on the wish list).
 */
const DigitalMarks: React.FC<DigitalMarksProps> = ({ digital, titleStatus, hideWish = false, lead = null, className = '' }) => {
  const album = digital?.album ?? null;
  const hasCd = titleStatus !== 'digital' && titleStatus !== 'wish';
  const marks: React.ReactNode[] = lead ? [lead] : [];
  if (!hasCd) {
    marks.push(
      <CoverTag key="cloud" variant={isLossy(album) ? 'orange' : 'plain'} className="digital-mark"
        title={album ? `No CD · ${formatLabel(album)}` : 'No CD'}>
        <BsCloud aria-hidden="true" />
        {isLossy(album) && <small>{formatLabel(album!)}</small>}
      </CoverTag>);
  } else if (digital?.notRipped) {
    marks.push(<CoverTag key="unripped" variant="muted" className="digital-mark" title="Not ripped"><NotRippedIcon /></CoverTag>);
  } else if (isLossy(album)) {
    marks.push(<CoverTag key="lossy" variant="orange" className="digital-mark" title={`Ripped in ${formatLabel(album!)}: rip it again`}><small>{formatLabel(album!)}</small></CoverTag>);
  }
  if (!hasCd && titleStatus === 'wish') {
    if (!hideWish) {
      marks.push(<CoverTag key="wish" variant="on" className="digital-mark" title="On your wish list"><BsBookmarkFill aria-hidden="true" /></CoverTag>);
    }
  } else if (!hasCd && isToBuy(album) && isSuggested(album)) {
    marks.push(<CoverTag key="buy" variant="on" className="digital-mark" title="Worth buying, from your listening"><BsCartFill aria-hidden="true" /></CoverTag>);
  }
  if (marks.length === 0) return null;
  return <CoverTagStack direction="row" className={`digital-marks ${className}`}>{marks}</CoverTagStack>;
};

export default DigitalMarks;
