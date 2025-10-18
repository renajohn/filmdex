import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useNavigate, useLocation } from 'react-router-dom';
import musicService from '../services/musicService';
import MusicForm from './MusicForm';
import MusicThumbnail from './MusicThumbnail';
import MusicDetailCard from './MusicDetailCard';
import AddMusicDialog from './AddMusicDialog';
import { 
  BsSortDown, 
  BsChevronDown, 
  BsMusicNote,
  BsGrid3X3Gap
} from 'react-icons/bs';
import './MusicSearch.css';

const MusicSearch = forwardRef(({ 
  cds, 
  loading, 
  onAddCd, 
  onAddCdFromMusicBrainz, 
  onAddCdByBarcode, 
  onUpdateCd, 
  onDeleteCd, 
  onShowAlert,
  onOpenAddDialog,
  refreshTrigger,
  searchCriteria 
}, ref) => {
  const [allCds, setAllCds] = useState([]);
  const [filteredCds, setFilteredCds] = useState([]);
  const [sortBy, setSortBy] = useState('title');
  const [sortLoading, setSortLoading] = useState(false);
  const [groupBy, setGroupBy] = useState('none');
  const [groupLoading, setGroupLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [expandAllGroups, setExpandAllGroups] = useState(false);
  const [cdCount, setCdCount] = useState({ filtered: 0, total: 0 });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCd, setEditingCd] = useState(null);
  const [reviewingRelease, setReviewingRelease] = useState(null);
  const [selectedCdDetails, setSelectedCdDetails] = useState(null);
  const [, setLoadingDetails] = useState(false);
  const [cdDetailsBeforeEdit, setCdDetailsBeforeEdit] = useState(null);
  const previousSearchTextRef = useRef('');
  const navigate = useNavigate();
  const location = useLocation();

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    refresh: loadCds,
    search: performSearch,
    openAddDialog: () => setShowAddDialog(true),
    openAlbumDetails: (album) => setSelectedCdDetails(album),
    setSearchQuery: (query) => {
      // Update the URL with the new search query
      navigate(`${location.pathname}?search=${encodeURIComponent(query)}`);
    }
  }));

  // Function to update search via URL (which will update the search bar in App.js)
  const updateSearchViaUrl = (query) => {
    navigate(`${location.pathname}?search=${encodeURIComponent(query)}`);
  };

  useEffect(() => {
    loadCds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Handle search from App.js
  useEffect(() => {
    const currentSearchText = searchCriteria?.searchText || '';
    
    // Only run if search text has actually changed
    if (currentSearchText !== previousSearchTextRef.current) {
      previousSearchTextRef.current = currentSearchText;
      
      if (currentSearchText.trim()) {
        performSearch(currentSearchText);
      } else {
        setFilteredCds(allCds);
        setCdCount({ filtered: allCds.length, total: allCds.length });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCriteria?.searchText, allCds]);

  const loadCds = async () => {
    try {
      const data = await musicService.getAllAlbums();
      setAllCds(data);
      
      // Respect current search criteria when reloading
      const currentSearchText = searchCriteria?.searchText || '';
      if (currentSearchText.trim()) {
        // Re-apply search filter
        const localResults = await musicService.searchAlbums(currentSearchText);
        setFilteredCds(localResults);
        setCdCount({ filtered: localResults.length, total: data.length });
      } else {
        // No search - show all albums
        setFilteredCds(data);
        setCdCount({ filtered: data.length, total: data.length });
      }
    } catch (error) {
      console.error('Error loading albums:', error);
      if (onShowAlert) {
        onShowAlert('Failed to load albums: ' + error.message, 'danger');
      }
    }
  };

  const performSearch = async (query) => {
    if (!query.trim()) {
      setFilteredCds(allCds);
      setCdCount({ filtered: allCds.length, total: allCds.length });
      return;
    }

    try {
      // Search local albums
      const localResults = await musicService.searchAlbums(query);
      setFilteredCds(localResults);
      setCdCount({ filtered: localResults.length, total: allCds.length });
    } catch (error) {
      console.error('Error searching:', error);
      if (onShowAlert) {
        onShowAlert('Search failed: ' + error.message, 'danger');
      }
    }
  };

  const sortCds = useCallback((cdsToSort, sortOption) => {
    const sorted = [...cdsToSort];
    
    switch (sortOption) {
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case 'titleReverse':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case 'artist':
        return sorted.sort((a, b) => {
          const artistA = Array.isArray(a.artist) ? a.artist.join(', ') : a.artist;
          const artistB = Array.isArray(b.artist) ? b.artist.join(', ') : b.artist;
          return artistA.localeCompare(artistB);
        });
      case 'artistReverse':
        return sorted.sort((a, b) => {
          const artistA = Array.isArray(a.artist) ? a.artist.join(', ') : a.artist;
          const artistB = Array.isArray(b.artist) ? b.artist.join(', ') : b.artist;
          return artistB.localeCompare(artistA);
        });
      case 'year':
        return sorted.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
      case 'yearReverse':
        return sorted.sort((a, b) => (a.releaseYear || 0) - (b.releaseYear || 0));
      case 'lastAdded':
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'lastAddedReverse':
        return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      default:
        return sorted;
    }
  }, []);

  const handleSortChange = async (sortOption) => {
    setSortBy(sortOption);
    setSortLoading(true);
    
    // Add a small delay to show loading state for better UX
    await new Promise(resolve => setTimeout(resolve, 150));
    
    try {
      const sortedCds = sortCds(filteredCds, sortOption);
      setFilteredCds(sortedCds);
      setCdCount({ filtered: sortedCds.length, total: allCds.length });
    } finally {
      setSortLoading(false);
    }
  };

  const groupCds = useCallback((cdsToGroup, groupOption) => {
    if (groupOption === 'none') {
      return { 'All Albums': cdsToGroup };
    }

    const groups = {};
    
    cdsToGroup.forEach(cd => {
      let groupKeys = [];
      
      switch (groupOption) {
        case 'artist':
          const artists = Array.isArray(cd.artist) ? cd.artist : [cd.artist];
          groupKeys = artists.map(a => a || 'Unknown Artist');
          break;
        case 'genre':
          if (cd.genres && cd.genres.length > 0) {
            groupKeys = cd.genres;
          } else {
            groupKeys = ['Unknown Genre'];
          }
          break;
        case 'label':
          if (cd.labels && cd.labels.length > 0) {
            groupKeys = cd.labels;
          } else {
            groupKeys = ['Unknown Label'];
          }
          break;
        case 'decade':
          if (cd.releaseYear && !isNaN(cd.releaseYear)) {
            const decade = Math.floor(cd.releaseYear / 10) * 10;
            groupKeys = [`${decade}s`];
          } else {
            groupKeys = ['Unknown Decade'];
          }
          break;
        case 'country':
          groupKeys = [cd.country || 'Unknown Country'];
          break;
        case 'quality':
          groupKeys = [cd.recordingQuality || 'Not Rated'];
          break;
        default:
          groupKeys = ['All Albums'];
      }
      
      // Add album to each group it belongs to
      groupKeys.forEach(groupKey => {
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(cd);
      });
    });

    // Sort groups alphabetically by key
    const sortedGroups = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  }, []);

  const handleGroupChange = async (groupOption) => {
    setGroupBy(groupOption);
    setGroupLoading(true);
    
    // Add a small delay to show loading state for better UX
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // If grouping is enabled, expand all groups initially
    if (groupOption !== 'none') {
      const grouped = groupCds(filteredCds, groupOption);
      const allGroupKeys = Object.keys(grouped);
      setExpandedGroups(new Set(allGroupKeys));
      setExpandAllGroups(true);
    } else {
      setExpandedGroups(new Set());
      setExpandAllGroups(false);
    }
    
    setGroupLoading(false);
  };

  const toggleGroup = (groupKey) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupKey)) {
      newExpandedGroups.delete(groupKey);
    } else {
      newExpandedGroups.add(groupKey);
    }
    setExpandedGroups(newExpandedGroups);
  };

  const toggleAllGroups = () => {
    if (groupBy === 'none') return;
    
    const grouped = groupCds(filteredCds, groupBy);
    const allGroupKeys = Object.keys(grouped);
    
    if (expandAllGroups) {
      setExpandedGroups(new Set());
      setExpandAllGroups(false);
    } else {
      setExpandedGroups(new Set(allGroupKeys));
      setExpandAllGroups(true);
    }
  };

  const handleEditCd = async (cd) => {
    try {
      setLoadingDetails(true);
      const details = await musicService.getAlbumById(cd.id);
      setCdDetailsBeforeEdit(selectedCdDetails);
      setEditingCd(details);
      setSelectedCdDetails(null);
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load album details for editing: ' + err.message, 'danger');
      }
      setCdDetailsBeforeEdit(selectedCdDetails);
      setEditingCd(cd);
      setSelectedCdDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };


  const handleReviewMetadata = async (release, allReleasesInGroup = null) => {
    try {
      if (!release) {
        // Manual entry - just show empty form
        setReviewingRelease({});
        return;
      }
      
      // Extract all available cover art options from the group
      let availableCovers = [];
      if (allReleasesInGroup && allReleasesInGroup.length > 0) {
        availableCovers = allReleasesInGroup
          .filter(r => r.coverArt?.url)
          .map(r => ({
            url: r.coverArt.url,
            country: r.country,
            year: r.releaseYear,
            catalogNumber: r.catalogNumber
          }));
        
        // Remove duplicates based on URL
        availableCovers = Array.from(
          new Map(availableCovers.map(c => [c.url, c])).values()
        );
      }
      
      // Fetch full details from MusicBrainz
      setLoadingDetails(true);
      const details = await musicService.getMusicBrainzReleaseDetails(release.musicbrainzReleaseId);
      
      // Convert MusicBrainz data to album form data
      const cdData = {
        title: details.title || release.title,
        artist: details.artist || release.artist,
        releaseYear: details.releaseYear || release.releaseYear,
        labels: details.labels || release.labels || [],
        catalogNumber: details.catalogNumber || release.catalogNumber,
        barcode: details.barcode || release.barcode,
        country: details.country || release.country,
        format: details.format || release.format || 'CD',
        genres: details.genres || release.genres || [],
        tags: details.tags || release.tags || [],
        cover: details.coverArt?.url || release.coverArt?.url,
        musicbrainzReleaseId: details.musicbrainzReleaseId || release.musicbrainzReleaseId,
        musicbrainzReleaseGroupId: details.musicbrainzReleaseGroupId || release.musicbrainzReleaseGroupId,
        releaseGroupFirstReleaseDate: details.releaseGroupFirstReleaseDate || release.releaseGroupFirstReleaseDate,
        releaseGroupType: details.releaseGroupType || release.releaseGroupType,
        releaseGroupSecondaryTypes: details.releaseGroupSecondaryTypes || release.releaseGroupSecondaryTypes || [],
        urls: details.urls || release.urls,
        discs: details.discs || [],
        editionNotes: details.editionNotes || '',
        annotation: details.annotation || '',
        // Add available covers for the picker
        availableCovers: availableCovers.length > 1 ? availableCovers : null
      };
      
      setReviewingRelease(cdData);
    } catch (err) {
      console.error('Error in handleReviewMetadata:', err);
      if (onShowAlert) {
        onShowAlert('Failed to load release details: ' + err.message, 'danger');
      }
      // Still show form with basic data
      setReviewingRelease(release);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleFormCancel = () => {
    setShowAddForm(false);
    setEditingCd(null);
    setReviewingRelease(null);
    if (cdDetailsBeforeEdit) {
      setSelectedCdDetails(cdDetailsBeforeEdit);
      setCdDetailsBeforeEdit(null);
    }
  };

  const handleFormSave = async (createdAlbum = null) => {
    setShowAddForm(false);
    setEditingCd(null);
    setReviewingRelease(null);
    
    if (createdAlbum) {
      // Reload the album list first
      await loadCds();
      // Then fetch the complete album details (including tracks) and show the detail dialog
      try {
        const completeAlbumDetails = await musicService.getAlbumById(createdAlbum.id);
        setSelectedCdDetails(completeAlbumDetails);
      } catch (err) {
        console.error('Failed to load complete album details after creation:', err);
        // Fallback to showing the basic album data
        setSelectedCdDetails(createdAlbum);
      }
    } else {
      // For updates, reload first then show details
      await loadCds();
      if (cdDetailsBeforeEdit) {
        try {
          const updatedDetails = await musicService.getAlbumById(cdDetailsBeforeEdit.id);
          setSelectedCdDetails(updatedDetails);
          setCdDetailsBeforeEdit(null);
        } catch (err) {
          console.error('Failed to reload album details after save:', err);
          setSelectedCdDetails(cdDetailsBeforeEdit);
          setCdDetailsBeforeEdit(null);
        }
      }
    }
  };

  const handleCdClick = async (cdId) => {
    try {
      setLoadingDetails(true);
      const details = await musicService.getAlbumById(cdId);
      setSelectedCdDetails(details);
    } catch (err) {
      if (onShowAlert) {
        onShowAlert('Failed to load album details: ' + err.message, 'danger');
      }
    } finally {
      setLoadingDetails(false);
    }
  };


  const renderCdGrid = () => {
    if (loading) {
      return (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '200px' }}>
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      );
    }

    // Empty State - Check if it's a search or truly empty database
    if (filteredCds.length === 0) {
      return searchCriteria?.searchText && searchCriteria.searchText.trim() ? (
        /* Search returned no results */
        <div className="empty-state">
          <div className="empty-state-icon">🎵</div>
          <h3 className="empty-state-title">No Results Found</h3>
          <p className="empty-state-description">
            No albums match "{searchCriteria.searchText}"
          </p>
          <p className="empty-state-hint">
            Try different keywords or clear your search
          </p>
          <div className="empty-state-collection-info">
            You have <strong>{allCds.length}</strong> {allCds.length === 1 ? 'album' : 'albums'} in your collection
          </div>
        </div>
      ) : (
        /* Database is empty */
        <div className="empty-state">
          <div className="empty-state-icon">💿</div>
          <h3 className="empty-state-title">Welcome to MusicDex!</h3>
          <p className="empty-state-description">
            Your music collection is empty. Add your first album to get started and begin tracking your music library.
          </p>
         
          <button 
            className="btn btn-primary btn-lg mt-4"
            onClick={onOpenAddDialog}
          >
            <BsMusicNote className="me-2" />
            Add Your First Album
          </button>
        </div>
      );
    }

    // Ungrouped view
    if (groupBy === 'none') {
      return (
        <div className={`cd-grid ${sortLoading ? 'sort-loading' : ''}`}>
          {filteredCds.map((cd) => (
            <MusicThumbnail
              key={cd.id}
              cd={cd}
              onClick={() => handleCdClick(cd.id)}
              onEdit={() => handleEditCd(cd)}
              onDelete={() => onDeleteCd(cd.id)}
            />
          ))}
        </div>
      );
    }

    // Grouped view
    const grouped = groupCds(filteredCds, groupBy);
    const sortedGroupKeys = Object.keys(grouped).sort();

    return (
      <div className={`cds-groups ${sortLoading || groupLoading ? 'sort-loading' : ''}`}>
        {sortedGroupKeys.map((groupKey) => {
          const groupCds = grouped[groupKey];
          const isExpanded = expandedGroups.has(groupKey);
          const sortedGroupCds = sortCds(groupCds, sortBy);
          
          return (
            <div key={groupKey} className="cd-group">
              <div 
                className="group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                <div className="group-title">
                  <BsChevronDown className={`group-chevron ${isExpanded ? 'expanded' : ''}`} />
                  <span>{groupKey}</span>
                  <span className="group-count">({groupCds.length})</span>
                </div>
              </div>
              
              {isExpanded && (
                <div className="cd-grid">
                  {sortedGroupCds.map((cd) => (
                    <MusicThumbnail
                      key={cd.id}
                      cd={cd}
                      onClick={() => handleCdClick(cd.id)}
                      onEdit={() => handleEditCd(cd)}
                      onDelete={() => onDeleteCd(cd.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // MusicBrainz search is now handled via the Add Album dialog
  
  const sortOptions = [
    { value: 'title', label: 'Title A-Z' },
    { value: 'titleReverse', label: 'Title Z-A' },
    { value: 'artist', label: 'Artist A-Z' },
    { value: 'artistReverse', label: 'Artist Z-A' },
    { value: 'year', label: 'Year (Newest)' },
    { value: 'yearReverse', label: 'Year (Oldest)' },
    { value: 'lastAdded', label: 'Last Added' },
    { value: 'lastAddedReverse', label: 'First Added' }
  ];

  const groupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'artist', label: 'Group by Artist' },
    { value: 'genre', label: 'Group by Genre' },
    { value: 'label', label: 'Group by Label' },
    { value: 'decade', label: 'Group by Decade' },
    { value: 'country', label: 'Group by Country' },
    { value: 'quality', label: 'Group by Quality' }
  ];

  return (
    <div className="music-search">
      {/* Results Header with Controls */}
      <div className="cds-results">
        <div className="cds-results-header">
          <div className="cds-count-display">
            Showing {cdCount.filtered} of {cdCount.total} albums
          </div>
          
          {/* Dropdowns Container */}
          <div className="dropdowns-container">
            {/* Sort Dropdown */}
            <Dropdown className="sort-dropdown-container">
              <Dropdown.Toggle 
                as="button"
                className={`filter-pill sort-dropdown-button ${loading || sortLoading ? 'filter-pill-loading' : ''}`}
                disabled={sortLoading}
              >
                {sortLoading ? (
                  <>
                    <span className="sort-loading-spinner"></span>
                    Sorting...
                  </>
                ) : (
                  <>
                    <BsSortDown className="sort-icon" />
                    Sort: {sortOptions.find(opt => opt.value === sortBy)?.label || 'Title A-Z'}
                  </>
                )}
              </Dropdown.Toggle>
              
              <Dropdown.Menu className="sort-dropdown-menu">
                {sortOptions.map(option => (
                  <Dropdown.Item
                    key={option.value}
                    className={`sort-dropdown-item ${sortBy === option.value ? 'active' : ''}`}
                    onClick={() => handleSortChange(option.value)}
                  >
                    {option.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            {/* Group Dropdown */}
            <Dropdown className="group-dropdown-container">
              <Dropdown.Toggle 
                as="button"
                className={`filter-pill group-dropdown-button ${loading || groupLoading ? 'filter-pill-loading' : ''}`}
                disabled={groupLoading}
              >
                {groupLoading ? (
                  <>
                    <span className="group-loading-spinner"></span>
                    Grouping...
                  </>
                ) : (
                  <>
                    <BsGrid3X3Gap className="group-icon" />
                    {groupOptions.find(opt => opt.value === groupBy)?.label || 'No grouping'}
                  </>
                )}
              </Dropdown.Toggle>
              
              <Dropdown.Menu className="group-dropdown-menu">
                {groupOptions.map(option => (
                  <Dropdown.Item
                    key={option.value}
                    className={`group-dropdown-item ${groupBy === option.value ? 'active' : ''}`}
                    onClick={() => handleGroupChange(option.value)}
                  >
                    {option.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            {/* Collapse All Button - Only show when grouping is enabled */}
            {groupBy !== 'none' && (
              <button 
                className="collapse-all-btn"
                onClick={toggleAllGroups}
              >
                {expandAllGroups ? 'Collapse All' : 'Expand All'}
              </button>
            )}
          </div>
        </div>

        {/* Album Grid or Grouped Albums */}
        {renderCdGrid()}
      </div>

      {/* Forms and Modals */}
      <AddMusicDialog
        show={showAddDialog}
        onHide={() => setShowAddDialog(false)}
        onAddCd={onAddCd}
        onAddCdFromMusicBrainz={onAddCdFromMusicBrainz}
        onAddCdByBarcode={onAddCdByBarcode}
        onReviewMetadata={handleReviewMetadata}
      />

      {showAddForm && (
        <MusicForm
          onSave={async (cdData) => {
            const createdAlbum = await onAddCd(cdData);
            await handleFormSave(createdAlbum);
            return createdAlbum;
          }}
          onCancel={handleFormCancel}
        />
      )}

      {reviewingRelease && (
        <MusicForm
          cd={reviewingRelease}
          onSave={async (cdData) => {
            let createdAlbum;
            // If this came from MusicBrainz search, use the proper method to download covers
            if (cdData.musicbrainzReleaseId) {
              createdAlbum = await onAddCdFromMusicBrainz(cdData.musicbrainzReleaseId, cdData);
            } else {
              createdAlbum = await onAddCd(cdData);
            }
            await handleFormSave(createdAlbum);
          }}
          onCancel={handleFormCancel}
        />
      )}

      {editingCd && (
        <MusicForm
          cd={editingCd}
          onSave={(cdData) => {
            onUpdateCd(editingCd.id, cdData);
            handleFormSave();
          }}
          onCancel={handleFormCancel}
        />
      )}

      {selectedCdDetails && (
        <MusicDetailCard
          cd={selectedCdDetails}
          onClose={() => setSelectedCdDetails(null)}
          onEdit={() => handleEditCd(selectedCdDetails)}
          onDelete={() => {
            onDeleteCd(selectedCdDetails.id);
            setSelectedCdDetails(null);
          }}
          onSearch={updateSearchViaUrl}
        />
      )}
    </div>
  );
});

export default MusicSearch;
