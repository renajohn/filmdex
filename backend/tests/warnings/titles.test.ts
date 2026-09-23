import { cleanTitle, normalizeTitle } from '../../src/warnings/titles';

describe('cleanTitle', () => {
  it.each([
    ["Pan's Labyrinth (zone A)", "Pan's Labyrinth"],
    ['le parfum [fr]', 'le parfum'],
    ['Robots [fr]', 'Robots'],
    ['Blade Runner - FINAL CUT', 'Blade Runner'],
    ["Hellboy - Director's Cut", 'Hellboy'],
    ['The Big Bang Theory, the complete series', 'The Big Bang Theory'],
    ['Top Gun : Maverick', 'Top Gun : Maverick'],
    ['(500) Days of Summer', '(500) Days of Summer'],
    ['(500) Days of Summer [fr]', '(500) Days of Summer'],
    ['Alien (zone A) [fr]', 'Alien'],
    ['Blade Runner [fr] - FINAL CUT', 'Blade Runner'],
  ])('%s → %s', (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });
});

describe('normalizeTitle', () => {
  it('ignore casse, accents, ponctuation et « et »/« & »/« and »', () => {
    expect(normalizeTitle('Astérix et Obélix mission Cléopatre'))
      .toBe(normalizeTitle('Astérix & Obélix: Mission Cléopâtre'));
    expect(normalizeTitle('Le prénom')).toBe(normalizeTitle('Le Prenom'));
    expect(normalizeTitle('La cité de la peur')).toBe(normalizeTitle('La Cité De La Peur'));
    expect(normalizeTitle("Ocean's Thirteen")).toBe(normalizeTitle('Oceans Thirteen'));
  });

  it('distingue des titres réellement différents', () => {
    expect(normalizeTitle('La Cité de la peur')).not.toBe(normalizeTitle('La Cité de La Peur Suédé'));
  });

  it('handles both straight and curly apostrophes', () => {
    // U+2019 (curly right single quote) vs U+0027 (straight apostrophe)
    expect(normalizeTitle('Ocean’s Thirteen')).toBe(normalizeTitle('Oceans Thirteen'));
  });
});
