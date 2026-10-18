import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Notice from './Notice';
import { ToastHost, resetToasts, toast, toneOf } from './Toast';

afterEach(() => resetToasts());

describe('Notice', () => {
  it('says what did not work at once, with its title, its action and its ✕', () => {
    const onClose = vi.fn();
    render(<Notice tone="danger" title="Nothing found" action={<button type="button">Retry</button>} onClose={onClose}>Open Library does not know it.</Notice>);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveClass('ui-notice--danger');
    expect(notice).toHaveTextContent('Nothing found');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says the rest politely', () => {
    render(<Notice>No volumes found.</Notice>);
    expect(screen.getByRole('status')).toHaveClass('ui-notice--info');
  });
});

describe('toast()', () => {
  it('passes, offers its action, and goes by itself', async () => {
    const undo = vi.fn();
    render(<ToastHost />);
    act(() => { toast('“Heat” left your Watch Next.', { action: { label: 'Undo', onClick: undo }, duration: 50 }); });
    expect(screen.getByRole('status')).toHaveTextContent('Heat');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalled();
    act(() => { toast('Backup saved.', { tone: 'success', duration: 50 }); });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('keeps the old alert types', () => {
    expect(toneOf('error')).toBe('danger');
    expect(toneOf('success')).toBe('success');
    expect(toneOf(undefined)).toBe('info');
  });
});
