import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner, { Loading } from './Spinner';

describe('Spinner', () => {
  it('is only seen without a label, and says what it waits for with one', () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container.querySelector('.ui-spinner--sm')).toHaveAttribute('aria-hidden', 'true');
    render(<Spinner label="Saving" />);
    expect(screen.getByRole('status', { name: 'Saving' })).toHaveClass('ui-spinner--md');
  });

  it('shows a section that loads with its words', () => {
    render(<Loading>Searching for volumes…</Loading>);
    expect(screen.getByRole('status')).toHaveTextContent('Searching for volumes…');
  });
});
