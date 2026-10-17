import React, { useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import musicService, { type AlbumNote } from '../services/musicService';
import './AlbumNotes.css';
import Button from './shared/Button';

const today = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** "2026-10-07" as the reader's locale writes a day, without a time zone shifting it. */
const dayLabel = (date: string): string => {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

interface AlbumNotesProps {
  albumId: number;
  /** The first note is being written, from the link above: a CD with no note shows nothing until then. */
  writing?: boolean;
  /** How many notes the CD has, once they are read. */
  onCount?: (count: number) => void;
}

/**
 * A CD's listening journal: one dated note per attentive listening, the
 * latest first. Writing one is right there; editing and deleting stay quiet.
 * A CD with no note yet shows nothing: the link to write the first one sits
 * in the line above.
 */
const AlbumNotes: React.FC<AlbumNotesProps> = ({ albumId, writing = false, onCount }) => {
  const [notes, setNotes] = useState<AlbumNote[] | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [date, setDate] = useState<string>(today());
  const [editing, setEditing] = useState<{ id: number; note: string; date: string } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setNotes(null);
    musicService.getAlbumNotes(albumId)
      .then(list => { if (current) setNotes(list); })
      .catch(err => { if (current) { setNotes([]); setError((err as Error).message); } });
    return () => { current = false; };
  }, [albumId]);

  useEffect(() => {
    if (notes) onCount?.(notes.length);
  }, [notes, onCount]);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    run(async () => {
      const note = await musicService.addAlbumNote(albumId, draft.trim(), date);
      setNotes(list => [note, ...(list || [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id));
      setDraft('');
      setDate(today());
    });
  };

  const save = () => {
    if (!editing || !editing.note.trim()) return;
    run(async () => {
      const note = await musicService.updateAlbumNote(editing.id, editing.note.trim(), editing.date);
      setNotes(list => (list || []).map(n => (n.id === note.id ? note : n)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id));
      setEditing(null);
    });
  };

  const remove = (id: number) => run(async () => {
    await musicService.deleteAlbumNote(id);
    setNotes(list => (list || []).filter(n => n.id !== id));
  });

  // Nothing while the notes load, nor for a CD with none until its first is being written.
  if (notes === null || (notes.length === 0 && !writing && !error)) return null;

  return (
    <div className="info-section album-notes">
      <h4>Listening notes</h4>

      <Form className="album-notes-form" onSubmit={add}>
        <Form.Control
          as="textarea"
          rows={2}
          placeholder="What did you hear this time?"
          autoFocus={writing && notes.length === 0}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          aria-label="New listening note"
        />
        <div className="album-notes-form-row">
          <Form.Control type="date" size="sm" value={date} max={today()} onChange={e => setDate(e.target.value)} aria-label="Day of the listening" />
          <Button type="submit" size="sm" disabled={saving || !draft.trim()}>Add note</Button>
        </div>
      </Form>

      {error && <p className="album-notes-error">{error}</p>}

      {notes && notes.length > 0 && (
        <ol className="album-notes-list">
          {notes.map(note => (
            <li key={note.id}>
              {editing?.id === note.id ? (
                <div className="album-notes-edit">
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={editing.note}
                    onChange={e => setEditing({ ...editing, note: e.target.value })}
                    aria-label="Edit the note"
                  />
                  <div className="album-notes-form-row">
                    <Form.Control type="date" size="sm" value={editing.date.slice(0, 10)} max={today()} onChange={e => setEditing({ ...editing, date: e.target.value })} aria-label="Day of the listening" />
                    <Button size="sm" onClick={save} disabled={saving || !editing.note.trim()}>Save</Button>
                    <Button variant="quiet" size="sm" className="album-notes-action" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="album-notes-meta">
                    <time dateTime={note.date}>{dayLabel(note.date)}</time>
                    <span className="album-notes-actions">
                      <Button variant="quiet" size="sm" className="album-notes-action" onClick={() => setEditing({ id: note.id, note: note.note, date: note.date })}>Edit</Button>
                      <Button variant="danger" size="sm" className="album-notes-action" onClick={() => remove(note.id)} disabled={saving}>Delete</Button>
                    </span>
                  </div>
                  <p className="album-notes-text">{note.note}</p>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default AlbumNotes;
