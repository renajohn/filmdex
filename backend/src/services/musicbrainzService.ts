import axios, { AxiosResponse } from 'axios';

interface CoverArtThumbnails {
  '1200'?: string;
  '500'?: string;
  large?: string;
  [key: string]: string | undefined;
}

interface CoverArtImage {
  front: boolean;
  back: boolean;
  image: string;
  thumbnails: CoverArtThumbnails;
}

interface CoverArtResult {
  front?: {
    url: string;
    thumbnails?: CoverArtThumbnails;
  };
  back?: {
    url: string;
    thumbnails?: CoverArtThumbnails;
  };
}

interface MBReleaseSearchResponse {
  releases: MBRawRelease[];
}

interface MBCoverArtResponse {
  images: CoverArtImage[];
}

/** Raw MusicBrainz release shape (loosely typed -- external API) */
interface MBRawRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
  barcode?: string;
  status?: string;
  packaging?: string;
  disambiguation?: string;
  annotation?: string;
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
  'label-info'?: Array<{ 'catalog-number'?: string; label?: { name?: string } }>;
  'catalog-number'?: string;
  media?: Array<{
    format?: string;
    tracks?: Array<{
      id: string;
      number: string;
      title: string;
      length?: number;
      isrc?: string;
      recording?: {
        id: string;
        title: string;
        isrcs?: string[];
        relations?: MBRelation[];
      };
    }>;
  }>;
  'release-group'?: {
    id?: string;
    title?: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
    'first-release-date'?: string;
    genres?: Array<{ name: string }>;
    tags?: Array<{ name: string }>;
    rating?: { value?: number };
  };
  genres?: Array<{ name: string }>;
  tags?: Array<{ name: string }>;
  'release-events'?: Array<{
    date?: string;
    area?: { name?: string; 'iso-3166-1-codes'?: string[] };
  }>;
  'text-representation'?: { language?: string };
  relations?: MBRelation[];
  coverArt?: CoverArtResult | null;
}

interface MBRelation {
  type: string;
  artist?: { name: string };
  place?: { name: string };
  url?: { resource: string };
}

interface FormattedTrack {
  trackNumber: string;
  title: string;
  durationSec: number | null;
  isrc: string | null;
  musicbrainzRecordingId: string | null;
  musicbrainzTrackId: string | null;
}

interface FormattedDisc {
  number: number;
  tracks: FormattedTrack[];
}

interface ReleaseEvent {
  date: string | undefined;
  country: string | undefined;
  countryCode: string | undefined;
}

export interface FormattedRelease {
  musicbrainzReleaseId: string;
  musicbrainzReleaseGroupId: string | null;
  title: string;
  artist: string[];
  releaseYear: number | null;
  releaseGroupFirstReleaseDate: number | null;
  releaseGroupType: string | null;
  releaseGroupSecondaryTypes: string[];
  country: string | undefined;
  barcode: string | undefined;
  catalogNumber: string | undefined;
  labels: string[];
  genres: string[];
  tags: string[];
  rating: number | null;
  releaseEvents: ReleaseEvent[];
  totalDuration: number | null;
  format: string;
  packaging: string;
  status: string;
  discs: FormattedDisc[];
  discCount: number;
  editionNotes: string | null;
  coverArt: { front: string | null; back: string | null };
  producer: string[];
  engineer: string[];
  recordingLocation: string | null;
  language: string | null;
  urls: Record<string, string>;
  isrcCodes: string[];
  annotation: string | null;
}

const musicbrainzService = {
  baseUrl: 'https://musicbrainz.org/ws/2',
  userAgent: 'FilmDex/1.0 (https://github.com/renajohn/filmdex)',
  coverArtBaseUrl: 'https://coverartarchive.org',

  searchRelease: async function(query: string, limit: number = 10): Promise<MBRawRelease[]> {
    try {
      const response: AxiosResponse<MBReleaseSearchResponse> = await axios.get(`${this.baseUrl}/release`, {
        params: {
          query: query,
          limit: limit,
          inc: 'artists+labels+release-groups+tags+genres',
          fmt: 'json'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      const releases = response.data.releases || [];
      return releases;
    } catch (error: unknown) {
      const err = error as { message: string; code?: string };
      console.error('MusicBrainz search error:', err.message);
      if (err.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to search MusicBrainz: ${err.message}`);
    }
  },

  getReleaseDetails: async function(releaseId: string): Promise<MBRawRelease> {
    try {
      const response: AxiosResponse<MBRawRelease> = await axios.get(`${this.baseUrl}/release/${releaseId}`, {
        params: {
          inc: 'artists+recordings+release-groups+labels+media+tags+genres+artist-rels+url-rels+work-rels+recording-rels+isrcs+annotation',
          fmt: 'json'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      return response.data;
    } catch (error: unknown) {
      const err = error as { message: string; code?: string; response?: { status: number; data: unknown } };
      console.error('MusicBrainz release details error:', err.message);
      if (err.response) {
        console.error('Response status:', err.response.status);
        console.error('Response data:', err.response.data);
      }
      if (err.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to get release details: ${err.message}`);
    }
  },

  getReleaseByBarcode: async function(barcode: string): Promise<MBRawRelease[]> {
    try {
      const response: AxiosResponse<MBReleaseSearchResponse> = await axios.get(`${this.baseUrl}/release`, {
        params: {
          query: `barcode:${barcode}`,
          inc: 'artists+labels+release-groups+tags+genres',
          fmt: 'json'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      const releases = response.data.releases || [];

      // Fetch cover art for each release
      const releasesWithCovers: MBRawRelease[] = await Promise.all(
        releases.map(async (release: MBRawRelease): Promise<MBRawRelease> => {
          try {
            const coverArt = await this.getCoverArt(release.id);
            return { ...release, coverArt: coverArt };
          } catch (error: unknown) {
            const err = error as { message: string };
            console.warn(`Failed to fetch cover art for release ${release.id}:`, err.message);
            return { ...release, coverArt: null };
          }
        })
      );

      return releasesWithCovers;
    } catch (error: unknown) {
      const err = error as { message: string; code?: string };
      console.error('MusicBrainz barcode search error:', err.message);
      if (err.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to search by barcode: ${err.message}`);
    }
  },

  getReleaseByCatalogNumber: async function(catalogNumber: string): Promise<MBRawRelease[]> {
    try {
      // Remove spaces from catalog number for better search results
      const cleanCatalogNumber = catalogNumber.replace(/\s+/g, '');

      const response: AxiosResponse<MBReleaseSearchResponse> = await axios.get(`${this.baseUrl}/release`, {
        params: {
          query: `catno:${cleanCatalogNumber}`,
          inc: 'artists+recordings+release-groups+labels+media+tags+genres',
          fmt: 'json'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      const releases = response.data.releases || [];

      // Fetch cover art for each release
      const releasesWithCovers: MBRawRelease[] = await Promise.all(
        releases.map(async (release: MBRawRelease): Promise<MBRawRelease> => {
          try {
            const coverArt = await this.getCoverArt(release.id);
            return { ...release, coverArt: coverArt };
          } catch (error: unknown) {
            const err = error as { message: string };
            console.warn(`Failed to fetch cover art for release ${release.id}:`, err.message);
            return { ...release, coverArt: null };
          }
        })
      );

      return releasesWithCovers;
    } catch (error: unknown) {
      const err = error as { message: string; code?: string };
      console.error('MusicBrainz catalog number search error:', err.message);
      if (err.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to search by catalog number: ${err.message}`);
    }
  },

  getCoverArt: async function(releaseId: string): Promise<CoverArtResult | null> {
    try {
      const response: AxiosResponse<MBCoverArtResponse | string> = await axios.get(`${this.coverArtBaseUrl}/release/${releaseId}`, {
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: function (status: number): boolean {
          return status >= 200 && status < 300;
        }
      });

      // Handle redirect responses that point to archive.org
      if (typeof response.data === 'string' && response.data.includes('archive.org')) {
        console.log(`Cover Art Archive redirected to archive.org for release ${releaseId}`);
        const archiveMatch = response.data.match(/https?:\/\/archive\.org\/download\/[^"'\s]+/);
        if (archiveMatch) {
          const archiveUrl = archiveMatch[0];
          console.log(`Extracted archive.org URL: ${archiveUrl}`);
          return {
            front: {
              url: archiveUrl
            }
          };
        }
        return null;
      }

      const data = response.data as MBCoverArtResponse;
      const images = data.images || [];

      // Find front and back cover images
      const frontCover = images.find((img: CoverArtImage) => img.front === true);
      const backCover = images.find((img: CoverArtImage) => img.back === true);

      const result: CoverArtResult = {};

      if (frontCover) {
        result.front = {
          url: frontCover.thumbnails['1200'] || frontCover.thumbnails['500'] || frontCover.thumbnails['large'] || frontCover.image,
          thumbnails: frontCover.thumbnails
        };
      }

      if (backCover) {
        result.back = {
          url: backCover.thumbnails['1200'] || backCover.thumbnails['500'] || backCover.thumbnails['large'] || backCover.image,
          thumbnails: backCover.thumbnails
        };
      }

      // Return null if no covers found, otherwise return the result object
      return Object.keys(result).length > 0 ? result : null;
    } catch (error: unknown) {
      const err = error as { message: string };
      console.error('Cover Art Archive error:', err.message);
      // Don't throw error for cover art - it's optional
      return null;
    }
  },

  formatReleaseData: (release: MBRawRelease): FormattedRelease => {
    const artists = release['artist-credit']?.map(credit => credit.name || credit.artist?.name).filter(Boolean) as string[] || [];

    // Extract tracks from all media (discs)
    const discs: FormattedDisc[] = [];
    if (release.media && release.media.length > 0) {
      release.media.forEach((media, discIndex) => {
        const tracks: FormattedTrack[] = media.tracks?.map(track => ({
          trackNumber: track.number,
          title: track.title,
          durationSec: track.length ? Math.floor(track.length / 1000) : null,
          isrc: track.isrc || null,
          musicbrainzRecordingId: track.recording?.id || null,
          musicbrainzTrackId: track.id || null
        })) || [];

        discs.push({
          number: discIndex + 1,
          tracks: tracks
        });
      });
    }

    // Extract labels
    const labels = release['label-info']?.map(labelInfo => labelInfo.label?.name).filter(Boolean) as string[] || [];

    // Extract genres from multiple sources for better coverage
    const releaseGroupGenres = release['release-group']?.genres?.map(genre => genre.name) || [];
    const releaseGenres = release.genres?.map(genre => genre.name) || [];
    const genres = [...new Set([...releaseGroupGenres, ...releaseGenres])];

    // Extract tags for additional metadata
    const releaseGroupTags = release['release-group']?.tags?.map(tag => tag.name) || [];
    const releaseTags = release.tags?.map(tag => tag.name) || [];
    const tags = [...new Set([...releaseGroupTags, ...releaseTags])].slice(0, 20);

    // Extract release group rating
    const rating = release['release-group']?.rating?.value ?
      Math.round(release['release-group'].rating!.value! * 20) / 20 : null;

    // Extract country and catalog number
    const country = release.country;
    const catalogNumber = release['label-info']?.[0]?.['catalog-number'] || release['catalog-number'];

    // Extract release events
    const releaseEvents: ReleaseEvent[] = release['release-events']?.map(event => ({
      date: event.date,
      country: event.area?.name,
      countryCode: event.area?.['iso-3166-1-codes']?.[0]
    })) || [];

    // Extract total duration
    const totalDuration = release.media?.reduce((total, media) => {
      return total + (media.tracks?.reduce((discTotal, track) => {
        return discTotal + (track.length || 0);
      }, 0) || 0);
    }, 0) || null;

    // Extract format and packaging info
    const format = release.media?.[0]?.format || 'Unknown';
    const packaging = release.packaging || 'None';
    const status = release.status || 'Unknown';

    // Extract release group first release date
    const releaseGroupFirstReleaseDate = release['release-group']?.['first-release-date']
      ? new Date(release['release-group']['first-release-date']).getFullYear()
      : null;

    // Extract release group type
    const releaseGroupType = release['release-group']?.['primary-type'] || null;
    const releaseGroupSecondaryTypes = release['release-group']?.['secondary-types'] || [];

    // Extract relationship data (credits, URLs, etc.)
    const producer: string[] = [];
    const engineer: string[] = [];
    let recordingLocation: string | null = null;
    const urls: Record<string, string> = {};

    // Extract credits from artist relationships
    if (release.relations) {
      release.relations.forEach(relation => {
        if (relation.type === 'producer' && relation.artist) {
          producer.push(relation.artist.name);
        } else if (relation.type === 'engineer' && relation.artist) {
          engineer.push(relation.artist.name);
        } else if (relation.type === 'recorded at' && relation.place) {
          recordingLocation = relation.place.name;
        }
      });
    }

    // Extract URLs from URL relationships
    if (release.relations) {
      release.relations.forEach(relation => {
        if (relation.type && relation.url) {
          const urlType = relation.type;
          if (urlType === 'discogs' || urlType === 'wikipedia' || urlType === 'wikidata' ||
              urlType === 'official homepage' || urlType === 'purchase for download' ||
              urlType === 'allmusic' || urlType === 'streaming music') {
            urls[urlType] = relation.url.resource;
          }
        }
      });
    }

    // Extract recording relationships from media tracks
    if (release.media) {
      release.media.forEach(media => {
        media.tracks?.forEach(track => {
          if (track.recording?.relations) {
            track.recording.relations.forEach(relation => {
              if (relation.type === 'producer' && relation.artist && !producer.includes(relation.artist.name)) {
                producer.push(relation.artist.name);
              } else if (relation.type === 'engineer' && relation.artist && !engineer.includes(relation.artist.name)) {
                engineer.push(relation.artist.name);
              } else if (relation.type === 'recorded at' && relation.place && !recordingLocation) {
                recordingLocation = relation.place.name;
              }
            });
          }
        });
      });
    }

    // Extract ISRC codes from tracks
    const isrcCodes: string[] = [];
    if (release.media) {
      release.media.forEach(media => {
        media.tracks?.forEach(track => {
          if (track.recording?.isrcs) {
            track.recording.isrcs.forEach(isrc => {
              if (!isrcCodes.includes(isrc)) {
                isrcCodes.push(isrc);
              }
            });
          }
        });
      });
    }

    // Extract language
    const language = release['text-representation']?.language || null;

    // Extract annotation
    const annotation = release.annotation || null;

    const result: FormattedRelease = {
      musicbrainzReleaseId: release.id,
      musicbrainzReleaseGroupId: release['release-group']?.id || null,
      title: release.title,
      artist: artists,
      releaseYear: release.date ? new Date(release.date).getFullYear() : null,
      releaseGroupFirstReleaseDate: releaseGroupFirstReleaseDate,
      releaseGroupType: releaseGroupType,
      releaseGroupSecondaryTypes: releaseGroupSecondaryTypes,
      country: country,
      barcode: release.barcode,
      catalogNumber: catalogNumber,
      labels: labels,
      genres: genres,
      tags: tags,
      rating: rating,
      releaseEvents: releaseEvents,
      totalDuration: totalDuration ? Math.floor(totalDuration / 1000) : null,
      format: format,
      packaging: packaging,
      status: status,
      discs: discs,
      discCount: release.media?.length || 1,
      editionNotes: release.disambiguation || null,
      coverArt: {
        front: release.coverArt?.front?.url || null,
        back: release.coverArt?.back?.url || null
      },
      producer: producer,
      engineer: engineer,
      recordingLocation: recordingLocation,
      language: language,
      urls: urls,
      isrcCodes: isrcCodes,
      annotation: annotation
    };

    return result;
  },
};

export default musicbrainzService;
