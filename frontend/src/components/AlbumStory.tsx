import React, { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { BsArrowClockwise, BsBoxArrowUpRight, BsChevronRight } from 'react-icons/bs';
import musicService, { AlbumStory as Story, AlbumStoryLink, AlbumStorySection } from '../services/musicService';
import './AlbumStory.css';

const MISSING: Record<NonNullable<Story['reason']>, string> = {
  no_musicbrainz: 'No story: this album is not linked to MusicBrainz.',
  no_article: 'No Wikipedia article about this album or its works yet.',
};

const LANGUAGES: Record<string, string> = { fr: 'French', en: 'English' };

/** Paragraphs of a plain-text Wikipedia extract. */
const Paragraphs: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/\n+/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
  </>
);

interface ArticleProps {
  intro: string | null;
  sections: AlbumStorySection[];
  lang: string | null;
  title: string | null;
  url: string | null;
  /** The same article in other languages: the fullest is told, all are linked. */
  links?: AlbumStoryLink[];
  /** Section headings are one level deeper under a work's own heading. */
  nested?: boolean;
}

/** The introduction of a Wikipedia article, the rest on demand, and where it comes from. */
const Article: React.FC<ArticleProps> = ({ intro, sections, lang, title, url, links = [], nested = false }) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const others = links.filter(link => link.url !== url);

  return (
    <>
      {intro && <Paragraphs text={intro} />}

      {sections.length > 0 && (
        <button
          type="button"
          className="album-story-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(open => !open)}
        >
          <BsChevronRight aria-hidden="true" className={expanded ? 'album-story-chevron-open' : undefined} />
          {expanded ? 'Hide full story' : 'Read full story…'}
        </button>
      )}

      {expanded && sections.map((section, i) => (
        <div key={i} className="album-story-section">
          {section.level <= 2 && !nested ? <h5>{section.heading}</h5> : <h6>{section.heading}</h6>}
          <Paragraphs text={section.text} />
        </div>
      ))}

      <p className="album-story-source small">
        <a href={url ?? undefined} target="_blank" rel="noopener noreferrer">
          Wikipedia{lang ? ` (${lang})` : ''}: {title} <BsBoxArrowUpRight />
        </a>
        {others.map(link => (
          <React.Fragment key={link.url}>
            {' · '}
            <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.title}>
              also in {LANGUAGES[link.lang] ?? link.lang} <BsBoxArrowUpRight />
            </a>
          </React.Fragment>
        ))}
        {' · '}CC BY-SA
      </p>
    </>
  );
};

interface AlbumStoryProps {
  albumId: number | string;
  /** Behind a toggle, when a listening guide already tells what matters first. */
  folded?: boolean;
}

const AlbumStory: React.FC<AlbumStoryProps> = ({ albumId, folded = false }) => {
  const [story, setStory] = useState<Story | null>(null);
  const [unfolded, setUnfolded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh: boolean) => {
    setLoading(true);
    setError(null);
    return musicService.getAlbumStory(albumId, refresh)
      .then(setStory)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let current = true;
    setStory(null);
    setLoading(true);
    setError(null);
    setUnfolded(false);
    musicService.getAlbumStory(albumId)
      .then(result => { if (current) setStory(result); })
      .catch((e: Error) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [albumId]);

  if (folded && !unfolded) {
    return (
      <div className="info-section album-story">
        <button type="button" className="album-story-toggle" aria-expanded={false} onClick={() => setUnfolded(true)}>
          <BsChevronRight aria-hidden="true" />
          Read on Wikipedia…
        </button>
      </div>
    );
  }

  const refreshButton = (
    <Button variant="link" size="sm" className="album-story-refresh" disabled={loading}
      onClick={() => load(true)} title="Look up Wikipedia again">
      <BsArrowClockwise className={loading ? 'spinning' : ''} />
    </Button>
  );

  if (loading && !story) {
    return (
      <div className="info-section album-story">
        <h4>Story</h4>
        <p className="album-story-muted small mb-0">
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Looking up Wikipedia…
        </p>
      </div>
    );
  }

  if (!story?.found) {
    return (
      <div className="info-section album-story">
        <p className="album-story-muted small mb-0">
          {error ?? (story?.reason ? MISSING[story.reason] : '')}
          {refreshButton}
        </p>
      </div>
    );
  }

  const works = story.works ?? [];

  return (
    <div className="info-section album-story">
      <h4>
        {story.url ? 'Story' : works.length > 1 ? 'Story of the works' : 'Story of the work'}
        {refreshButton}
      </h4>
      {error && <p className="text-warning small">{error}</p>}

      {story.url ? (
        <Article key={story.url} intro={story.intro} sections={story.sections} lang={story.lang} title={story.title} url={story.url} links={story.links} />
      ) : (
        works.map(work => (
          <div key={work.url} className="album-story-work">
            <h5>
              {work.title}
              <span className="album-story-tracks">{work.tracks} {work.tracks === 1 ? 'track' : 'tracks'}</span>
            </h5>
            <Article intro={work.intro} sections={work.sections} lang={work.lang} title={work.title} url={work.url} links={work.links} nested />
          </div>
        ))
      )}
    </div>
  );
};

export default AlbumStory;
