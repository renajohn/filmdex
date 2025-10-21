const axios = require('axios');

const musicbrainzService = {
  baseUrl: 'https://musicbrainz.org/ws/2',
  userAgent: 'FilmDex/1.0 (https://github.com/renajohn/filmdex)',
  coverArtBaseUrl: 'https://coverartarchive.org',

  searchRelease: async function(query, limit = 10) {
    try {
      const response = await axios.get(`${this.baseUrl}/release`, {
        params: {
          query: query,
          limit: limit,
          inc: 'artists+labels+release-groups+tags+genres',
          fmt: 'json'
        },
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000 // 10 second timeout
      });

      const releases = response.data.releases || [];
      
      // Fetch cover art for each release
      const releasesWithCovers = await Promise.all(
        releases.map(async (release) => {
          try {
            const coverArt = await this.getCoverArt(release.id);
            return {
              ...release,
              coverArt: coverArt
            };
          } catch (error) {
            console.warn(`Failed to fetch cover art for release ${release.id}:`, error.message);
            return {
              ...release,
              coverArt: null
            };
          }
        })
      );

      return releasesWithCovers;
    } catch (error) {
      console.error('MusicBrainz search error:', error.message);
      if (error.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to search MusicBrainz: ${error.message}`);
    }
  },

  getReleaseDetails: async function(releaseId) {
    try {
      const response = await axios.get(`${this.baseUrl}/release/${releaseId}`, {
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
    } catch (error) {
      console.error('MusicBrainz release details error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to get release details: ${error.message}`);
    }
  },

  getReleaseByBarcode: async function(barcode) {
    try {
      const response = await axios.get(`${this.baseUrl}/release`, {
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
      const releasesWithCovers = await Promise.all(
        releases.map(async (release) => {
          try {
            const coverArt = await this.getCoverArt(release.id);
            return { ...release, coverArt: coverArt };
          } catch (error) {
            console.warn(`Failed to fetch cover art for release ${release.id}:`, error.message);
            return { ...release, coverArt: null };
          }
        })
      );

      return releasesWithCovers;
    } catch (error) {
      console.error('MusicBrainz barcode search error:', error.message);
      if (error.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to search by barcode: ${error.message}`);
    }
  },

  getReleaseByCatalogNumber: async function(catalogNumber) {
    try {
      // Remove spaces from catalog number for better search results
      const cleanCatalogNumber = catalogNumber.replace(/\s+/g, '');
      
      const response = await axios.get(`${this.baseUrl}/release`, {
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
      const releasesWithCovers = await Promise.all(
        releases.map(async (release) => {
          try {
            const coverArt = await this.getCoverArt(release.id);
            return { ...release, coverArt: coverArt };
          } catch (error) {
            console.warn(`Failed to fetch cover art for release ${release.id}:`, error.message);
            return { ...release, coverArt: null };
          }
        })
      );

      return releasesWithCovers;
    } catch (error) {
      console.error('MusicBrainz catalog number search error:', error.message);
      if (error.code === 'ECONNABORTED') {
        throw new Error('MusicBrainz request timed out. Please try again.');
      }
      throw new Error(`Failed to search by catalog number: ${error.message}`);
    }
  },

  getCoverArt: async function(releaseId) {
    try {
      const response = await axios.get(`${this.coverArtBaseUrl}/release/${releaseId}`, {
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000,
        maxRedirects: 5, // Allow redirects
        validateStatus: function (status) {
          return status >= 200 && status < 300; // Accept redirects
        }
      });

      // Handle redirect responses that point to archive.org
      if (typeof response.data === 'string' && response.data.includes('archive.org')) {
        console.log(`Cover Art Archive redirected to archive.org for release ${releaseId}`);
        return null; // Skip this release as archive.org links are unreliable
      }

      const images = response.data.images || [];
      
      // Find front and back cover images
      const frontCover = images.find(img => img.front === true);
      const backCover = images.find(img => img.back === true);
      
      const result = {};
      
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
    } catch (error) {
      console.error('Cover Art Archive error:', error.message);
      // Don't throw error for cover art - it's optional
      return null;
    }
  },

  formatReleaseData: (release) => {
    const artists = release['artist-credit']?.map(credit => credit.name || credit.artist?.name) || [];
    
    // Extract tracks from all media (discs)
    const discs = [];
    if (release.media && release.media.length > 0) {
      release.media.forEach((media, discIndex) => {
        const tracks = media.tracks?.map(track => ({
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
    const labels = release['label-info']?.map(labelInfo => labelInfo.label?.name).filter(Boolean) || [];
    
    // Extract genres from multiple sources for better coverage
    const releaseGroupGenres = release['release-group']?.genres?.map(genre => genre.name) || [];
    const releaseGenres = release.genres?.map(genre => genre.name) || [];
    const genres = [...new Set([...releaseGroupGenres, ...releaseGenres])]; // Combine and deduplicate
    
    // Extract tags for additional metadata
    const releaseGroupTags = release['release-group']?.tags?.map(tag => tag.name) || [];
    const releaseTags = release.tags?.map(tag => tag.name) || [];
    const tags = [...new Set([...releaseGroupTags, ...releaseTags])].slice(0, 20); // Combine, deduplicate, limit
    
    
    // Extract release group rating - may not be available in basic request
    const rating = release['release-group']?.rating?.value ? 
      Math.round(release['release-group'].rating.value * 20) / 20 : null; // Convert to 5-point scale
    
    // Extract country and catalog number
    const country = release.country;
    const catalogNumber = release['label-info']?.[0]?.['catalog-number'] || release['catalog-number'];
    
    // Extract release events (release dates by country) - may not be available in basic request
    const releaseEvents = release['release-events']?.map(event => ({
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
    const producer = [];
    const engineer = [];
    let recordingLocation = null;
    const urls = {};
    
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
    const isrcCodes = [];
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
    

    let result = {
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
      totalDuration: totalDuration ? Math.floor(totalDuration / 1000) : null, // Convert to seconds
      format: format,
      packaging: packaging,
      status: status,
      discs: discs,
      discCount: release.media?.length || 1,
      editionNotes: release.disambiguation || null,
      coverArt: release.coverArt?.front?.url || release.coverArt?.back?.url || null,
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

module.exports = musicbrainzService;
