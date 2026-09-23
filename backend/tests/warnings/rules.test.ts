import { classify, isTopic, statusSql, warningStatusColumnsSql, TOPICS } from '../../src/warnings/rules';

describe('classify (règle B)', () => {
  it.each([
    [0, 0, 'unknown'],   // aucun vote
    [0, 1, 'without'],   // un seul non suffit
    [1, 1, 'with'],      // 50 % : La Cité de la peur
    [1, 3, 'with'],      // 25 % pile
    [1, 4, 'without'],   // 20 %
    [3, 8, 'with'],      // 27 % : Jumanji, serpents
    [4, 113, 'without'], // 3 % et < 5 : The Thing, serpents
    [5, 58, 'with'],     // 5 oui : Flow
    [22, 93, 'with'],    // Le Silence des agneaux
    [2, 69, 'without'],  // Jurassic Park
  ])('%i oui / %i non → %s', (yes, no, expected) => {
    expect(classify(yes, no)).toBe(expected);
  });

  it('laisse la correction manuelle primer sur les votes', () => {
    expect(classify(1, 1, 'without')).toBe('without');
    expect(classify(0, 50, 'with')).toBe('with');
    expect(classify(0, 0, 'without')).toBe('without');
  });
});

describe('isTopic', () => {
  it('ne reconnaît que les sujets déclarés', () => {
    expect(isTopic('spiders')).toBe(true);
    expect(isTopic('snakes')).toBe(true);
    expect(isTopic('dogs')).toBe(false);
    expect(isTopic('toString')).toBe(false);
  });
});

describe('statusSql', () => {
  it('refuse un sujet inconnu plutôt que de l\'injecter dans le SQL', () => {
    expect(() => statusSql('x; DROP TABLE movies' as any)).toThrow(/topic/i);
  });

  it('produit une colonne par sujet', () => {
    const sql = warningStatusColumnsSql();
    for (const topic of Object.keys(TOPICS)) expect(sql).toContain(`AS ${topic}_status`);
  });
});
