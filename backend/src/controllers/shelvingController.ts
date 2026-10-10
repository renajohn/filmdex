import { Request, Response } from 'express';
import { SHELF_KINDS, SHELF_SECTIONS, ShelfKind, ShelfSection, ShelfSettings } from '../models/shelfItem';
import shelvingService, { ShelvingError } from '../services/shelvingService';
import logger from '../logger';

const fail = (res: Response, what: string, error: unknown): void => {
  logger.error(`${what}:`, (error as Error).message);
  res.status(500).json({ error: `${what} failed` });
};

/** A place's name from the body, or null after answering why it is missing. */
const placeNameOf = (req: Request, res: Response): string | null => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'A place needs a name' });
    return null;
  }
  return name;
};

const isTaken = (error: unknown): boolean => /UNIQUE/.test((error as Error).message);

/** A whole number of cases from 1 to 500, or undefined when the body does not hold one. */
const casesOf = (value: unknown): number | undefined =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 500 ? value as number : undefined;

const LETTER = /^[A-Z][A-Z0-9]{0,2}$/;

/** Answers an action on the shelves: ok, the reason it cannot be done, or a failure. */
const act = async (res: Response, what: string, action: () => Promise<unknown>, status = 200): Promise<void> => {
  try {
    await action();
    if (status === 204) res.status(204).end();
    else res.status(status).json({ ok: true });
  } catch (error) {
    if (error instanceof ShelvingError) res.status(error.status).json({ error: error.message });
    else if (isTaken(error)) res.status(409).json({ error: 'There is already a unit with that letter' });
    else fail(res, what, error);
  }
};

const shelvingController = {
  /** A shelving unit after the others: its letter, how many shelves, how many cases a shelf holds, and the section they start with. */
  createUnit: async (req: Request, res: Response): Promise<void> => {
    const body = req.body || {};
    const letter = typeof body.letter === 'string' ? body.letter.trim().toUpperCase() : '';
    const levels = Number.isInteger(body.levels) && body.levels >= 1 && body.levels <= 20 ? body.levels : undefined;
    const capacity = casesOf(body.capacity);
    const section = body.section ?? null;
    if (!LETTER.test(letter)) {
      res.status(400).json({ error: 'A unit needs a letter, such as A' });
      return;
    }
    if (levels === undefined || capacity === undefined) {
      res.status(400).json({ error: 'A unit needs 1 to 20 shelves, each holding 1 to 500 cases' });
      return;
    }
    if (section !== null && !SHELF_SECTIONS.includes(section)) {
      res.status(400).json({ error: `Unknown section "${section}"` });
      return;
    }
    await act(res, 'Adding a unit', () => shelvingService.createUnit(letter, levels, capacity, section), 201);
  },

  /** Another letter, capacity or number of shelves, or a move one place left (-1) or right (1). */
  updateUnit: async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (!(await shelvingService.unit(id))) {
      res.status(404).json({ error: 'Unit not found' });
      return;
    }
    const changes: { letter?: string; capacity?: number; levels?: number } = {};
    if ('letter' in body) {
      const letter = typeof body.letter === 'string' ? body.letter.trim().toUpperCase() : '';
      if (!LETTER.test(letter)) {
        res.status(400).json({ error: 'A unit needs a letter, such as A' });
        return;
      }
      changes.letter = letter;
    }
    if ('capacity' in body) {
      changes.capacity = casesOf(body.capacity);
      if (changes.capacity === undefined) {
        res.status(400).json({ error: 'A shelf holds 1 to 500 cases' });
        return;
      }
    }
    if ('levels' in body) {
      if (!(Number.isInteger(body.levels) && body.levels >= 1 && body.levels <= 20)) {
        res.status(400).json({ error: 'A unit has 1 to 20 shelves' });
        return;
      }
      changes.levels = body.levels;
    }
    await act(res, 'Changing a unit', async () => {
      await shelvingService.updateUnit(id, changes);
      if (body.move === -1 || body.move === 1) await shelvingService.moveUnit(id, body.move);
    });
  },

  deleteUnit: (req: Request, res: Response): Promise<void> =>
    act(res, 'Deleting a unit', () => shelvingService.deleteUnit(Number(req.params.id)), 204),

  /** A shelf's section and capacity (null: its unit's), lock, or the object that had no room on it forgotten. */
  updateLevel: async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (!(await shelvingService.level(id))) {
      res.status(404).json({ error: 'Shelf not found' });
      return;
    }
    const changes: { section?: ShelfSection | null; capacity?: number | null } = {};
    if ('section' in body) {
      if (body.section !== null && !SHELF_SECTIONS.includes(body.section)) {
        res.status(400).json({ error: `Unknown section "${body.section}"` });
        return;
      }
      changes.section = body.section;
    }
    if ('capacity' in body) {
      if (body.capacity !== null && casesOf(body.capacity) === undefined) {
        res.status(400).json({ error: 'A shelf holds 1 to 500 cases' });
        return;
      }
      changes.capacity = body.capacity;
    }
    await act(res, 'Changing a shelf', async () => {
      if (Object.keys(changes).length > 0) await shelvingService.updateLevel(id, changes);
      if (typeof body.locked === 'boolean') await shelvingService.setLocked(id, body.locked);
      if (body.breakBefore === null) await shelvingService.clearBreak(id);
    });
  },

  /** The object did not fit on its shelf: it and those after it go on the next one. */
  noRoom: async (req: Request, res: Response): Promise<void> => {
    const kind = req.params.kind as ShelfKind;
    const id = Number(req.params.id);
    if (!SHELF_KINDS.includes(kind) || !Number.isInteger(id)) {
      res.status(404).json({ error: 'Unknown item' });
      return;
    }
    await act(res, 'Moving to the next shelf', () => shelvingService.noRoom(kind, id, req.body?.full === true));
  },

  /** It would fit on the shelf before: that shelf takes it. */
  moveBack: async (req: Request, res: Response): Promise<void> => {
    const kind = req.params.kind as ShelfKind;
    const id = Number(req.params.id);
    if (!SHELF_KINDS.includes(kind) || !Number.isInteger(id)) {
      res.status(404).json({ error: 'Unknown item' });
      return;
    }
    await act(res, 'Moving to the shelf before', () => shelvingService.moveBack(kind, id));
  },

  /** The owner made the moves listed: they stand where the plan has them. */
  movesDone: async (req: Request, res: Response): Promise<void> => {
    const moves = Array.isArray(req.body?.moves) ? req.body.moves : null;
    const valid = moves?.every((move: any) => SHELF_KINDS.includes(move?.kind) && Number.isInteger(move?.id)
      && (move.to === null || (typeof move.to === 'string' && move.to.length <= 200)));
    if (!valid) {
      res.status(400).json({ error: 'List the moves made' });
      return;
    }
    await act(res, 'Recording the moves made', () => shelvingService.movesDone(moves));
  },

  /** Keeps a collection's films together on the shelf, or not. */
  setTogether: async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || typeof req.body?.together !== 'boolean') {
      res.status(400).json({ error: 'Say whether to keep the collection together' });
      return;
    }
    await act(res, 'Keeping a collection together', () => shelvingService.setTogether(id, req.body.together));
  },

  /** Every object in shelf order within its section, and those kept elsewhere. */
  plan: async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await shelvingService.plan());
    } catch (error) {
      fail(res, 'Shelving plan', error);
    }
  },

  /** Where each film and CD is, by id: a shelf code or a place's name. */
  locations: async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await shelvingService.locations());
    } catch (error) {
      fail(res, 'Shelf locations', error);
    }
  },

  /** What the owner sets by hand for one object: its section, the name it is filed under, a place off the shelves. Null puts a field back to automatic. */
  saveItem: async (req: Request, res: Response): Promise<void> => {
    const kind = req.params.kind as ShelfKind;
    const id = Number(req.params.id);
    if (!SHELF_KINDS.includes(kind) || !Number.isInteger(id)) {
      res.status(404).json({ error: 'Unknown item' });
      return;
    }
    const body = req.body || {};
    const settings: ShelfSettings = {};
    if ('section' in body) {
      if (body.section !== null && !SHELF_SECTIONS.includes(body.section as ShelfSection)) {
        res.status(400).json({ error: `Unknown section "${body.section}". Expected ${SHELF_SECTIONS.join(', ')}.` });
        return;
      }
      settings.section = body.section;
    }
    if ('shelveUnder' in body) {
      settings.shelveUnder = typeof body.shelveUnder === 'string' && body.shelveUnder.trim() ? body.shelveUnder.trim() : null;
    }
    if ('placeId' in body) {
      if (body.placeId !== null && !Number.isInteger(body.placeId)) {
        res.status(400).json({ error: 'placeId must be a place id or null' });
        return;
      }
      if (body.placeId !== null && !(await shelvingService.places()).some(place => place.id === body.placeId)) {
        res.status(400).json({ error: 'Unknown place' });
        return;
      }
      settings.placeId = body.placeId;
    }
    if ('levelId' in body) {
      if (body.levelId !== null && !(Number.isInteger(body.levelId) && (await shelvingService.level(body.levelId)))) {
        res.status(400).json({ error: 'Unknown shelf' });
        return;
      }
      settings.levelId = body.levelId;
    }
    // An object is on one shelf or in one place, never both.
    if (settings.levelId != null) settings.placeId = null;
    else if (settings.placeId != null) settings.levelId = null;
    if ('units' in body) {
      if (body.units !== null && !(typeof body.units === 'number' && body.units >= 0.5 && body.units <= 50)) {
        res.status(400).json({ error: 'units must be a number of cases from 0.5 to 50, or null' });
        return;
      }
      settings.units = body.units === null ? null : Math.round(body.units * 10) / 10;
    }
    try {
      await shelvingService.saveSettings(kind, id, settings);
      res.json({ ok: true });
    } catch (error) {
      fail(res, 'Saving shelving', error);
    }
  },

  places: async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await shelvingService.places());
    } catch (error) {
      fail(res, 'Listing places', error);
    }
  },

  createPlace: async (req: Request, res: Response): Promise<void> => {
    const name = placeNameOf(req, res);
    if (name === null) return;
    try {
      res.status(201).json(await shelvingService.createPlace(name));
    } catch (error) {
      if (isTaken(error)) res.status(409).json({ error: `There is already a place called "${name}"` });
      else fail(res, 'Creating a place', error);
    }
  },

  renamePlace: async (req: Request, res: Response): Promise<void> => {
    const name = placeNameOf(req, res);
    if (name === null) return;
    try {
      const place = await shelvingService.renamePlace(Number(req.params.id), name);
      if (place) res.json(place);
      else res.status(404).json({ error: 'Place not found' });
    } catch (error) {
      if (isTaken(error)) res.status(409).json({ error: `There is already a place called "${name}"` });
      else fail(res, 'Renaming a place', error);
    }
  },

  /** What was kept there goes back to the shelves. */
  deletePlace: async (req: Request, res: Response): Promise<void> => {
    try {
      await shelvingService.deletePlace(Number(req.params.id));
      res.status(204).end();
    } catch (error) {
      fail(res, 'Deleting a place', error);
    }
  },
};

export default shelvingController;
