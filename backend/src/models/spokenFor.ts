import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';

export type SpokenForTable = 'movies' | 'albums' | 'books';

/**
 * A wish already taken care of (ordered, a bid made, a gift to come) is
 * "spoken for": it stays on the wish list with nothing more to do. Only a
 * wished title can be; leaving the wish list clears it (a trigger, migration
 * 017). Resolves to false when there is no wished title with this id.
 */
export const setSpokenFor = (table: SpokenForTable, id: number, spokenFor: boolean): Promise<boolean> =>
  new Promise((resolve, reject) => {
    getDatabase().run(
      `UPDATE ${table} SET spoken_for = ? WHERE id = ? AND title_status = 'wish'`,
      [spokenFor ? 1 : 0, id],
      function (this: sqlite3.RunResult, err: Error | null) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
  });
