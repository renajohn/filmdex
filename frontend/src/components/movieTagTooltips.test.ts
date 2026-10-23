import { ageTooltip, scoreTooltip } from './movieTagTooltips';

describe('ageTooltip', () => {
  it('dit la provenance, les deux âges et les éléments FilmAges, une ligne chacun', () => {
    expect(ageTooltip({
      age_source: 'filmages', filmages_age_legal: 12, filmages_age_suggested: 14,
      filmages_for: 'Humour · Délassement', filmages_against: 'Violence',
    })).toBe('FilmAges\nLegal 12+ · Suggested 14+\nFor: Humour · Délassement\nAgainst: Violence');
  });

  it('un vieux film sans âge suggéré ni éléments', () => {
    expect(ageTooltip({ age_source: 'filmages', filmages_age_legal: 14, filmages_age_suggested: null }))
      .toBe('FilmAges\nLegal 14+ · Suggested —');
  });

  it('la médiane TMDB/OMDB pour un film que FilmAges ne connaît pas', () => {
    expect(ageTooltip({ age_source: null })).toBe('TMDB/OMDB');
  });
});

describe('scoreTooltip', () => {
  it('dit de quoi la note est faite, une note par ligne', () => {
    expect(scoreTooltip({ tmdb_rating: 7.84, imdb_rating: '8', rotten_tomato_rating: 91 }))
      .toBe('TMDB 7.8\nIMDb 8.0\nRotten Tomatoes 91 %');
  });

  it('omet les notes absentes', () => {
    expect(scoreTooltip({ tmdb_rating: 6.5, imdb_rating: 'N/A', rotten_tomato_rating: null }))
      .toBe('TMDB 6.5');
  });
});
