import { describe, expect, it } from 'vitest';
import { canonicalQuery } from '../components/shared/search/query';
import { booksSchema } from '../components/shared/search/schemas/books';
import { chosenOwners, clickOwner, withOwners } from './bookOwners';

describe('les boutons de propriétaires et la pastille owner', () => {
  it('allume les boutons de la pastille owner, telle que le champ l’écrit', () => {
    expect(chosenOwners('')).toEqual([]);
    expect(chosenOwners('owner:Alice')).toEqual(['Alice']);
    expect(chosenOwners('dune owner:Alice,Oriane')).toEqual(['Alice', 'Oriane']);
    expect(chosenOwners('owner:"Marie Claire",none')).toEqual(['Marie Claire', 'none']);
    expect(chosenOwners('OWNER:none')).toEqual(['none']);
    expect(chosenOwners(canonicalQuery('owner:"Alice" type:book', booksSchema.keys))).toEqual(['Alice']);
  });

  it("n'allume rien pour une exclusion ni une pastille sans valeur", () => {
    expect(chosenOwners('-owner:Alice')).toEqual([]);
    expect(chosenOwners('!owner:Alice')).toEqual([]);
    expect(chosenOwners('owner:')).toEqual([]);
    expect(chosenOwners('-owner:Alice owner:Oriane')).toEqual(['Oriane']);
  });

  it('éteint le bouton quand la pastille est retirée', () => {
    // The field takes the pill away: the string has no owner left, no button is chosen.
    expect(chosenOwners('dune')).toEqual([]);
  });

  it('un clic remplace la pastille, à sa place, et un second clic la retire', () => {
    expect(clickOwner('', 'Alice', false)).toBe('owner:Alice');
    expect(clickOwner('dune owner:Oriane type:book', 'Alice', false)).toBe('dune owner:Alice type:book');
    expect(clickOwner('dune owner:Alice type:book', 'Alice', false)).toBe('dune type:book');
    expect(clickOwner('owner:Alice,Oriane', 'Alice', false)).toBe('owner:Alice');
    expect(clickOwner('-owner:none dune', 'none', false)).toBe('owner:none dune');
    expect(clickOwner('dune', 'Marie Claire', false)).toBe('owner:"Marie Claire" dune');
  });

  it('un Alt-clic ajoute ou retire un nom dans la même pastille', () => {
    expect(clickOwner('owner:Alice', 'Oriane', true)).toBe('owner:Alice,Oriane');
    expect(clickOwner('owner:Alice,Oriane', 'alice', true)).toBe('owner:Oriane');
    expect(clickOwner('owner:Alice dune', 'Alice', true)).toBe('dune');
    expect(clickOwner('-owner:Renault', 'Alice', true)).toBe('owner:Alice -owner:Renault');
    expect(clickOwner('owner:Alice', 'none', true)).toBe('owner:Alice,none');
  });

  it('écrit la forme que le champ écrit lui-même', () => {
    const q = withOwners('title:"Vol: 2"', ['Alice', 'Le Guin']);
    expect(q).toBe('owner:Alice,"Le Guin" title:"Vol: 2"');
    expect(canonicalQuery(q, booksSchema.keys)).toBe(q);
  });
});
