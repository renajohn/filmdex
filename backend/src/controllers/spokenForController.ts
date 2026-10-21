import { Request, Response } from 'express';
import { setSpokenFor, SpokenForTable } from '../models/spokenFor';

// PUT { spokenFor: boolean } on a wished movie, album or book.
const update = (table: SpokenForTable) => async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { spokenFor } = req.body ?? {};
    if (typeof spokenFor !== 'boolean') {
      res.status(400).json({ error: 'spokenFor must be true or false' });
      return;
    }
    if (!(await setSpokenFor(table, id, spokenFor))) {
      res.status(404).json({ error: 'No wished title with this id' });
      return;
    }
    res.json({ id, spokenFor });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

const spokenForController = {
  updateMovie: update('movies'),
  updateAlbum: update('albums'),
  updateBook: update('books'),
};

export default spokenForController;
