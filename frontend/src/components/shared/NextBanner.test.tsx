import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NextBanner from './NextBanner';

const items = [{ id: 1, title: 'Arachnophobia' }, { id: 2, title: 'Amélie' }];

describe('NextBanner renderBadges', () => {
  it('pose les badges de chaque élément sur son image, sans attendre le survol', () => {
    render(
      <NextBanner
        items={items}
        type="movie"
        title="Watch Next"
        renderBadges={(item) => <span data-testid={`badge-${item.id}`}>badge</span>}
      />
    );

    for (const id of [1, 2]) {
      const badge = screen.getByTestId(`badge-${id}`);
      expect(badge.closest('.next-banner__image')).not.toBeNull();
      // The hover overlay is hidden until hover; the badges must not live in it.
      expect(badge.closest('.next-banner__overlay')).toBeNull();
    }
  });

  it('ne rend rien de plus sans renderBadges', () => {
    const { container } = render(<NextBanner items={items} type="movie" title="Watch Next" />);
    expect(container.querySelectorAll('.next-banner__badges')).toHaveLength(0);
  });
});

describe('NextBanner renderCover', () => {
  it('pose l’image de l’appelant à la place de la sienne, le ✕ gardé', () => {
    const { container } = render(
      <NextBanner items={items} type="movie" title="Watch Next" getImageUrl={() => '/x.jpg'}
        renderCover={(item) => <div data-testid={`cover-${item.id}`} />} />
    );
    expect(screen.getByTestId('cover-1').closest('.next-banner__image')).not.toBeNull();
    expect(container.querySelector('.next-banner__image img')).toBeNull();
    expect(container.querySelector('.next-banner__overlay')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Remove from Watch Next' })).toHaveLength(2);
  });
});

describe('NextBanner Help me choose', () => {
  it('reste une seule carte quand il n’y a qu’une façon de choisir', () => {
    const fill = vi.fn();
    render(<NextBanner items={items} type="music" onSmartFill={fill} smartFillLabel={{ label: 'From CDs', hint: 'your shelves' }} />);
    screen.getByRole('button', { name: /Help me choose/ }).click();
    expect(fill).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('From CDs')).toBeNull();
  });

  it('se coupe en deux quand il y en a deux, chaque moitié choisissant à sa façon', () => {
    const fromCds = vi.fn();
    const fromAnything = vi.fn();
    render(
      <NextBanner items={items} type="music" onSmartFill={fromCds}
        smartFillLabel={{ label: 'From CDs', hint: 'your shelves' }}
        smartFillAlso={{ label: 'From anything', hint: 'CDs + digital', onClick: fromAnything }} />
    );
    screen.getByRole('button', { name: /From anything/ }).click();
    expect(fromAnything).toHaveBeenCalledTimes(1);
    expect(fromCds).not.toHaveBeenCalled();
    screen.getByRole('button', { name: /From CDs/ }).click();
    expect(fromCds).toHaveBeenCalledTimes(1);
  });
});
