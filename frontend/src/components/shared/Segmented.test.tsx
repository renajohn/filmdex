import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Segmented from './Segmented';
import Chip from './Chip';

const options = [
  { value: 'title', label: 'Album Title' },
  { value: 'barcode', label: 'Barcode', count: 3 },
  false,
  { value: 'photo', tooltip: 'Photograph the cover', icon: <svg /> },
];

describe('Segmented', () => {
  it('is a radio group, the one chosen checked, an option left out when false', () => {
    render(<Segmented label="Search by" value="barcode" onChange={vi.fn()} options={options} />);
    const group = screen.getByRole('radiogroup', { name: 'Search by' });

    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Barcode/ })).toHaveAttribute('aria-checked', 'true');
    // An icon alone is named by its tooltip.
    expect(screen.getByRole('radio', { name: 'Photograph the cover' })).toHaveAttribute('data-tooltip', 'Photograph the cover');
  });

  it('changes to another option, not to the one chosen unless asked to', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Segmented label="Search by" value="title" onChange={onChange} options={options} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Album Title' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Barcode/ }));
    expect(onChange).toHaveBeenCalledWith('barcode');

    rerender(<Segmented label="Search by" value="title" onChange={onChange} options={options} reselect />);
    fireEvent.click(screen.getByRole('radio', { name: 'Album Title' }));
    expect(onChange).toHaveBeenLastCalledWith('title');
  });

  it('is a tab list as tabs', () => {
    render(<Segmented label="Shelves" kind="tabs" value="title" onChange={vi.fn()} options={options} />);
    expect(screen.getByRole('tab', { name: 'Album Title' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Chip', () => {
  it('says it is on when it is a filter', () => {
    render(<Chip active count={12} onClick={vi.fn()}>Buy</Chip>);
    expect(screen.getByRole('button', { name: /Buy/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('as a filter in place, does nothing but its ✕', () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove} removeLabel="Remove the filter Owned">Owned</Chip>);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the filter Owned' }));
    expect(onRemove).toHaveBeenCalled();
  });
});
