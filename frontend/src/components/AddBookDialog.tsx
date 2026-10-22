import React, { useEffect, useRef, useState } from 'react';
import { BsCamera } from 'react-icons/bs';
import BookFinder, { BookFinderHead } from './BookFinder';
import BookForm from './BookForm';
import Dialog from './shared/Dialog';
import BookPhotoSteps from './BookPhotoSteps';
import bookService from '../services/bookService';
import { useNarrow } from '../utils/useNarrow';
import { base64ToFile } from '../utils/downscaleImage';
import { readStored } from '../utils/safeStorage';
import './AddBookDialog.css';

type Photo = { base64: string; mimeType: string };
type View = 'finder' | 'photos' | 'form';

/** How its page from photos starts: after a photo that found nothing, or words; the ISBN read, files to square, the words. */
export interface StepsStart { reason: 'photo' | 'search'; isbn?: string | null; files?: { front?: File; back?: File }; title?: string }

interface AddBookDialogProps {
  show: boolean;
  onHide: () => void;
  /** A book typed in the form, saved by the page. */
  onAddBook: (bookData: any) => Promise<any>;
  onAddStart?: () => void;
  onBookAdded?: (book: any) => void;
  onAddError?: (err: any) => void;
  /** A volume of a series: the finder opens on that series' volumes, to add those one has. */
  templateBook?: { series?: string | null; authors?: string | string[] | null } | null;
  defaultTitleStatus?: string;
  onShowAlert?: (message: string, variant: string) => void;
  /** The kind the finder opens on: Score from the scores' section. */
  defaultBookKind?: 'book' | 'graphic-novel' | 'score';
  /** From the reading journal: the finder asks when the book was read. */
  reading?: boolean;
}

/**
 * Adding a book: the finder first (as one types, a photo of its back, a series'
 * volumes); its photos when it is not found, read into its form; the form,
 * filled from them or by hand. Cancelling the form goes back to the finder.
 */
const AddBookDialog = ({ show, onHide, onAddBook, onAddStart, onBookAdded, onAddError, templateBook, defaultTitleStatus, onShowAlert, defaultBookKind, reading }: AddBookDialogProps) => {
  const [view, setView] = useState<View>('finder');
  const [finderHead, setFinderHead] = useState<BookFinderHead>({ title: 'Add a book' });
  const [taken, setTaken] = useState<{ front?: Photo; back?: Photo }>({});
  // Why its page is made from photos, and what the finder handed over to square.
  const [steps, setSteps] = useState<StepsStart>({ reason: 'search' });
  const narrow = useNarrow();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  // The photographs read for the form: its cover and its back once it is saved.
  const photosRef = useRef<{ front?: Photo; back?: Photo }>({});

  // Each opening starts at the finder.
  useEffect(() => {
    if (!show) return;
    setView('finder');
    setTaken({});
    setDraft({});
    photosRef.current = {};
  }, [show]);

  const close = () => { photosRef.current = {}; onHide(); };
  const toForm = (book: Record<string, unknown>) => { setDraft(book); setView('form'); };

  const authors = templateBook?.authors;
  const initialSeries = templateBook?.series
    ? { name: templateBook.series, author: (Array.isArray(authors) ? authors[0] : authors) || null }
    : undefined;

  if (view === 'form') {
    // The form has no show of its own: closed, it is gone.
    if (!show) return null;
    return (
      <BookForm
        book={draft as never}
        photos={photosRef.current.front || photosRef.current.back ? photosRef.current : null}
        onPhotosChange={chosen => { photosRef.current = chosen; }}
        defaultTitleStatus={defaultTitleStatus}
        onShowAlert={onShowAlert}
        onSave={async (bookData: any) => {
          onAddStart?.();
          try {
            const created = await onAddBook(defaultTitleStatus ? { ...bookData, titleStatus: defaultTitleStatus } : bookData);
            // Its photographs, read for the form: its cover and its back.
            const kept = photosRef.current;
            photosRef.current = {};
            if (created?.id && (kept.front || kept.back)) {
              try {
                if (kept.front) {
                  const { cover } = await bookService.uploadCover(created.id, base64ToFile(kept.front.base64, kept.front.mimeType, 'front.jpg')) as { cover: string };
                  created.cover = cover;
                }
                if (kept.back) {
                  const { cover } = await bookService.uploadBackCover(created.id, base64ToFile(kept.back.base64, kept.back.mimeType, 'back.jpg')) as { cover: string };
                  created.backCover = cover;
                }
              } catch (e) {
                onShowAlert?.(`The book is added, its photos not: ${(e as Error).message}`, 'warning');
              }
            }
            onHide();
            onBookAdded?.(created);
            return created;
          } catch (err) {
            onAddError?.(err);
            throw err;
          }
        }}
        onCancel={() => { photosRef.current = {}; setView('finder'); }}
      />
    );
  }

  if (view === 'photos') {
    return (
      <Dialog show={show} onClose={close} size="lg" zIndex={10100} className="add-book-dialog" icon={<BsCamera />} title="Its page"
        onBack={() => setView('finder')}>
        <BookPhotoSteps
          photos={taken}
          files={steps.files}
          reason={steps.reason}
          isbn={steps.isbn}
          wide={!narrow}
          onDraft={(read, photos) => {
            photosRef.current = photos;
            toForm({
              title: read.title || steps.title || '', subtitle: read.subtitle || undefined, authors: read.authors, artists: read.artists,
              series: read.series || undefined, seriesNumber: read.seriesNumber ?? undefined, publisher: read.publisher || undefined,
              isbn13: read.isbn13 || steps.isbn || undefined, description: read.description || undefined, language: read.language || undefined,
              bookType: read.bookType || undefined, publishedYear: read.publishedYear ?? undefined, pageCount: read.pageCount ?? undefined,
              // Whose it is: the owner last given in the finder, as there.
              owner: readStored('dv.bookOwner') || undefined,
              ...(read.bnf ? { urls: { bnf: read.bnf } } : {}),
            });
          }}
          onManual={photos => {
            photosRef.current = photos;
            toForm({ ...(steps.title ? { title: steps.title } : {}), ...(steps.isbn ? { isbn13: steps.isbn } : {}), owner: readStored('dv.bookOwner') || undefined });
          }}
        />
      </Dialog>
    );
  }

  return (
    <Dialog show={show} onClose={close} size="lg" zIndex={10100} className="add-book-dialog" title={finderHead.title} onBack={finderHead.onBack}>
      <BookFinder
        mode={defaultTitleStatus === 'wish' ? 'wish' : 'owned'}
        initialKind={defaultBookKind}
        initialSeries={initialSeries}
        reading={reading}
        onHead={setFinderHead}
        onChanged={book => onBookAdded?.(book)}
        onClose={close}
        onPhotos={(photos, start) => { setTaken(photos); setSteps(start || { reason: 'photo' }); setView('photos'); }}
        onManual={title => toForm(title ? { title } : {})}
      />
    </Dialog>
  );
};

export default AddBookDialog;
