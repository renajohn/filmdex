import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WarningBadges, { warningTooltip } from './WarningBadges';

describe('WarningBadges', () => {
  it('signale seulement les sujets présents', () => {
    render(<WarningBadges movie={{ spiders_status: 'with', snakes_status: 'without' }} />);
    expect(screen.getByTitle(/^Spiders/)).toBeInTheDocument();
    expect(screen.queryByTitle(/^Snakes/)).not.toBeInTheDocument();
  });

  it('ne rend rien pour un film sans ou inconnu', () => {
    const { container } = render(<WarningBadges movie={{ spiders_status: 'unknown', snakes_status: 'without' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tolère un film sans colonnes de classement', () => {
    const { container } = render(<WarningBadges movie={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dit les votes dans l’infobulle, comme la fiche du film', () => {
    render(<WarningBadges movie={{ spiders_status: 'with', spiders_yes: 3, spiders_no: 1 }} />);
    expect(screen.getByTitle(/^Spiders/)).toHaveAttribute('title', 'Spiders\nWith · 3 yes / 1 no');
  });

  it('signale une correction à la main', () => {
    expect(warningTooltip({ snakes_override: 'with', snakes_yes: 0, snakes_no: 0 }, 'snakes')).toBe('Snakes\nWith (manual) · 0 yes / 0 no');
  });
});
