import React, { useEffect, useState } from 'react';
import { GiSpiderAlt, GiSnake } from 'react-icons/gi';
import apiService from '../services/api';
import './MovieWarnings.css';

export type WarningTopic = 'spiders' | 'snakes';
type Status = 'with' | 'without' | 'unknown';
type Override = 'with' | 'without' | null;

interface TopicWarning {
  topic: WarningTopic;
  status: Status;
  yes: number;
  no: number;
  override: Override;
  overrideAt: string | null;
  fetchedAt: string | null;
}

export interface MovieWarningsData {
  movieId: number;
  dddId: number | null;
  dddUrl: string | null;
  matchedBy: string | null;
  checkedAt: string | null;
  topics: TopicWarning[];
}

const LABELS: Record<WarningTopic, { name: string; Icon: React.ComponentType<{ size?: number }> }> = {
  spiders: { name: 'Spiders', Icon: GiSpiderAlt },
  snakes: { name: 'Snakes', Icon: GiSnake },
};

const STATUS_TEXT: Record<Status, string> = { with: 'With', without: 'Without', unknown: 'Unknown' };

interface Props {
  movieId: number;
  onSearch?: (query: string) => void;
}

const MovieWarnings: React.FC<Props> = ({ movieId, onSearch }) => {
  const [data, setData] = useState<MovieWarningsData | null>(null);
  const [open, setOpen] = useState<WarningTopic | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiService.getMovieWarnings(movieId)
      .then(result => { if (!cancelled) setData(result as MovieWarningsData); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [movieId]);

  if (!data) return null;

  const apply = (promise: Promise<unknown>) => {
    setError(null);
    promise
      .then(result => setData(result as MovieWarningsData))
      .catch((err: Error) => setError(err.message));
  };

  const saveLink = () => {
    const dddId = Number(linkInput);
    if (!Number.isInteger(dddId) || dddId <= 0) {
      setError('Enter the number at the end of the DoesTheDogDie page address');
      return;
    }
    apply(apiService.setDddLink(movieId, dddId));
  };

  return (
    <div className="movie-warnings">
      {data.topics.map(warning => {
        const { name, Icon } = LABELS[warning.topic];
        const summary = `${STATUS_TEXT[warning.status]}${warning.override ? ' (manual)' : ''} · ${warning.yes} yes / ${warning.no} no`;
        return (
          <div key={warning.topic} className="movie-warning">
            <span className={`movie-warning-chip status-${warning.status}`}>
              <button
                type="button"
                className="movie-warning-name"
                onClick={() => onSearch?.(`${warning.topic}:${warning.status}`)}
              >
                <Icon size={14} /> {name}
              </button>
              <button
                type="button"
                className="movie-warning-summary"
                aria-expanded={open === warning.topic}
                onClick={() => setOpen(open === warning.topic ? null : warning.topic)}
              >
                {summary}
              </button>
            </span>

            {open === warning.topic && (
              <div className="movie-warning-panel">
                <fieldset>
                  <legend>{name}</legend>
                  {([['Follow votes', null], ['With', 'with'], ['Without', 'without']] as Array<[string, Override]>).map(([label, value]) => (
                    <label key={label}>
                      <input
                        type="radio"
                        name={`override-${warning.topic}`}
                        checked={warning.override === value}
                        onChange={() => apply(apiService.setWarningOverride(movieId, warning.topic, value))}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>

                <div className="movie-warning-link">
                  {data.dddUrl
                    ? <a href={data.dddUrl} target="_blank" rel="noreferrer">DoesTheDogDie #{data.dddId}</a>
                    : <span>Not found on DoesTheDogDie</span>}
                  {data.matchedBy && <span className="movie-warning-meta"> · matched by {data.matchedBy}</span>}
                </div>

                <label className="movie-warning-input">
                  DoesTheDogDie ID
                  <input
                    type="text"
                    inputMode="numeric"
                    value={linkInput}
                    placeholder={data.dddId ? String(data.dddId) : ''}
                    onChange={e => setLinkInput(e.target.value)}
                  />
                </label>
                <button type="button" onClick={saveLink}>Save link</button>
                <button type="button" onClick={() => apply(apiService.refreshMovieWarnings(movieId))}>Refresh</button>

                <div className="movie-warning-meta">
                  {data.checkedAt ? `Checked ${new Date(data.checkedAt).toLocaleDateString()}` : 'Never checked'}
                </div>
                {error && <div className="movie-warning-error">{error}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MovieWarnings;
