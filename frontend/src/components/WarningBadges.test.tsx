import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WarningBadges from './WarningBadges';

describe('WarningBadges', () => {
  it('signale seulement les sujets présents', () => {
    render(<WarningBadges movie={{ spiders_status: 'with', snakes_status: 'without' }} />);
    expect(screen.getByTitle('Spiders')).toBeInTheDocument();
    expect(screen.queryByTitle('Snakes')).not.toBeInTheDocument();
  });

  it('ne rend rien pour un film sans ou inconnu', () => {
    const { container } = render(<WarningBadges movie={{ spiders_status: 'unknown', snakes_status: 'without' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tolère un film sans colonnes de classement', () => {
    const { container } = render(<WarningBadges movie={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
