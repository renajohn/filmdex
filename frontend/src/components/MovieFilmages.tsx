import React, { useEffect, useState } from 'react';
import { BsPencil, BsBoxArrowUpRight } from 'react-icons/bs';
import apiService from '../services/api';
import Button, { IconButton } from './shared/Button';
import { TextField, FieldError } from './shared/TextField';
import './MovieFilmages.css';

interface FilmagesElement {
  label: string;
  description: string;
}

export interface MovieFilmagesData {
  movieId: number;
  filmagesId: number | null;
  filmagesUrl: string | null;
  ageLegal: number | null;
  ageSuggested: number | null;
  indications: FilmagesElement[];
  counterIndications: FilmagesElement[];
  synthesis: string | null;
  matchedBy: 'auto' | 'manual' | null;
  checkedAt: string | null;
  /** The age the movie now shows, and where it comes from ('filmages', or null for TMDB/OMDB). */
  movieAge: number | null;
  ageSource: string | null;
}

interface Props {
  movieId: number;
  /** FilmAges' answer changed the movie's age (a film chosen by hand, or none). */
  onChange?: (data: MovieFilmagesData) => void;
}

const ageText = (age: number | null) => (age === null ? '—' : `${age}+`);

const Elements: React.FC<{ title: string; elements: FilmagesElement[] }> = ({ title, elements }) =>
  elements.length ? (
    <div className="movie-filmages-row">
      <span className="movie-filmages-key">{title}</span>
      <span className="movie-filmages-elements">
        {elements.map(element => (
          <span key={element.label} className="movie-filmages-element" title={element.description}>
            {element.label}
          </span>
        ))}
      </span>
    </div>
  ) : null;

/**
 * The ages set by FilmAges (filmages.ch, the cinema commissions of Vaud and Geneva):
 * legal and suggested, the elements weighed, the commission's synthesis.
 */
const MovieFilmages: React.FC<Props> = ({ movieId, onChange }) => {
  const [data, setData] = useState<MovieFilmagesData | null>(null);
  const [editing, setEditing] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synthesisOpen, setSynthesisOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setEditing(false);
    setLinkInput('');
    setError(null);
    setSynthesisOpen(false);
    apiService.getMovieFilmages(movieId)
      .then(result => { if (!cancelled) setData(result as MovieFilmagesData); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [movieId]);

  if (!data) return null;

  const apply = (promise: Promise<unknown>) => {
    setError(null);
    setBusy(true);
    promise
      .then(result => {
        const next = result as MovieFilmagesData;
        setData(next);
        setEditing(false);
        setLinkInput('');
        onChange?.(next);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const saveLink = () => {
    const value = linkInput.trim();
    if (!/^(?:.*items\/)?\d+(?:\.html)?\/?$/.test(value)) {
      setError('Paste the FilmAges page address, or the number at its end');
      return;
    }
    apply(apiService.setFilmagesLink(movieId, value));
  };

  const found = data.filmagesId !== null;

  return (
    <div className="movie-filmages">
      <div className="movie-filmages-row movie-filmages-head">
        {data.filmagesUrl ? (
          <a href={data.filmagesUrl} target="_blank" rel="noreferrer" className="movie-filmages-key movie-filmages-link" title="Open the film on filmages.ch">
            FilmAges <BsBoxArrowUpRight size={10} />
          </a>
        ) : (
          <span className="movie-filmages-key">FilmAges</span>
        )}
        {found ? (
          <span className="movie-filmages-ages">
            <span>Legal <strong>{ageText(data.ageLegal)}</strong></span>
            <span>Suggested <strong>{ageText(data.ageSuggested)}</strong></span>
          </span>
        ) : (
          <span className="movie-filmages-missing">
            {data.checkedAt ? 'Not on FilmAges' : 'Not looked up on FilmAges yet'}
          </span>
        )}
        <IconButton size="sm" label="Choose the FilmAges film…" active={editing} onClick={() => setEditing(!editing)}>
          <BsPencil />
        </IconButton>
      </div>

      {found && (
        <>
          <Elements title="For" elements={data.indications} />
          <Elements title="Against" elements={data.counterIndications} />
          {data.synthesis && (
            <button
              type="button"
              className={`movie-filmages-synthesis${synthesisOpen ? ' is-open' : ''}`}
              aria-expanded={synthesisOpen}
              onClick={() => setSynthesisOpen(!synthesisOpen)}
            >
              {data.synthesis}
            </button>
          )}
        </>
      )}

      {editing && (
        <div className="movie-filmages-edit">
          <div className="movie-filmages-edit-line">
            <TextField
              size="sm"
              type="text"
              aria-label="FilmAges page"
              placeholder="https://www.filmages.ch/films/detail/items/…"
              value={linkInput}
              isInvalid={Boolean(error)}
              onChange={e => setLinkInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveLink(); }}
            />
            <Button size="sm" onClick={saveLink} loading={busy}>Save link</Button>
          </div>
          <div className="movie-filmages-edit-line">
            {data.matchedBy === 'manual' && (
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => apply(apiService.clearFilmagesLink(movieId))}>
                Search again
              </Button>
            )}
            {(found || data.matchedBy !== 'manual') && (
              <Button size="sm" variant="quiet" disabled={busy} onClick={() => apply(apiService.setFilmagesLink(movieId, null))}>
                Not on FilmAges
              </Button>
            )}
            <span className="movie-filmages-meta">
              {data.matchedBy === 'manual' ? 'Chosen by hand' : found ? 'Found by title and director' : ''}
            </span>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
      )}
    </div>
  );
};

export default MovieFilmages;
