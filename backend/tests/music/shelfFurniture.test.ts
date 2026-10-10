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
    expect(moves.every((move: any) => move.toLevelId != null)).toBe(true);

    await request(app).post('/api/shelving/moves/done').send({ moves }).expect(200);
    expect(await movesNow()).toEqual([]);
    await request(app).post('/api/shelving/moves/done').send({ moves: [{ kind: 'shelf', id: 1, to: 'M-1' }] }).expect(400);
  });

  it('remplit un étage pas à pas : ce qui tient y reste, les derniers sortis passent au suivant, et tout se défait', async () => {
    await request(app).post('/api/shelving/units').send({ letter: 'U', levels: 3, capacity: 2, section: 'films' }).expect(201);
    const movesNow = async () => (await request(app).get('/api/shelving/locations')).body.moves;
    await request(app).post('/api/shelving/moves/done').send({ moves: await movesNow() }).expect(200);
    await insertMovie('Zx Undo');
    const moves = await movesNow();
    const arrival = moves[0];
    expect(arrival).toMatchObject({ title: 'Zx Undo', from: null, toLevelId: expect.any(Number) });
    const shelf = arrival.toLevelId;

    // What stands there and what arrives, in order, the ones the plan pushes on included.
    const line = (await request(app).get(`/api/shelving/levels/${shelf}/line`).expect(200)).body;
    expect(line.code).toBe(arrival.to);
    expect(line.items.some((item: any) => item.title === 'Zx Undo')).toBe(true);
    const pushed = moves.filter((move: any) => move.from === arrival.to);
    expect(pushed.length).toBeGreaterThan(0);
    expect(pushed.every((move: any) => line.items.some((item: any) => item.id === move.id))).toBe(true);

    // It fits: the shelf keeps all of it, and nothing goes on from there.
    const before = (await request(app).get('/api/shelving/levels/state').expect(200)).body.levels;
    await request(app).post(`/api/shelving/levels/${shelf}/take-off`).send({ count: 0 }).expect(200);
    expect((await movesNow()).filter((move: any) => move.from === arrival.to)).toEqual([]);

    // Too tight, twice: the last two go on to the next shelf.
    await request(app).post(`/api/shelving/levels/${shelf}/take-off`).send({ count: 2 }).expect(200);
    const off = (await movesNow()).filter((move: any) => move.from === arrival.to).map((move: any) => move.id);
    expect(off).toEqual(line.items.slice(-2).filter((item: any) => item.title !== 'Zx Undo').map((item: any) => item.id));
    await request(app).post(`/api/shelving/levels/${shelf}/take-off`).send({ count: line.items.length }).expect(409);

    // Taken back: the shelves as they were told before, the moves as they were listed.
    await request(app).put('/api/shelving/levels/state').send({ levels: before }).expect(200);
    expect(await movesNow()).toEqual(moves);
    await request(app).put('/api/shelving/levels/state').send({ levels: [{ id: 'x' }] }).expect(400);
    await request(app).post('/api/shelving/moves/done').send({ moves }).expect(200);
    await request(app).post('/api/shelving/moves/undo').send({ moves: moves.map(({ kind, id, from }: any) => ({ kind, id, from })) }).expect(200);
    expect(await movesNow()).toEqual(moves);
    await request(app).post('/api/shelving/moves/undo').send({ moves: [{ kind: 'shelf', id: 1, from: null }] }).expect(400);
    await request(app).get('/api/shelving/levels/999999/line').expect(404);
  });
});
