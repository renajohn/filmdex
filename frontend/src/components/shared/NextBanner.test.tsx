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
