import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StarRating, { halfTone } from './StarRating';

/** A star 20 px wide at x = 0: a click at 5 px is its left half, at 15 px its right one. */
const box = (star: HTMLElement) => {
  star.getBoundingClientRect = () => ({ left: 0, width: 20, top: 0, height: 20, right: 20, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  return star;
};

describe('StarRating', () => {
  it('gives a whole star with its right half, a half with its left', () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} />);

    fireEvent.click(box(screen.getByRole('button', { name: '4 stars' })), { clientX: 15 });
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(box(screen.getByRole('button', { name: '4 stars' })), { clientX: 5 });
    expect(onChange).toHaveBeenLastCalledWith(3.5);
  });

  it('takes the stars away with a click on those given', () => {
    const onChange = vi.fn();
    render(<StarRating value={3.5} onChange={onChange} />);

    const fourth = screen.getByRole('button', { name: '4 stars' });
    expect(fourth).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Your rating: 3.5 stars');
    fireEvent.click(box(fourth), { clientX: 5 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('never takes the focus, so the arrows still go from one record to the next', () => {
    render(<StarRating value={2} onChange={() => {}} />);
    screen.getAllByRole('button').forEach(star => expect(star).toHaveAttribute('tabindex', '-1'));
  });

  it('keeps the gold for the stars given, under the pointer as well', () => {
    // 3.5 given, the pointer on 4.5: seven halves gold, two white, one empty.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(h => halfTone(h, 3.5, 4.5)))
      .toEqual(['given', 'given', 'given', 'given', 'given', 'given', 'given', 'adding', 'adding', null]);
    // The pointer on 2: what a click takes away goes pale.
    expect([4, 5, 7, 8].map(h => halfTone(h, 3.5, 2))).toEqual(['given', 'leaving', 'leaving', null]);
  });
});
