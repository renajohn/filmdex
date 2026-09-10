import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AddMusicDialog from './AddMusicDialog';

// jsdom cannot decode images or rasterise a canvas, so the downscaling step is
// covered by its own test and stubbed here.
vi.mock('../utils/downscaleImage', () => ({
  downscaleImage: vi.fn().mockResolvedValue({ base64: 'c2xlZXZl', mimeType: 'image/jpeg' }),
  default: vi.fn()
}));

vi.mock('../utils/decodeBarcode', () => ({
  decodeBarcode: vi.fn(),
  default: vi.fn()
}));

vi.mock('../services/musicService', () => ({
  default: {
    getCoverArt: vi.fn().mockResolvedValue(null),
    searchMusicBrainz: vi.fn().mockResolvedValue([]),
    searchByBarcode: vi.fn().mockResolvedValue([]),
    searchByCatalogNumber: vi.fn().mockResolvedValue([]),
    scanAlbumCover: vi.fn(),
    addAlbumFromSource: vi.fn().mockResolvedValue({ id: 1 }),
    addAlbumFromMusicBrainz: vi.fn().mockResolvedValue({ id: 1 }),
    getAlbumById: vi.fn().mockResolvedValue({ id: 1 })
  }
}));

import musicService from '../services/musicService';
import { decodeBarcode } from '../utils/decodeBarcode';

const release = (over: Record<string, unknown> = {}) => ({
  musicbrainzReleaseId: 'mbid-1',
  title: 'Kind of Blue',
  artist: ['Miles Davis'],
  releaseYear: 1959,
  format: 'CD',
  ...over
});

const renderDialog = (props: Record<string, unknown> = {}) =>
  render(<AddMusicDialog show={true} onHide={vi.fn()} {...props} />);

const photoFile = () =>
  new File([new Uint8Array([1, 2, 3])], 'sleeve.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  (musicService.scanAlbumCover as any).mockResolvedValue({
    llm_result: { artist: 'Miles Davis', title: 'Kind of Blue', year: 1959 },
    results: [release()],
    confidence: 'high'
  });
});

describe('AddMusicDialog — photo mode', () => {
  it('offers a photo option next to the text searches', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /^photo$/i })).toBeInTheDocument();
  });

  it('uses the rear camera for the capture input', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    expect(input).toHaveAttribute('capture', 'environment');
    expect(input).toHaveAttribute('accept', expect.stringContaining('image/'));
  });

  it('scans as soon as a photo is picked, with no extra tap', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');

    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(musicService.scanAlbumCover).toHaveBeenCalled());
  });

  it('sends base64 without the data-url prefix, plus the mime type', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(musicService.scanAlbumCover).toHaveBeenCalled());

    const [base64, mimeType] = (musicService.scanAlbumCover as any).mock.calls[0];
    expect(base64).not.toMatch(/^data:/);
    expect(mimeType).toMatch(/^image\//);
  });

  it('shows the identified release as a result', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(screen.getByText('Kind of Blue')).toBeInTheDocument());
  });

  it('reports a cover it could not identify instead of staying silent', async () => {
    (musicService.scanAlbumCover as any).mockRejectedValue(new Error('Could not identify album'));
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(screen.getByText(/could not identify/i)).toBeInTheDocument());
  });

  it('lets the same photo be picked again after a failure', async () => {
    (musicService.scanAlbumCover as any).mockRejectedValueOnce(new Error('Network down'));
    renderDialog();

    const input = (await screen.findByTestId('album-photo-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
    // A file input keeps its value, so re-picking the same file fires no change
    // event unless the value was cleared.
    expect(input.value).toBe('');
  });
});

describe('AddMusicDialog — empty text search', () => {
  it('tells the user when a search found nothing', async () => {
    (musicService.searchMusicBrainz as any).mockResolvedValue([]);
    renderDialog();

    userEvent.click(screen.getByRole('button', { name: /album title/i }));
    userEvent.type(screen.getByPlaceholderText(/album title/i), 'zzzz');
    userEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(screen.getByText(/no (results|match)/i)).toBeInTheDocument());
  });
});

describe('AddMusicDialog — photo is the default path', () => {
  it('opens straight on the photo option', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument();
  });

  it('opens the camera on the very first tap, with no mode tap in between', async () => {
    renderDialog();

    const input = screen.getByTestId('album-photo-input');
    const clickSpy = vi.spyOn(input, 'click');

    userEvent.click(screen.getByRole('button', { name: /take a photo/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it('opens the camera directly when coming back from a text search', async () => {
    renderDialog();

    const input = screen.getByTestId('album-photo-input');
    const clickSpy = vi.spyOn(input, 'click');

    userEvent.click(screen.getByRole('button', { name: /album title/i }));
    userEvent.click(screen.getByRole('button', { name: /^photo$/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it('still lets the user fall back to typing a title', async () => {
    renderDialog();

    userEvent.click(screen.getByRole('button', { name: /album title/i }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/album title/i)).toBeInTheDocument()
    );
  });
});

describe('AddMusicDialog — text search query building', () => {
  const searchFor = (title: string, artist?: string) => {
    renderDialog();
    userEvent.click(screen.getByRole('button', { name: /album title/i }));
    userEvent.type(screen.getByPlaceholderText(/album title/i), title);
    if (artist) userEvent.type(screen.getByPlaceholderText(/artist/i), artist);
    userEvent.click(screen.getByRole('button', { name: /^search$/i }));
  };

  const lastQuery = () =>
    (musicService.searchMusicBrainz as any).mock.calls.at(-1)[0] as string;

  it('quotes a title containing a slash, so "AC/DC" does not break the query', async () => {
    searchFor('Back in Black', 'AC/DC');

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
    expect(lastQuery()).toContain('artist:"AC/DC"');
  });

  it('quotes a title containing a colon', async () => {
    searchFor('Live: 1975');

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
    expect(lastQuery()).toContain('"Live: 1975"');
  });

  it('escapes a double quote instead of producing an unbalanced query', async () => {
    searchFor('The "Chirping" Crickets');

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
    expect(lastQuery()).toContain('\\"Chirping\\"');
  });
});

describe('AddMusicDialog — barcode entry', () => {
  it('asks for a numeric keypad on the barcode field', async () => {
    renderDialog();

    userEvent.click(screen.getByRole('button', { name: /^barcode$/i }));

    const input = await screen.findByPlaceholderText(/barcode/i);
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });
});

describe('AddMusicDialog — one-tap add alongside review', () => {
  const showResults = async () => {
    renderDialog();
    const input = screen.getByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });
    await waitFor(() => expect(screen.getByText('Kind of Blue')).toBeInTheDocument());
  };

  it('offers both a one-tap Add and the Review path', async () => {
    await showResults();

    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeInTheDocument();
  });

  it('stores the album straight from the result list', async () => {
    await showResults();

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(musicService.addAlbumFromSource).toHaveBeenCalledWith(
        'musicbrainz',
        'mbid-1',
        expect.anything()
      )
    );
  });

  it('does not open the metadata form on a one-tap add', async () => {
    await showResults();

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(musicService.addAlbumFromSource).toHaveBeenCalled());
    expect(screen.queryByText(/ownership information/i)).not.toBeInTheDocument();
  });

  it('tells the parent an album was added', async () => {
    const onAlbumAdded = vi.fn();
    renderDialog({ onAlbumAdded });
    fireEvent.change(screen.getByTestId('album-photo-input'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(screen.getByText('Kind of Blue')).toBeInTheDocument());

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(onAlbumAdded).toHaveBeenCalled());
  });

  it('keeps the results and shows the reason when the add fails', async () => {
    (musicService.addAlbumFromSource as any).mockRejectedValueOnce(
      new Error('Album already exists in collection')
    );
    await showResults();

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument();
  });

  it('still opens the metadata form from Review', async () => {
    await showResults();

    userEvent.click(screen.getByRole('button', { name: /review/i }));

    await waitFor(() =>
      expect(screen.getByText(/ownership information/i)).toBeInTheDocument()
    );
  });
});

describe('AddMusicDialog — barcode by photo', () => {
  const goToBarcode = () => {
    renderDialog();
    userEvent.click(screen.getByRole('button', { name: /^barcode$/i }));
  };

  it('offers to photograph the barcode', async () => {
    goToBarcode();

    expect(await screen.findByRole('button', { name: /scan/i })).toBeInTheDocument();
  });

  it('searches with the decoded barcode without any typing', async () => {
    (decodeBarcode as any).mockResolvedValue('5099750442227');
    goToBarcode();

    const input = await screen.findByTestId('barcode-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() =>
      expect(musicService.searchByBarcode).toHaveBeenCalledWith('5099750442227')
    );
  });

  it('fills the field with what it read, so it can be corrected', async () => {
    (decodeBarcode as any).mockResolvedValue('5099750442227');
    goToBarcode();

    fireEvent.change(screen.getByTestId('barcode-photo-input'), {
      target: { files: [photoFile()] }
    });

    await waitFor(() =>
      expect((screen.getByPlaceholderText(/barcode/i) as HTMLInputElement).value).toBe(
        '5099750442227'
      )
    );
  });

  it('says so when no barcode could be read', async () => {
    (decodeBarcode as any).mockResolvedValue(null);
    goToBarcode();

    fireEvent.change(screen.getByTestId('barcode-photo-input'), {
      target: { files: [photoFile()] }
    });

    await waitFor(() =>
      expect(screen.getByText(/no barcode/i)).toBeInTheDocument()
    );
    expect(musicService.searchByBarcode).not.toHaveBeenCalled();
  });
});

describe('AddMusicDialog — MusicBrainz unavailable after a good scan', () => {
  const scanWithFailedLookup = () => {
    (musicService.scanAlbumCover as any).mockResolvedValue({
      llm_result: { artist: 'Massive Attack', title: 'Mezzanine', year: 1998 },
      results: [],
      confidence: 'low',
      search_failed: true,
      error: 'MusicBrainz is busy or unavailable right now.'
    });
  };

  it('keeps what was read off the cover in the title and artist fields', async () => {
    scanWithFailedLookup();
    renderDialog();

    fireEvent.change(screen.getByTestId('album-photo-input'), {
      target: { files: [photoFile()] }
    });

    // Switching to the text tab must show the scan already filled in, so the
    // search can be retried without photographing the sleeve again.
    await waitFor(() => expect(musicService.scanAlbumCover).toHaveBeenCalled());
    userEvent.click(screen.getByRole('button', { name: /album title/i }));

    await waitFor(() => {
      expect((screen.getByPlaceholderText(/album title/i) as HTMLInputElement).value).toBe('Mezzanine');
      expect((screen.getByPlaceholderText(/artist/i) as HTMLInputElement).value).toBe('Massive Attack');
    });
  });

  it('explains that the lookup failed, not the scan', async () => {
    scanWithFailedLookup();
    renderDialog();

    fireEvent.change(screen.getByTestId('album-photo-input'), {
      target: { files: [photoFile()] }
    });

    await waitFor(() =>
      expect(screen.getByText(/busy or unavailable/i)).toBeInTheDocument()
    );
  });

  it('offers to retry the search without retaking the photo', async () => {
    scanWithFailedLookup();
    renderDialog();

    fireEvent.change(screen.getByTestId('album-photo-input'), {
      target: { files: [photoFile()] }
    });

    const retry = await screen.findByRole('button', { name: /retry|try again/i });
    (musicService.searchMusicBrainz as any).mockResolvedValue([release()]);

    userEvent.click(retry);

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
  });
});

describe('AddMusicDialog — results from either source', () => {
  const discogsResult = {
    source: 'discogs',
    releaseId: '7156458',
    discogsReleaseId: '7156458',
    musicbrainzReleaseId: null,
    title: 'Drones',
    artist: ['Muse'],
    releaseYear: 2015,
    format: 'CD',
    coverArt: { front: 'https://i.discogs.com/front.jpg', back: null }
  };

  const showDiscogsResults = async () => {
    (musicService.scanAlbumCover as any).mockResolvedValue({
      llm_result: { artist: 'Muse', title: 'Drones', year: 2015 },
      results: [discogsResult],
      confidence: 'high'
    });
    renderDialog();
    fireEvent.change(screen.getByTestId('album-photo-input'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(screen.getByText('Drones')).toBeInTheDocument());
  };

  it('adds a Discogs result through its own source', async () => {
    await showDiscogsResults();

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(musicService.addAlbumFromSource).toHaveBeenCalledWith(
        'discogs',
        '7156458',
        expect.anything()
      )
    );
  });

  it('adds a MusicBrainz result through its own source', async () => {
    (musicService.scanAlbumCover as any).mockResolvedValue({
      llm_result: { artist: 'Miles Davis', title: 'Kind of Blue' },
      results: [{ ...release(), source: 'musicbrainz', releaseId: 'mbid-1' }],
      confidence: 'high'
    });
    renderDialog();
    fireEvent.change(screen.getByTestId('album-photo-input'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(screen.getByText('Kind of Blue')).toBeInTheDocument());

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(musicService.addAlbumFromSource).toHaveBeenCalledWith(
        'musicbrainz',
        'mbid-1',
        expect.anything()
      )
    );
  });

  it('shows the cover Discogs already provided instead of asking for one', async () => {
    await showDiscogsResults();

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', 'https://i.discogs.com/front.jpg');
    // Cover Art Archive knows nothing about a Discogs release.
    expect(musicService.getCoverArt).not.toHaveBeenCalled();
  });

  it('shows the in-flight spinner on a Discogs result too', async () => {
    // Keyed on the MusicBrainz id alone, a Discogs result greyed out with no
    // spinner anywhere and the click looked like it had done nothing.
    (musicService.addAlbumFromSource as any).mockImplementation(() => new Promise(() => {}));
    await showDiscogsResults();

    userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(document.querySelector('.quick-add-btn .spinner-border')).toBeInTheDocument()
    );
  });
});

describe('AddMusicDialog — reading the sleeve when nothing matched', () => {
  it('offers to read the sleeve once a scan comes back empty', async () => {
    (musicService.scanAlbumCover as any).mockResolvedValue({
      llm_result: { artist: 'Unknown', title: 'Unknown' },
      results: [],
      confidence: 'low'
    });
    renderDialog({ onDraftEntry: vi.fn() });
    fireEvent.change(screen.getByTestId('album-photo-input'), { target: { files: [photoFile()] } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /fill the form from your photos/i })).toBeInTheDocument()
    );
  });

  it('offers it when the scan itself failed, which is when it is most needed', async () => {
    // A scan that throws never set hasSearched, so the empty state that hosts
    // the offer used to render nothing in exactly this case.
    (musicService.scanAlbumCover as any).mockRejectedValue(new Error('Could not read the sleeve'));
    renderDialog({ onDraftEntry: vi.fn() });
    fireEvent.change(screen.getByTestId('album-photo-input'), { target: { files: [photoFile()] } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /fill the form from your photos/i })).toBeInTheDocument()
    );
  });

  it('opens the capture step from manual entry rather than an empty form', async () => {
    const onDraftEntry = vi.fn();
    const onReviewMetadata = vi.fn();
    renderDialog({ onDraftEntry, onReviewMetadata });

    fireEvent.click(screen.getByRole('button', { name: /manual entry/i }));

    await waitFor(() => expect(screen.getByTestId('sleeve-back-input')).toBeInTheDocument());
    expect(onReviewMetadata).not.toHaveBeenCalled();
  });

  it('still reaches the empty form for someone who would rather type', async () => {
    const onReviewMetadata = vi.fn();
    renderDialog({ onDraftEntry: vi.fn(), onReviewMetadata });

    fireEvent.click(screen.getByRole('button', { name: /manual entry/i }));
    await waitFor(() => expect(screen.getByTestId('sleeve-back-input')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /by hand/i }));

    await waitFor(() => expect(onReviewMetadata).toHaveBeenCalledWith(null));
  });
});
