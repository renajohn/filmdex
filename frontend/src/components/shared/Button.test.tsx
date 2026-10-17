import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Button, { IconButton } from './Button';

describe('Button', () => {
  it('is a secondary button by default, a plain button that submits nothing', () => {
    render(<Button>Edit</Button>);
    const button = screen.getByRole('button', { name: 'Edit' });
    expect(button).toHaveClass('ui-button', 'ui-button--secondary');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('says it is on when it is a toggle', () => {
    render(<Button active>In Listen Next</Button>);
    expect(screen.getByRole('button', { name: 'In Listen Next' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a spinner and takes no click while under way', () => {
    const onClick = vi.fn();
    render(<Button variant="primary" loading onClick={onClick}>Saving…</Button>);
    const button = screen.getByRole('button', { name: 'Saving…' });

    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.ui-spinner')).not.toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hands its ref on, for a Menu to open from it', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>More</Button>);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'More' }));
  });
});

describe('IconButton', () => {
  it('is named by its label, its tooltip too', () => {
    render(<IconButton label="Close"><svg /></IconButton>);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('title', 'Close');
    expect(button).toHaveClass('ui-icon-button');
  });

  it('wears its tone and size', () => {
    render(<IconButton label="Delete" tone="danger" size="sm"><svg /></IconButton>);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('ui-icon-button--danger', 'ui-icon-button--sm');
  });
});
