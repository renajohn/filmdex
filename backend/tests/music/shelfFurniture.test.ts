import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import { fillShelves, FillShelf, usableCases } from '../../src/services/shelfFill';

const shelf = (id: number, fields: Partial<FillShelf> = {}): FillShelf => ({
  id, capacity: 10, locked: false, lockedFrom: null, lockedThrough: null, breakBefore: null, ...fields,
});
const items = (...keys: string[]) => keys.map(key => ({ key, units: 1 }));

describe('le remplissage des étagères', () => {
  it('remplit chaque étage jusqu’à sa capacité, dans l’ordre, et compte ce qui ne tient nulle part', () => {
    expect(usableCases(10)).toBe(10);
    const keys = 'abcdefghijklmnopqrstuv'.split('');
    const { shelfOf, overflow } = fillShelves([shelf(1), shelf(2)], items(...keys));
    expect(shelfOf.slice(0, 10)).toEqual(Array(10).fill(1));
    expect(shelfOf.slice(10, 20)).toEqual(Array(10).fill(2));
    expect(overflow).toBe(2);
  });

  it('met 12 Blu-ray, ou 10 DVD, sur un étage qui en tient 12', () => {
    const blurays = fillShelves([shelf(1, { capacity: 12 })], items(...'abcdefghijklm'.split('')));
    expect(blurays.shelfOf.filter(id => id === 1)).toHaveLength(12);
    const dvds = fillShelves([shelf(1, { capacity: 12 })], 'abcdefghijkl'.split('').map(key => ({ key, units: 1.2 })));
    expect(dvds.shelfOf.filter(id => id === 1)).toHaveLength(10);
  });

  it('prend sur un étage ce qu’on y a remonté, même au-delà de sa place', () => {
    const { shelfOf } = fillShelves([shelf(1, { capacity: 2, extendThrough: 'c' }), shelf(2)], items('a', 'b', 'c', 'd'));
    expect(shelfOf).toEqual([1, 1, 1, 2]);
  });

  it('compte un coffret selon sa largeur, et donne un étage vide à un objet plus large que lui', () => {
    const { shelfOf } = fillShelves([shelf(1, { capacity: 3 }), shelf(2, { capacity: 3 })],
      [{ key: 'a', units: 2 }, { key: 'b', units: 2 }, { key: 'c', units: 9 }]);
    expect(shelfOf).toEqual([1, 2, null]);
  });

  it('passe à l’étage suivant à partir de l’objet qui n’avait pas la place', () => {
    const { shelfOf } = fillShelves([shelf(1, { breakBefore: 'c' }), shelf(2)], items('a', 'b', 'c', 'd'));
    expect(shelfOf).toEqual([1, 1, 2, 2]);
  });

  it('oublie qu’un étage n’avait pas la place quand plus aucun étage après lui ne prend la suite', () => {
    const { shelfOf, overflow } = fillShelves([shelf(1, { breakBefore: 'c' })], items('a', 'b', 'c', 'd'));
    expect(shelfOf).toEqual([1, 1, 1, 1]);
    expect(overflow).toBe(0);
  });

  it('compte la place prise par ce qui est posé à la main', () => {
    const { shelfOf } = fillShelves([shelf(1, { reserved: 10 }), shelf(2)], items('a', 'b'));
    expect(shelfOf).toEqual([2, 2]);
  });

  it('garde à un étage verrouillé ce qu’il tenait, et un nouvel album à sa place parmi eux', () => {
    const shelves = [shelf(1), shelf(2, { locked: true, lockedFrom: 'm', lockedThrough: 'p' }), shelf(3)];
    const { shelfOf } = fillShelves(shelves, items('a', 'b', 'm', 'n', 'nn', 'o', 'p', 'q'));
    expect(shelfOf).toEqual([1, 1, 2, 2, 2, 2, 2, 3]);
  });
});

const insertMovie = (title: string) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO movies (title, release_date, format, title_status) VALUES (?, '2000-01-01', 'Blu-ray', 'owned')`,
      [title], function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

describe('les meubles', () => {
  it('donne un code à chaque film, déplace celui qui n’a pas la place et verrouille un étage', async () => {
    // Films only from this test: the others in this database sort elsewhere.
    const ids: number[] = [];
    for (const title of ['Zz Alpha', 'Zz Bravo', 'Zz Charlie', 'Zz Delta']) ids.push(await insertMovie(title));

    await request(app).post('/api/shelving/units').send({ letter: 'q', levels: 3, capacity: 500, section: 'films' }).expect(201);
    expect((await request(app).post('/api/shelving/units').send({ letter: 'Q', levels: 1, capacity: 10 })).status).toBe(409);
    await request(app).post('/api/shelving/units').send({ letter: 'A', levels: 0, capacity: 10 }).expect(400);

    let plan = (await request(app).get('/api/shelving')).body;
    const unit = plan.units.find((u: any) => u.letter === 'Q');
    expect(unit.levels.map((l: any) => l.code)).toEqual(['Q-1', 'Q-2', 'Q-3']);
    const codeOf = (body: any, id: number) => body.sections[0].items.find((i: any) => i.kind === 'movie' && i.id === id).code;
    expect(ids.map(id => codeOf(plan, id))).toEqual(['Q-1', 'Q-1', 'Q-1', 'Q-1']);

    await request(app).post(`/api/shelving/items/movie/${ids[2]}/no-room`).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    expect(ids.map(id => codeOf(plan, id))).toEqual(['Q-1', 'Q-1', 'Q-2', 'Q-2']);
    expect(plan.units.find((u: any) => u.letter === 'Q').levels[0].breakBefore).toBe('Zz Charlie');
    expect((await request(app).get('/api/shelving/locations')).body.movies[ids[2]]).toBe('Q-2');

    // Back onto the shelf before, then down again.
    await request(app).post(`/api/shelving/items/movie/${ids[2]}/move-back`).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    expect(ids.map(id => codeOf(plan, id))).toEqual(['Q-1', 'Q-1', 'Q-1', 'Q-2']);
    await request(app).post(`/api/shelving/items/movie/${ids[2]}/no-room`).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    expect(ids.map(id => codeOf(plan, id))).toEqual(['Q-1', 'Q-1', 'Q-2', 'Q-2']);
    const first = plan.sections[0].items.find((i: any) => i.code === 'Q-1');
    await request(app).post(`/api/shelving/items/${first.kind}/${first.id}/move-back`).expect(409);

    const second = unit.levels[1].id;
    await request(app).put(`/api/shelving/levels/${second}`).send({ locked: true }).expect(200);
    await request(app).put(`/api/shelving/levels/${unit.levels[2].id}`).send({ locked: true }).expect(409);
    const late = await insertMovie('Zz Charlie 2');
    plan = (await request(app).get('/api/shelving')).body;
    expect(codeOf(plan, late)).toBe('Q-2');

    // A shelf given to another section starts afresh.
    await request(app).put(`/api/shelving/levels/${second}`).send({ section: 'music' }).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    const level = plan.units.find((u: any) => u.letter === 'Q').levels[1];
    expect(level).toMatchObject({ section: 'music', locked: false });
    expect(codeOf(plan, ids[3])).toBe('Q-3');

    // Put by hand on a free shelf, out of the order; the shelf it would have gone on makes room for the next.
    const third = unit.levels[2].id;
    await request(app).put(`/api/shelving/levels/${third}`).send({ section: null }).expect(200);
    await request(app).put(`/api/shelving/items/movie/${ids[0]}`).send({ levelId: third }).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    expect(codeOf(plan, ids[0])).toBe('Q-3');
    expect(plan.sections[0].items.find((i: any) => i.id === ids[0] && i.kind === 'movie').pinned).toBe(true);
    await request(app).post(`/api/shelving/items/movie/${ids[0]}/no-room`).expect(409);
    await request(app).put(`/api/shelving/items/movie/${ids[0]}`).send({ levelId: 999999 }).expect(400);

    await request(app).delete(`/api/shelving/units/${unit.id}`).expect(204);
    plan = (await request(app).get('/api/shelving')).body;
    expect(codeOf(plan, ids[0])).toBeNull();
  });

  it('annonce ce qu’il faut déplacer quand un film arrive, jusqu’à ce que ce soit fait', async () => {
    await request(app).post('/api/shelving/units').send({ letter: 'M', levels: 4, capacity: 2, section: 'films' }).expect(201);
    const movesNow = async () => (await request(app).get('/api/shelving/locations')).body.moves;
    // What earlier tests moved is taken as done.
    await request(app).post('/api/shelving/moves/done').send({ moves: await movesNow() }).expect(200);
    expect(await movesNow()).toEqual([]);

    const first = await insertMovie('Zy First');
    const moves = await movesNow();
    expect(moves[0]).toMatchObject({ kind: 'movie', id: first, title: 'Zy First', from: null, to: 'M-1' });
    expect(moves.slice(1).every((move: any) => move.from && move.to !== move.from)).toBe(true);
    expect(moves.some((move: any) => move.from === 'M-1' && move.to === 'M-2')).toBe(true);
    // Where on the shelf: after the one before it, or before the next when it comes first.
    expect(moves.every((move: any) => !!move.after !== !!move.before)).toBe(true);
    expect(moves.find((move: any) => move.from === 'M-1' && move.to === 'M-2')).toMatchObject({ after: null, before: expect.any(String) });
    expect(await movesNow()).toEqual(moves);
    // One pushed on from the shelf just before may stay there; one put after another may go on for want of room.
    expect(moves.find((move: any) => move.from === 'M-1' && move.to === 'M-2')).toMatchObject({ canStay: true, canNoRoom: false });
    expect(moves.every((move: any) => move.canNoRoom === (move.to != null && move.after != null))).toBe(true);

    await request(app).post('/api/shelving/moves/done').send({ moves }).expect(200);
    expect(await movesNow()).toEqual([]);
    await request(app).post('/api/shelving/moves/done').send({ moves: [{ kind: 'shelf', id: 1, to: 'M-1' }] }).expect(400);
  });

  it('garde un étage plein à ce qu’il tient quand un film n’y a pas la place', async () => {
    await request(app).post('/api/shelving/units').send({ letter: 'P', levels: 3, capacity: 2, section: 'films' }).expect(201);
    let plan = (await request(app).get('/api/shelving')).body;
    const items = () => plan.sections[0].items.filter((i: any) => !i.pinned);
    // A shelf holding two, with a shelf of the section after it.
    const shelves = plan.units.flatMap((u: any) => u.levels).filter((l: any) => l.section === 'films');
    const target = shelves.slice(0, -1).find((l: any) => items().filter((i: any) => i.levelId === l.id).length >= 2);
    const level = () => plan.units.flatMap((u: any) => u.levels).find((l: any) => l.id === target.id);
    const held = items().filter((i: any) => i.levelId === target.id);
    const second = held[1];

    await request(app).post(`/api/shelving/items/${second.kind}/${second.id}/no-room`).send({ full: true }).expect(200);
    plan = (await request(app).get('/api/shelving')).body;
    expect(level().ownCapacity).toBe(held[0].units);
    expect(plan.sections[0].items.find((i: any) => i.kind === second.kind && i.id === second.id).levelId).not.toBe(target.id);
  });
});
