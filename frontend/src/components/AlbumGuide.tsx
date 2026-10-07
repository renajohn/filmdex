import React, { useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import musicService, { type AlbumGuide as Guide, type AlbumGuideSource } from '../services/musicService';
import './AlbumGuide.css';

const SOURCE_LABELS: Record<AlbumGuideSource, string> = {
  claude: 'Written by Claude',
  local_llm: 'Written by the local LLM',
  manual: 'Written by you',
};

/** "**bold**" and "*italic*" inside a line, as React nodes: the text is never handed to innerHTML. */
const inline = (text: string): React.ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });

/** The little Markdown a guide uses: headings, paragraphs, bullet lists, bold and italic. */
export const GuideText: React.FC<{ text: string }> = ({ text }) => {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>);
    if (bullets.length) blocks.push(<ul key={blocks.length}>{bullets.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    paragraph = [];
    bullets = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (!line || line === '---') {
      flush();
    } else if (heading) {
      flush();
      blocks.push(<h5 key={blocks.length}>{inline(heading[1])}</h5>);
    } else if (bullet) {
      if (paragraph.length) flush();
      bullets.push(bullet[1]);
    } else {
      if (bullets.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <div className="album-guide-text">{blocks}</div>;
};

const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

interface AlbumGuideProps {
  albumId: number;
  /** Tells the dialog whether there is a guide, so Wikipedia can step aside. */
  onLoaded?: (hasGuide: boolean) => void;
}

/**
 * What to know before listening: context, form and the moments to listen for.
 * Claude wrote the first ones, the local LLM writes the next, and any of them
 * can be rewritten by hand.
 */
const AlbumGuide: React.FC<AlbumGuideProps> = ({ albumId, onLoaded }) => {
  const [guide, setGuide] = useState<Guide | null | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<boolean>(false);
  const [busy, setBusy] = useState<'saving' | 'writing' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setGuide(undefined);
    setEditing(null);
    setConfirmReplace(false);
    setError(null);
    musicService.getAlbumGuide(albumId)
      .then(result => { if (current) setGuide(result); })
      .catch(() => { if (current) setGuide(null); });
    return () => { current = false; };
  }, [albumId]);

  useEffect(() => {
    if (guide !== undefined) onLoaded?.(guide !== null);
  }, [guide, onLoaded]);

  const run = async (kind: 'saving' | 'writing', action: () => Promise<Guide>) => {
    setBusy(kind);
    setError(null);
    try {
      setGuide(await action());
      setEditing(null);
      setConfirmReplace(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const write = () => run('writing', () => musicService.generateAlbumGuide(albumId));
  const save = () => editing?.trim() && run('saving', () => musicService.saveAlbumGuide(albumId, editing.trim()));

  if (guide === undefined) return null;

  const writing = busy === 'writing' && (
    <p className="album-guide-muted small mb-0">
      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
      The local LLM is writing the guide, checking each fact against Wikipedia… about a minute.
    </p>
  );

  if (editing !== null) {
    return (
      <div className="info-section album-guide">
        <h4>Before you listen</h4>
        <Form.Control
          as="textarea"
          rows={16}
          value={editing}
          onChange={e => setEditing(e.target.value)}
          aria-label="Listening guide"
          className="album-guide-editor"
        />
        <p className="album-guide-muted small">### for a heading, **bold**, *italic*, - for a bullet.</p>
        <div className="album-guide-row">
          <Button size="sm" variant="outline-light" onClick={save} disabled={busy !== null || !editing.trim()}>Save</Button>
          <button type="button" className="album-guide-action" onClick={() => setEditing(null)}>Cancel</button>
        </div>
        {error && <p className="album-guide-error">{error}</p>}
      </div>
    );
  }

  if (guide === null) {
    return (
      <div className="info-section album-guide album-guide-empty">
        {writing || (
          <p className="album-guide-muted small mb-0">
            No listening guide yet.{' '}
            <button type="button" className="album-guide-action" onClick={write}>Write one with the local LLM</button>
            {' · '}
            <button type="button" className="album-guide-action" onClick={() => setEditing('')}>Write it yourself</button>
          </p>
        )}
        {error && <p className="album-guide-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="info-section album-guide">
      <h4>Before you listen</h4>
      {writing || <GuideText text={guide.text} />}

      <div className="album-guide-footer">
        <span>
          {SOURCE_LABELS[guide.source]}
          {guide.source === 'local_llm' && guide.model ? ` (${guide.model})` : ''}
          {' · '}{dayLabel(guide.updatedAt)}
        </span>
        <span className="album-guide-actions">
          {confirmReplace ? (
            <>
              <span>Replace it with the local LLM’s?</span>
              <button type="button" className="album-guide-action" onClick={write} disabled={busy !== null}>Replace</button>
              <button type="button" className="album-guide-action" onClick={() => setConfirmReplace(false)}>Keep</button>
            </>
          ) : (
            <>
              <button type="button" className="album-guide-action" onClick={() => setEditing(guide.text)} disabled={busy !== null}>Edit</button>
              <button type="button" className="album-guide-action" onClick={() => setConfirmReplace(true)} disabled={busy !== null}>Rewrite with the local LLM</button>
            </>
          )}
        </span>
      </div>
      {error && <p className="album-guide-error">{error}</p>}
    </div>
  );
};

export default AlbumGuide;
