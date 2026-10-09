import { getDatabase } from '../database';
import { ShelfSection } from './shelfItem';

export interface ShelfUnitRow {
  id: number;
  /** The letter the unit's shelf codes start with: A for A-1, A-2… */
  letter: string;
  position: number;
  /** How many standard cases a shelf of this unit holds, unless one says otherwise. */
  capacity: number;
}

export interface ShelfLevelRow {
  id: number;
  unit_id: number;
  /** 1 for the top shelf. */
  level: number;
  section: ShelfSection | null;
  capacity: number | null;
  /** The order key of the first object that found no room here: it and those after it start on the next shelf. */
  break_before: string | null;
  /** The order keys of the first and last object a locked shelf keeps: it keeps all up to the last, whatever its capacity. */
  locked_from: string | null;
  locked_through: string | null;
  locked: number;
}

type LevelColumn = 'section' | 'capacity' | 'break_before' | 'locked_from' | 'locked_through' | 'locked';
const LEVEL_COLUMNS: LevelColumn[] = ['section', 'capacity', 'break_before', 'locked_from', 'locked_through', 'locked'];

const run = (sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> =>
  new Promise((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number; changes: number }, err: Error | null) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    }));

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDatabase().all(sql, params, (err: Error | null, rows: T[]) => (err ? reject(err) : resolve(rows))));

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) =>
    getDatabase().get(sql, params, (err: Error | null, row: T | undefined) => (err ? reject(err) : resolve(row ?? null))));

/**
 * The shelving units side by side, each a column of shelves numbered from the
 * top. A shelf is given to a section, holds about so many standard cases, and
 * remembers what the owner told it: that an object found no room on it, or
 * that it is arranged and must keep what it holds.
 */
const ShelfFurniture = {
  createTable: async (): Promise<void> => {
    await run(`
      CREATE TABLE IF NOT EXISTS shelf_units (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        letter   TEXT NOT NULL UNIQUE,
        position INTEGER NOT NULL,
        capacity INTEGER NOT NULL
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS shelf_levels (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id        INTEGER NOT NULL REFERENCES shelf_units(id) ON DELETE CASCADE,
        level          INTEGER NOT NULL,
        section        TEXT,
        capacity       INTEGER,
        break_before   TEXT,
        locked_from    TEXT,
        locked_through TEXT,
        locked         INTEGER NOT NULL DEFAULT 0,
        UNIQUE (unit_id, level)
      )
    `);
    await run(`UPDATE shelf_levels SET section = NULL WHERE section = 'box_sets'`);
  },

  units: (): Promise<ShelfUnitRow[]> => all<ShelfUnitRow>(`SELECT * FROM shelf_units ORDER BY position, letter`),

  levels: (): Promise<ShelfLevelRow[]> => all<ShelfLevelRow>(`SELECT * FROM shelf_levels ORDER BY unit_id, level`),

  unit: (id: number): Promise<ShelfUnitRow | null> => get<ShelfUnitRow>(`SELECT * FROM shelf_units WHERE id = ?`, [id]),

  level: (id: number): Promise<ShelfLevelRow | null> => get<ShelfLevelRow>(`SELECT * FROM shelf_levels WHERE id = ?`, [id]),

  /** A unit after the others, its shelves given to a section or left free. */
  createUnit: async (letter: string, levels: number, capacity: number, section: ShelfSection | null): Promise<number> => {
    const last = await get<{ position: number | null }>(`SELECT MAX(position) AS position FROM shelf_units`);
    const { lastID } = await run(
      `INSERT INTO shelf_units (letter, position, capacity) VALUES (?, ?, ?)`,
      [letter, (last?.position ?? 0) + 1, capacity]
    );
    for (let level = 1; level <= levels; level += 1) {
      await run(`INSERT INTO shelf_levels (unit_id, level, section) VALUES (?, ?, ?)`, [lastID, level, section]);
    }
    return lastID;
  },

  /** Changes a unit's letter or its shelves' capacity, and adds or takes off shelves at the bottom. */
  updateUnit: async (id: number, changes: { letter?: string; capacity?: number; levels?: number }): Promise<void> => {
    if (changes.letter !== undefined) await run(`UPDATE shelf_units SET letter = ? WHERE id = ?`, [changes.letter, id]);
    if (changes.capacity !== undefined) await run(`UPDATE shelf_units SET capacity = ? WHERE id = ?`, [changes.capacity, id]);
    if (changes.levels !== undefined) {
      const current = await get<{ count: number }>(`SELECT COUNT(*) AS count FROM shelf_levels WHERE unit_id = ?`, [id]);
      for (let level = (current?.count ?? 0) + 1; level <= changes.levels; level += 1) {
        await run(`INSERT INTO shelf_levels (unit_id, level) VALUES (?, ?)`, [id, level]);
      }
      await run(`UPDATE shelf_items SET level_id = NULL WHERE level_id IN (SELECT id FROM shelf_levels WHERE unit_id = ? AND level > ?)`, [id, changes.levels]);
      await run(`DELETE FROM shelf_levels WHERE unit_id = ? AND level > ?`, [id, changes.levels]);
    }
  },

  /** Moves a unit one place to the left or the right. */
  moveUnit: async (id: number, direction: -1 | 1): Promise<void> => {
    const units = await ShelfFurniture.units();
    const at = units.findIndex(unit => unit.id === id);
    const other = units[at + direction];
    if (at < 0 || !other) return;
    const ordered = [...units];
    [ordered[at], ordered[at + direction]] = [ordered[at + direction], ordered[at]];
    for (const [index, unit] of ordered.entries()) {
      await run(`UPDATE shelf_units SET position = ? WHERE id = ?`, [index + 1, unit.id]);
    }
  },

  deleteUnit: async (id: number): Promise<void> => {
    await run(`UPDATE shelf_items SET level_id = NULL WHERE level_id IN (SELECT id FROM shelf_levels WHERE unit_id = ?)`, [id]);
    await run(`DELETE FROM shelf_levels WHERE unit_id = ?`, [id]);
    await run(`DELETE FROM shelf_units WHERE id = ?`, [id]);
  },

  updateLevel: async (id: number, changes: Partial<Pick<ShelfLevelRow, LevelColumn>>): Promise<void> => {
    for (const [column, value] of Object.entries(changes)) {
      if (value === undefined || !LEVEL_COLUMNS.includes(column as LevelColumn)) continue;
      await run(`UPDATE shelf_levels SET ${column} = ? WHERE id = ?`, [value, id]);
    }
  },
};

export default ShelfFurniture;
