import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CoverButton from './CoverButton';
import CoverTag, { CoverTagStack } from './CoverTag';

describe('CoverButton', () => {
  it('se nomme par son label, en info-bulle aussi, et ne montre son état que s’il en a un', () => {
    render(<CoverButton label="Add to Watch Next" onClick={() => undefined}>★</CoverButton>);
    const button = screen.getByRole('button', { name: 'Add to Watch Next' });
    expect(button).toHaveAttribute('title', 'Add to Watch Next');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button.className).toBe('cover-button cover-button--reveal-hover');
  });

  it('est doré quand il est actif, et le dit', () => {
    render(<CoverButton label="In Listen Next" active>♪</CoverButton>);
    const button = screen.getByRole('button', { name: 'In Listen Next' });
    expect(button).toHaveClass('cover-button--on');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('prend sa taille, sa façon d’apparaître et la classe qui le place', () => {
    render(<CoverButton label="Star" size="large" reveal="dim" className="poster-watch-next-star" title="Watch Next">★</CoverButton>);
    const button = screen.getByRole('button', { name: 'Star' });
    expect(button).toHaveClass('cover-button--large', 'cover-button--reveal-dim', 'poster-watch-next-star');
    expect(button).toHaveAttribute('title', 'Watch Next');
  });

  it('agit au clic, et pas quand il est désactivé', () => {
    const click = vi.fn();
    const { rerender } = render(<CoverButton label="Shuffle" onClick={click}>⇄</CoverButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    rerender(<CoverButton label="Shuffle" onClick={click} disabled>⇄</CoverButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('CoverTag', () => {
  it('dit son sens par sa variante, et garde la classe qui le place', () => {
    render(<>
      <CoverTag>12+</CoverTag>
      <CoverTag variant="alert" className="warning-badge-large" title="Spiders">S</CoverTag>
    </>);
    expect(screen.getByText('12+').className).toBe('cover-tag');
    expect(screen.getByTitle('Spiders').className).toBe('cover-tag cover-tag--alert warning-badge-large');
  });

  it('s’empile en colonne d’une largeur, ou en rangée', () => {
    const { container } = render(<>
      <CoverTagStack className="poster-badges-left"><CoverTag>A</CoverTag></CoverTagStack>
      <CoverTagStack direction="row"><CoverTag>B</CoverTag></CoverTagStack>
    </>);
    const [column, row] = container.querySelectorAll('.cover-tag-stack');
    expect(column.className).toBe('cover-tag-stack poster-badges-left');
    expect(row.className).toBe('cover-tag-stack cover-tag-stack--row');
  });
});
