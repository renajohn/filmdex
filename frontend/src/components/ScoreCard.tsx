import React, { useEffect, useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import { BsBoxArrowUpRight, BsCamera, BsFileEarmarkPdf, BsFileMusic, BsPaperclip, BsPlayFill, BsSearch, BsThreeDots, BsYoutube } from 'react-icons/bs';
import scorePiecesService, { imslpPieceUrl, PieceRecording, PieceSuggestion, ScorePiece, youtubeUrl } from '../services/scorePiecesService';
import { imslpUrl, Score, scorePdfUrl } from '../services/bookSectionsService';
import bookService from '../services/bookService';
import { player, usePlayer } from '../services/player';
import { loadPlayable } from '../utils/playAlbum';
import Button, { IconButton } from './shared/Button';
import CoverTag from './shared/CoverTag';
import Dialog from './shared/Dialog';
import Menu, { MenuChevron } from './shared/Menu';
import Notice from './shared/Notice';
import Spinner, { Loading } from './shared/Spinner';
import { TextField } from './shared/TextField';
import toast from './shared/Toast';
import './ScoreCard.css';

const fmt = (seconds: number | null) => (seconds == null ? '' : `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`);
const surnameOf = (names: string[]) => (names[0] || '').split(' ').slice(-1)[0] || 'Play';
const WHY: Record<PieceSuggestion['why'], string> = { number: 'by its number', 'your music': 'in your music', wikidata: 'from Wikidata', imslp: 'from IMSLP', title: 'by its title', photo: 'read on the photo', search: '' };

/**
 * Plays recordings of an album, in their order, from the one asked: the
 * album's rip in Navidrome holds the files. False when none of them is ripped.
 */
const playRecordings = async (recordings: PieceRecording[], start = 0): Promise<boolean> => {
  if (!recordings.length) return false;
  const { album, tracks } = await loadPlayable(recordings[0].albumId);
  const wanted = recordings.map(r => tracks.find(track => track.disc === r.disc && track.no === r.no)).filter(Boolean) as typeof tracks;
  if (!wanted.length) return false;
  const first = tracks.find(track => track.disc === recordings[start]?.disc && track.no === recordings[start]?.no);
  player.playAlbum(album, wanted, Math.max(0, first ? wanted.indexOf(first) : 0));
  return true;
};

const play = (recordings: PieceRecording[], start = 0) => {
  playRecordings(recordings, start)
    .then(played => { if (!played) toast('Not in Navidrome: this album has no rip to play', { tone: 'warning' }); })
    .catch(error => toast((error as Error).message, { tone: 'danger' }));
};

/** Whether this recording is the track the player is on. */
const usePlaying = () => usePlayer(state => (state.album?.id && state.tracks[state.index]
  ? `${state.album.id}:${state.tracks[state.index].disc}:${state.tracks[state.index].no}` : null));
const keyOf = (r: PieceRecording) => `${r.albumId}:${r.disc}:${r.no}`;

interface ScoreCardProps {
  score: Score;
  title: string;
  onClose: () => void;
  onDetails: () => void;
  onAttach: () => void;
  /** Its pieces changed: the list's counts. */
  onChanged: () => void;
}

/**
 * A score's card: its pieces, each with the recordings of the music that play
 * it, one chosen to play first and the others behind +N; YouTube when the
 * music has none. A score without pieces offers what it likely holds (its
 * numbers, the music's works, its title), a search, and a photo of its contents.
 */
const ScoreCard: React.FC<ScoreCardProps> = ({ score, title, onClose, onDetails, onAttach, onChanged }) => {
  const [pieces, setPieces] = useState<ScorePiece[] | null>(null);
  const [finding, setFinding] = useState(false);
  // Its page on IMSLP, where its free editions are: the one its pieces or its title find.
  const [imslpPage, setImslpPage] = useState<string | null>(null);
  const playing = usePlaying();
  useEffect(() => { setImslpPage(null); }, [score.id]);
  useEffect(() => {
    let current = true;
    // Asked again once its pieces are known or change: a set's page is the score's.
    scorePiecesService.imslpPage(score.id).then(found => { if (current && found?.page) setImslpPage(found.page); }).catch(() => undefined);
    return () => { current = false; };
  }, [score.id, pieces?.length]);
  const imslp = imslpPage ? imslpPieceUrl(imslpPage) : imslpUrl(score);

  const load = () => scorePiecesService.pieces(score.id)
    .then(list => { setPieces(list); if (!list.length) setFinding(true); })
    .catch(error => { setPieces([]); toast((error as Error).message, { tone: 'danger' }); });
  useEffect(() => { setPieces(null); setFinding(false); load(); }, [score.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (list: ScorePiece[]) => { setPieces(list); setFinding(false); onChanged(); };
  const heard = (pieces || []).reduce((n, p) => n + (p.single ? (p.albums.length ? 1 : 0) : p.parts.filter(part => part.recordings.length).length), 0);
  const total = (pieces || []).reduce((n, p) => n + (p.single ? 1 : p.parts.length), 0);

  const choose = async (piece: ScorePiece, albumId: number) => {
    setPieces(prev => (prev || []).map(p => (p.id === piece.id ? { ...p, preferredAlbumId: albumId } : p)));
    try { await scorePiecesService.choose(score.id, piece.id, albumId); } catch (error) { toast((error as Error).message, { tone: 'danger' }); }
  };
  const remove = async (piece: ScorePiece) => {
    try {
      await scorePiecesService.removePiece(score.id, piece.id);
      const left = (pieces || []).filter(p => p.id !== piece.id);
      setPieces(left);
      if (!left.length) setFinding(true);
      onChanged();
    } catch (error) { toast((error as Error).message, { tone: 'danger' }); }
  };

  return (
    <Dialog show onClose={onClose} variant="panel" size="lg" icon={<BsFileMusic />} title={title} className="score-card">
      <Dialog.Body>
        <div className="score-card__head">
          {score.cover ? <img src={bookService.getImageUrl(score.cover) || ''} alt="" /> : <span className="score-card__blank" />}
          <div>
            <div className="score-card__composer">{score.composer || 'Composer unknown'}</div>
            <div className="score-card__facts">{[score.publisher, (score.authors || []).filter(a => a !== score.composer).join(', ')].filter(Boolean).join(' · ')}</div>
            <div className="score-card__acts">
              {score.ebookFile ? (
                <>
                  <Button size="sm" icon={<BsFileEarmarkPdf />} onClick={() => window.open(scorePdfUrl(score.id), '_blank', 'noopener')}>PDF</Button>
                  <Button size="sm" variant="quiet" icon={<BsBoxArrowUpRight />} onClick={() => window.open(imslp, '_blank', 'noopener')}>On IMSLP</Button>
                </>
              ) : (
                <>
                  <Button size="sm" icon={<BsBoxArrowUpRight />} onClick={() => window.open(imslp, '_blank', 'noopener')}
                    title={imslpPage ? `Its page on IMSLP: ${imslpPage}` : 'A search on IMSLP'}>Find the PDF on IMSLP</Button>
                  <Button size="sm" variant="quiet" icon={<BsPaperclip />} onClick={onAttach}>Attach PDF</Button>
                </>
              )}
              {total > 0 && heard > 0 && <CoverTag variant="gold">♪ {heard} of {total} in your music</CoverTag>}
            </div>
          </div>
        </div>

        <section className="score-card__section">
          <h4>
            {pieces?.length ? 'Its pieces' : 'Its pieces, to find'}
            {!!pieces?.length && !finding && <Button size="sm" variant="quiet" className="score-card__add" onClick={() => setFinding(true)}>+ Add a piece</Button>}
          </h4>
          {!pieces ? <Loading>Reading its pieces…</Loading> : (
            <>
              {pieces.map(piece => (
                <PieceBlock key={piece.id} piece={piece} composer={score.composer} playing={playing}
                  onChoose={albumId => choose(piece, albumId)} onRemove={() => remove(piece)} />
              ))}
              {finding && <FindPieces score={score} first={!pieces.length} onAdded={changed} onCancel={pieces.length ? () => setFinding(false) : undefined} />}
            </>
          )}
        </section>
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="quiet" onClick={onDetails}>Details</Button>
      </Dialog.Footer>
    </Dialog>
  );
};

interface PieceBlockProps {
  piece: ScorePiece;
  composer: string | null;
  playing: string | null;
  onChoose: (albumId: number) => void;
  onRemove: () => void;
}

/** A piece: its parts, each with the chosen recording, the others behind +N. */
const PieceBlock: React.FC<PieceBlockProps> = ({ piece, composer, playing, onChoose, onRemove }) => {
  const chosen = piece.albums.find(album => album.albumId === piece.preferredAlbumId) || piece.albums[0];
  const rows = piece.single
    ? [{ workId: piece.workId || String(piece.id), title: piece.title, name: '', sub: null as string | null, imslp: piece.imslp, recordings: piece.albums.length ? recordingsOfSingle(piece) : [] }]
    : piece.parts;
  const heardHere = piece.single ? (piece.albums.length ? 1 : 0) : piece.parts.filter(part => part.recordings.length).length;
  // Its parts in the chosen recording; an album playing it whole in one track plays that track.
  const partsOfChosen = chosen ? rows.flatMap(row => row.recordings.filter(r => r.albumId === chosen.albumId).slice(0, 1)) : [];
  const ofChosen = partsOfChosen.length || !chosen ? partsOfChosen : piece.whole.filter(r => r.albumId === chosen.albumId).slice(0, 1);

  return (
    <div className="score-piece">
      <div className="score-piece__head">
        <div className="score-piece__title">
          <b>{piece.title}</b>
          <small>
            {piece.single ? 'One piece' : `${piece.parts.length} pieces`}
            {heardHere > 0 && ` · ${heardHere} in your music${piece.albums.length > 1 ? `, ${piece.albums.length} recordings` : ''}`}
            {!piece.workId && ' · not found in MusicBrainz'}
          </small>
        </div>
        {chosen && !piece.single && (
          <span className="ui-button-group">
            <Button size="sm" icon={<BsPlayFill />} onClick={() => play(ofChosen)} title={`${chosen.title} (${chosen.year ?? '—'})`}>
              All · {surnameOf(chosen.performers)}
            </Button>
            {piece.albums.length > 1 && (
              <Menu align="end" label="Which recording" trigger={(props, open) => (
                <Button {...props} size="sm" className="ui-button--split" aria-label="Which recording" title="Which recording"><MenuChevron open={open} /></Button>
              )}>
                <Menu.Section title="Played first" />
                {piece.albums.map(album => (
                  <Menu.Choice key={album.albumId} selected={album.albumId === chosen.albumId} onSelect={() => onChoose(album.albumId)}
                    hint={`${album.year ?? ''}${piece.single ? '' : ` · ${album.covered} of ${piece.parts.length}`}`}>
                    {album.performers.join(', ') || album.title}
                  </Menu.Choice>
                ))}
              </Menu>
            )}
          </span>
        )}
        <Menu align="end" trigger={props => <IconButton {...props} label="More" size="sm"><BsThreeDots /></IconButton>}>
          <Menu.Item icon={<BsBoxArrowUpRight />} hint={piece.imslp ? 'its page' : 'a search'}
            onSelect={() => window.open(imslpPieceUrl(piece.imslp, composer, piece.title), '_blank', 'noopener')}>On IMSLP</Menu.Item>
          <Menu.Item icon={<BsYoutube />} onSelect={() => window.open(youtubeUrl(composer, piece.title), '_blank', 'noopener')}>On YouTube</Menu.Item>
          <Menu.Separator />
          <Menu.Item danger onSelect={onRemove}>Take it out of the score</Menu.Item>
        </Menu>
      </div>

      {rows.map((row, index) => (
        <div key={row.workId + index} className={`score-piece__row${row.recordings.length ? '' : ' score-piece__row--none'}`}>
          <span className="score-piece__n">{piece.single ? '' : index + 1}</span>
          <span className="score-piece__name">{row.name}{row.sub && <small>{row.sub}</small>}</span>
          <span className="score-piece__recs">
            <Recordings recordings={row.recordings} piece={piece} chosenAlbumId={chosen?.albumId ?? null} playing={playing}
              youtube={youtubeUrl(composer, piece.single ? piece.title : `${piece.title} ${row.name}`)} single={piece.single} />
            {row.imslp && (
              <IconButton size="sm" label="Its score on IMSLP" onClick={() => window.open(imslpPieceUrl(row.imslp), '_blank', 'noopener')}>
                <BsBoxArrowUpRight />
              </IconButton>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

/** A piece of one movement: the first track of each album playing it. */
const recordingsOfSingle = (piece: ScorePiece): PieceRecording[] =>
  piece.albums.flatMap(album => piece.whole.filter(r => r.albumId === album.albumId).slice(0, 1));

const RecordingButton: React.FC<{ recording: PieceRecording; label: string; playing: string | null; recordings?: PieceRecording[]; start?: number }> = ({ recording, label, playing, recordings, start = 0 }) => (
  <Button size="sm" className="score-piece__play" active={playing === keyOf(recording)} icon={<BsPlayFill />}
    onClick={() => play(recordings || [recording], start)} title={recording.title}>
    {label} <span className="score-piece__time">{fmt(recording.durationSec)}</span>
  </Button>
);

const Recordings: React.FC<{ recordings: PieceRecording[]; piece: ScorePiece; chosenAlbumId: number | null; playing: string | null; youtube: string; single: boolean }> = ({
  recordings, piece, chosenAlbumId, playing, youtube, single,
}) => {
  if (!recordings.length) {
    return (
      <>
        <span className="score-piece__none">{single ? 'Not in your music' : '—'}</span>
        <Button size="sm" variant="quiet" icon={<BsYoutube />} onClick={() => window.open(youtube, '_blank', 'noopener')} title="Search it on YouTube">YouTube</Button>
      </>
    );
  }
  const main = recordings.find(r => r.albumId === chosenAlbumId) || recordings[0];
  const rest = recordings.filter(r => r !== main);
  const by = (r: PieceRecording) => surnameOf(piece.albums.find(a => a.albumId === r.albumId)?.performers || []);
  return (
    <>
      <RecordingButton recording={main} label={by(main)} playing={playing} />
      {rest.length > 0 && (
        <Menu align="end" label="Its other recordings" trigger={props => (
          <Button {...props} size="sm" variant="quiet" title="Its other recordings">+{rest.length}</Button>
        )}>
          {rest.map(r => {
            const album = piece.albums.find(a => a.albumId === r.albumId);
            return (
              <Menu.Item key={keyOf(r)} icon={<BsPlayFill />} hint={`${album?.year ?? ''} · ${fmt(r.durationSec)}`} onSelect={() => play([r])}>
                {album?.performers.join(', ') || album?.title}
              </Menu.Item>
            );
          })}
          <Menu.Separator />
          <Menu.Item icon={<BsYoutube />} onSelect={() => window.open(youtube, '_blank', 'noopener')}>On YouTube</Menu.Item>
        </Menu>
      )}
    </>
  );
};

/**
 * What a score holds, to confirm: suggested from its numbers, the music's own
 * works and its title; a search; a photo of its table of contents.
 */
const FindPieces: React.FC<{ score: Score; first: boolean; onAdded: (pieces: ScorePiece[]) => void; onCancel?: () => void }> = ({ score, first, onAdded, onCancel }) => {
  const [suggestions, setSuggestions] = useState<PieceSuggestion[] | null>(first ? null : []);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PieceSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!first) return;
    setSuggestions(null);
    setFailed(null);
    scorePiecesService.suggestions(score.id)
      .then(list => { setSuggestions(list); setPicked(new Set(list.filter(s => s.likely !== false).map(s => s.workId))); })
      .catch(error => { setSuggestions([]); setFailed((error as Error).message); });
  }, [score.id, first, attempt]);

  useEffect(() => {
    if (query.trim().length < 2) { setHits(null); return undefined; }
    setSearching(true);
    const timer = setTimeout(() => {
      scorePiecesService.search(query).then(setHits).catch(() => setHits([])).finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const keep = async (workIds: string[], titles: string[] = []) => {
    setSaving(true);
    try {
      let list: ScorePiece[] | null = null;
      if (workIds.length) list = await scorePiecesService.addPieces(score.id, { workIds });
      for (const title of titles) list = await scorePiecesService.addPieces(score.id, { title });
      if (list) onAdded(list);
    } catch (error) { toast((error as Error).message, { tone: 'danger' }); } finally { setSaving(false); }
  };

  const readPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const { suggestions: read, truncated } = await scorePiecesService.contentsPhoto(score.id, image, file.type || 'image/jpeg');
      setSuggestions(read);
      setPicked(new Set(read.map((s, i) => s.workId || `title:${i}`)));
      if (truncated) toast('The contents were long: the last pieces may be missing', { tone: 'warning' });
      if (!read.length) toast('No piece could be read on the photo', { tone: 'warning' });
    } catch (error) { toast((error as Error).message, { tone: 'danger' }); } finally {
      setReading(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const keyOfSuggestion = (s: PieceSuggestion, i: number) => s.workId || `title:${i}`;
  const chosen = (suggestions || []).filter((s, i) => picked.has(keyOfSuggestion(s, i)));

  return (
    <div className="score-find">
      {suggestions === null ? <Loading>Looking for its pieces in MusicBrainz…</Loading> : suggestions.length > 0 ? (
        <>
          <p className="score-find__hint">What it likely holds: check what the score has.</p>
          {suggestions.map((s, i) => {
            const key = keyOfSuggestion(s, i);
            return (
              <label key={key} className={`score-find__sugg${picked.has(key) ? ' score-find__sugg--on' : ''}`}>
                <Form.Check type="checkbox" checked={picked.has(key)} aria-label={s.title}
                  onChange={() => setPicked(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} />
                <span className="score-find__text">
                  {s.title}
                  <small>
                    {s.read && s.read !== s.title ? `read “${s.read}” · ` : ''}
                    {!s.workId ? 'not found in MusicBrainz: kept by its title' : [
                      s.parts ? `${s.parts} parts` : 'one piece',
                      s.inYourMusic ? `${s.inYourMusic} in your music` : 'none in your music',
                    ].join(' · ')}
                  </small>
                </span>
                {WHY[s.why] && <span className="score-find__why">{WHY[s.why]}</span>}
              </label>
            );
          })}
          {saving && chosen.some(s => /^(?:wd|imslp):/.test(s.workId)) && (
            <Loading>Finding each of its pieces in MusicBrainz: about a second a piece…</Loading>
          )}
          <div className="score-find__keep">
            {onCancel && <Button variant="quiet" size="sm" onClick={onCancel}>Cancel</Button>}
            <Button variant="primary" size="sm" loading={saving} disabled={!chosen.length}
              onClick={() => keep(chosen.filter(s => s.workId).map(s => s.workId), chosen.filter(s => !s.workId).map(s => s.title))}>
              {chosen.length > 1 ? `Keep these ${chosen.length}` : 'Keep it'}
            </Button>
          </div>
        </>
      ) : failed ? (
        <Notice className="score-find__notice" tone="warning" action={<Button size="sm" onClick={() => setAttempt(n => n + 1)}>Try again</Button>}>
          {failed}
        </Notice>
      ) : first && (
        <Notice className="score-find__notice">
          Its title says nothing of its pieces: an anthology, a method. Photograph its table of contents, or add its pieces one by one.
        </Notice>
      )}

      <div className="score-find__more">
        <h5>{suggestions?.length ? 'Something else in it' : 'Add a piece'}</h5>
        <div className="score-find__tools">
          <TextField size="sm" icon={<BsSearch />} value={query} onChange={e => setQuery(e.target.value)} autoFocus={!first}
            placeholder="A piece: a title, a composer, a number (op. 28, BWV 816)" aria-label="Find a piece" suffix={searching ? <Spinner size="sm" /> : undefined} />
          <Button size="sm" icon={<BsCamera />} loading={reading} onClick={() => photoRef.current?.click()}>Photo of the contents</Button>
          {!first && onCancel && !suggestions?.length && <Button variant="quiet" size="sm" onClick={onCancel}>Cancel</Button>}
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden data-testid="contents-photo" onChange={e => readPhoto(e.target.files?.[0])} />
        </div>
        {hits && (
          <div className="score-find__hits menu-surface" role="listbox" aria-label="Pieces found">
            {!hits.length ? <div className="menu-item" aria-disabled="true">Nothing found</div> : hits.map(hit => (
              <button key={hit.workId} type="button" role="option" aria-selected="false" className="menu-item" disabled={saving}
                onClick={() => { setQuery(''); setHits(null); keep([hit.workId]); }}>
                <span className="menu-item__label">{hit.title}</span>
                <span className="menu-item__hint">{[hit.composers.join(', '), hit.inYourMusic ? 'in your music' : ''].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {query.trim() && (
              <button type="button" className="menu-item" onClick={() => { const t = query.trim(); setQuery(''); setHits(null); keep([], [t]); }}>
                <span className="menu-item__label">Keep “{query.trim()}” by its title alone</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoreCard;
