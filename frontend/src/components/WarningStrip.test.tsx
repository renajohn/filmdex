import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WarningStrip from './WarningStrip';

describe('WarningStrip', () => {
  it('annonce en toutes lettres un animal présent et encadre l’affiche', () => {
    const { container } = render(<WarningStrip movie={{ spiders_status: 'with', snakes_status: 'without' }} />);
    expect(screen.getByText('Spiders')).toBeInTheDocument();
    expect(screen.getByTitle('Spiders')).toHaveClass('warning-strip__pill--with');
    expect(container.querySelector('.warning-strip__frame')).toBeInTheDocument();
  });

  it('montre les deux animaux quand les deux sont présents', () => {
    render(<WarningStrip movie={{ spiders_status: 'with', snakes_status: 'with' }} />);
    expect(screen.getByText('Spiders')).toBeInTheDocument();
    expect(screen.getByText('Snakes')).toBeInTheDocument();
  });

  it('marque un film vérifié sans l’animal, sans cadre rouge', () => {
    const { container } = render(<WarningStrip movie={{ spiders_status: 'without', snakes_status: 'without' }} />);
    expect(screen.getByTitle('No spiders')).toHaveClass('warning-strip__pill--without');
    expect(screen.getByTitle('No snakes')).toHaveClass('warning-strip__pill--without');
    expect(container.querySelector('.warning-strip__frame')).not.toBeInTheDocument();
  });

  it('signale un film non vérifié', () => {
    render(<WarningStrip movie={{ spiders_status: 'unknown' }} />);
    expect(screen.getByTitle('Spiders not reported yet')).toHaveClass('warning-strip__pill--unknown');
    // A movie without the columns at all counts as unknown too.
    expect(screen.getByTitle('Snakes not reported yet')).toHaveClass('warning-strip__pill--unknown');
  });
});
