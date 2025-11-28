// src/pages/AnalyticsPage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import { 
  BsFilm, BsClock, BsCurrencyDollar, BsGraphUp, BsMusicNoteBeamed, 
  BsVinyl, BsPeople, BsBook, BsBarChartFill, BsCalendarEvent,
  BsEye, BsEyeSlash, BsPlayCircle, BsStar, BsDisc, BsCollection,
  BsListOl, BsLayers, BsTrophy, BsPercent, BsGlobe
} from 'react-icons/bs';
import './AnalyticsPage.css';

// ============= VIBRANT PALETTE =============
const PALETTE = {
  gold: ['#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e'],
  amber: ['#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309'],
  crimson: ['#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
  rose: ['#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239'],
  spectrum: ['#fbbf24', '#f59e0b', '#fb923c', '#f97316', '#ef4444', '#dc2626', '#f43f5e', '#e11d48', '#d97706', '#b45309'],
  warm: ['#fbbf24', '#fb923c', '#f87171', '#f59e0b', '#f97316', '#ef4444', '#d97706', '#dc2626'],
  teal: ['#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'],
  emerald: ['#6ee7b7', '#34d399', '#10b981', '#059669', '#047857'],
};

// ============= CHART COMPONENTS =============

// Timeline chart with visible axis
const TimelineChart = ({ data, valueKey, label, color = 'var(--accent-gold)', height = 120, valuePrefix = '' }) => {
  const [hovered, setHovered] = useState(null);
  
  if (!data || data.length === 0) return <div className="chart-empty">No data available</div>;
  
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const formatPeriod = (period) => {
    if (!period) return '';
    const [year, month] = period.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month) - 1] || ''} ${year?.slice(2) || ''}`;
  };
  
  const formatValue = (val) => {
    if (valuePrefix === 'CHF ') return `CHF ${val.toFixed(1)}`;
    if (typeof val === 'number' && !Number.isInteger(val)) return val.toFixed(1);
    return val;
  };
  
  // Show every nth label to avoid crowding
  const labelInterval = Math.max(1, Math.floor(data.length / 6));
  
  return (
    <div className="timeline-chart" style={{ '--chart-height': `${height}px` }}>
      <div className="timeline-bars">
        {data.map((item, i) => (
          <div 
            key={i} 
            className="timeline-bar-wrap"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div 
              className={`timeline-bar ${hovered === i ? 'hovered' : ''}`}
              style={{ 
                height: `${((item[valueKey] || 0) / max) * 100}%`,
                backgroundColor: color,
              }}
            />
            {hovered === i && (
              <div className="chart-tooltip">
                <strong>{formatPeriod(item.period)}</strong>
                <span>{formatValue(item[valueKey] || 0)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="timeline-axis">
        {data.map((item, i) => (
          <span 
            key={i} 
            className={`timeline-label ${i % labelInterval === 0 ? 'visible' : ''}`}
          >
            {formatPeriod(item.period)}
          </span>
        ))}
      </div>
    </div>
  );
};

// Horizontal bars with full width usage
const HorizontalBars = ({ data, nameKey, valueKey, colors, max, onClick, limit = 8, showAll = false, valueFormat }) => {
  const [hovered, setHovered] = useState(null);
  
  if (!data || data.length === 0) return <div className="chart-empty">No data</div>;
  
  const displayData = showAll ? data : data.slice(0, limit);
  const maxVal = max || Math.max(...displayData.map(d => d[valueKey] || 0), 1);
  
  const formatValue = (val) => {
    if (valueFormat) return valueFormat(val);
    return val;
  };
  
  const isTruncated = (name) => String(name).length > 16;
  
  return (
    <div className="h-bars">
      {displayData.map((item, i) => (
        <div 
          key={i} 
          className={`h-bar-row ${onClick ? 'clickable' : ''} ${hovered === i ? 'hovered' : ''}`}
          onClick={() => onClick?.(item)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          <span className="h-bar-label">
            {isTruncated(item[nameKey]) 
              ? String(item[nameKey]).slice(0, 16) + '…' 
              : item[nameKey]}
          </span>
          <div className="h-bar-track">
            <div 
              className="h-bar-fill" 
              style={{ 
                width: `${((item[valueKey] || 0) / maxVal) * 100}%`,
                background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[(i + 1) % colors.length]})`
              }} 
            />
          </div>
          <span className="h-bar-value">{formatValue(item[valueKey])}</span>
          {hovered === i && isTruncated(item[nameKey]) && (
            <div className="chart-tooltip bar-tooltip">
              <strong>{item[nameKey]}</strong>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Histogram for percentiles (Datadog style)
const PercentileHistogram = ({ data, percentiles }) => {
  const [hoveredBar, setHoveredBar] = useState(null);
  
  if (!data || data.length === 0) return <div className="chart-empty">No price data</div>;
  
  // Group into buckets for histogram
  const buckets = [];
  const prices = data.map(d => d.rangeStart || 0).filter(p => p > 0);
  
  // Create meaningful buckets
  const maxPrice = Math.max(...prices, 1);
  const bucketSize = Math.ceil(maxPrice / 15);
  
  for (let i = 0; i <= maxPrice; i += bucketSize) {
    const bucketCount = data
      .filter(d => d.rangeStart >= i && d.rangeStart < i + bucketSize)
      .reduce((sum, d) => sum + (d.count || 0), 0);
    buckets.push({ start: i, end: i + bucketSize, count: bucketCount });
  }
  
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  
  // Calculate percentile positions
  const getPercentilePosition = (pValue) => {
    if (!pValue || maxPrice === 0) return 0;
    return (pValue / maxPrice) * 100;
  };
  
  return (
    <div className="percentile-histogram">
      <div className="histogram-bars">
        {buckets.map((bucket, i) => (
          <div 
            key={i} 
            className={`histogram-bar ${hoveredBar === i ? 'hovered' : ''}`}
            style={{ height: `${(bucket.count / maxCount) * 100}%` }}
            onMouseEnter={() => setHoveredBar(i)}
            onMouseLeave={() => setHoveredBar(null)}
          >
            {hoveredBar === i && bucket.count > 0 && (
              <div className="chart-tooltip histogram-tip">
                <strong>CHF {bucket.start}–{bucket.end}</strong>
                <span>{bucket.count} movies</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="percentile-lines">
        {percentiles?.p50 > 0 && (
          <div 
            className="percentile-line" 
            style={{ left: `${getPercentilePosition(percentiles.p50)}%` }}
          >
            <span className="percentile-marker">p50</span>
            <span className="percentile-value">CHF {percentiles.p50.toFixed(0)}</span>
          </div>
        )}
        {percentiles?.p90 > 0 && (
          <div 
            className="percentile-line" 
            style={{ left: `${getPercentilePosition(percentiles.p90)}%` }}
          >
            <span className="percentile-marker">p90</span>
            <span className="percentile-value">CHF {percentiles.p90.toFixed(0)}</span>
          </div>
        )}
        {percentiles?.p99 > 0 && (
          <div 
            className="percentile-line" 
            style={{ left: `${getPercentilePosition(percentiles.p99)}%` }}
          >
            <span className="percentile-marker">p99</span>
            <span className="percentile-value">CHF {percentiles.p99.toFixed(0)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============= STAT CARD =============
const StatCard = ({ icon: Icon, value, label, accent = 'gold' }) => (
  <div className={`stat-card stat-${accent}`}>
    <div className="stat-icon"><Icon /></div>
    <div className="stat-info">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

// ============= RANKED LIST =============
const RankedList = ({ items, nameKey, valueKey, valueFormat, subKey, onClick, limit = 8, colors, icon: Icon }) => {
  const [hovered, setHovered] = useState(null);
  
  if (!items || items.length === 0) return <div className="chart-empty">No data</div>;
  
  return (
    <div className="ranked-list">
      {items.slice(0, limit).map((item, i) => (
        <div 
          key={i} 
          className={`ranked-item ${onClick ? 'clickable' : ''} ${hovered === i ? 'hovered' : ''}`}
          onClick={() => onClick?.(item)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          <span 
            className="rank-badge" 
            style={{ background: `linear-gradient(135deg, ${colors?.[i % colors.length] || 'var(--accent-gold)'}, ${colors?.[(i + 1) % colors.length] || 'var(--accent-gold-dim)'})` }}
          >
            {Icon ? <Icon /> : i + 1}
          </span>
          <div className="rank-info">
            <span className="rank-name">
              {String(item[nameKey]).length > 24 
                ? String(item[nameKey]).slice(0, 24) + '…' 
                : item[nameKey]}
            </span>
            {subKey && item[subKey] && (
              <span className="rank-sub">{item[subKey]}</span>
            )}
          </div>
          <span className="rank-value">
            {valueFormat ? valueFormat(item[valueKey]) : item[valueKey]}
          </span>
          {hovered === i && String(item[nameKey]).length > 24 && (
            <div className="chart-tooltip list-tooltip">
              <strong>{item[nameKey]}</strong>
              <span>{valueFormat ? valueFormat(item[valueKey]) : item[valueKey]}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ============= SECTION CARD =============
const Card = ({ title, icon: Icon, children, className = '' }) => (
  <div className={`analytics-card ${className}`}>
    {title && (
      <h3 className="card-title">
        {Icon && <Icon className="card-title-icon" />}
        {title}
      </h3>
    )}
    {children}
  </div>
);

// ============= FORMATTERS =============
const fmt = {
  currency: (v) => `CHF ${Number(v || 0).toFixed(0)}`,
  duration: (mins) => {
    const m = Number(mins || 0);
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h`;
  },
  time: (mins) => {
    const m = Number(mins || 0);
    const h = Math.floor(m / 60);
    const min = Math.floor(m % 60);
    return h > 0 ? `${h}h ${min}m` : `${min}m`;
  },
  number: (n) => Number(n || 0).toLocaleString(),
  percent: (n) => `${Number(n || 0).toFixed(0)}%`,
  rating: (n) => Number(n || 0).toFixed(1),
};

// ============= MAIN COMPONENT =============
const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('film');
  const [filmData, setFilmData] = useState(null);
  const [musicData, setMusicData] = useState(null);
  const [bookData, setBookData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Navigation helpers
  const goFilm = useCallback((q) => navigate(`/filmdex?search=${encodeURIComponent(q)}`), [navigate]);
  const goMusic = useCallback((q) => navigate(`/musicdex?search=${encodeURIComponent(q)}`), [navigate]);
  const goBook = useCallback((q) => navigate(`/bookdex?search=${encodeURIComponent(q)}`), [navigate]);

  // Fetch data
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [film, music, book] = await Promise.all([
          apiService.getAnalytics(),
          apiService.getMusicAnalytics(),
          apiService.getBookAnalytics(),
        ]);
        if (film?.success) setFilmData(film.data);
        if (music?.success) setMusicData(music.data);
        if (book?.success) setBookData(book.data);
        if (!film?.success) setError('Failed to load analytics');
      } catch (e) {
        console.error('Analytics error:', e);
        setError('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Memoized safe data accessors
  const film = useMemo(() => filmData || {}, [filmData]);
  const music = useMemo(() => musicData || {}, [musicData]);
  const book = useMemo(() => bookData || {}, [bookData]);

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="loading-state">
          <div className="loader" />
          <p>Loading analytics…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page">
        <div className="error-state">{error}</div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      {/* Tab Navigation */}
      <nav className="tab-nav">
        <button className={tab === 'film' ? 'active' : ''} onClick={() => setTab('film')}>
          <BsFilm /> FilmDex
        </button>
        <button className={tab === 'music' ? 'active' : ''} onClick={() => setTab('music')}>
          <BsMusicNoteBeamed /> MusicDex
        </button>
        <button className={tab === 'book' ? 'active' : ''} onClick={() => setTab('book')}>
          <BsBook /> BookDex
        </button>
      </nav>

      {/* ============= FILMDEX TAB ============= */}
      {tab === 'film' && (
        <div className="tab-panel">
          {/* Key Stats */}
          <div className="stats-row">
            <StatCard icon={BsFilm} value={film.totalMovies || 0} label="Movies" accent="gold" />
            <StatCard icon={BsClock} value={fmt.duration(film.totalRuntime)} label="Runtime" accent="rose" />
            <StatCard icon={BsCurrencyDollar} value={fmt.currency(film.totalSpent)} label="Invested" accent="amber" />
            <StatCard icon={BsBarChartFill} value={fmt.currency(film.averagePrice)} label="Avg Price" accent="warm" />
            {film.watchingStats && (
              <StatCard icon={BsEye} value={`${film.watchingStats.watchedPercent}%`} label={`Watched (${film.watchingStats.watched})`} accent="teal" />
            )}
          </div>

          {/* Featured Lists - Right after KPIs */}
          <div className="featured-lists">
            {(film.mostWatchedMovies || []).length > 0 && (
              <Card title="Most Watched" icon={BsPlayCircle} className="featured-card accent-teal">
                <RankedList
                  items={film.mostWatchedMovies}
                  nameKey="title"
                  valueKey="watchCount"
                  subKey="genre"
                  valueFormat={(v) => `${v}×`}
                  onClick={(d) => goFilm(`title:"${d.title}"`)}
                  colors={PALETTE.teal}
                  limit={6}
                />
              </Card>
            )}
            {(film.lastWatchedMovies || []).length > 0 && (
              <Card title="Recently Watched" icon={BsEye} className="featured-card accent-amber">
                <RankedList
                  items={film.lastWatchedMovies}
                  nameKey="title"
                  valueKey="lastWatched"
                  subKey="genre"
                  valueFormat={(v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  onClick={(d) => goFilm(`title:"${d.title}"`)}
                  colors={PALETTE.amber}
                  limit={6}
                />
              </Card>
            )}
            {(film.topRatedUnwatched || []).length > 0 && (
              <Card title="Top Rated Unwatched" icon={BsStar} className="featured-card accent-emerald">
                <RankedList
                  items={film.topRatedUnwatched}
                  nameKey="title"
                  valueKey="rating"
                  subKey="genre"
                  valueFormat={(v) => fmt.rating(v)}
                  onClick={(d) => goFilm(`title:"${d.title}"`)}
                  colors={PALETTE.emerald}
                  limit={6}
                />
              </Card>
            )}
            {(film.recentlyAddedMovies || []).length > 0 && (
              <Card title="Recently Added" icon={BsCollection} className="featured-card accent-rose">
                <RankedList
                  items={film.recentlyAddedMovies}
                  nameKey="title"
                  valueKey="acquiredDate"
                  subKey="format"
                  valueFormat={(v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  onClick={(d) => goFilm(`title:"${d.title}"`)}
                  colors={PALETTE.rose}
                  limit={6}
                />
              </Card>
            )}
          </div>

          {/* Main Grid */}
          <div className="analytics-grid">
            {/* Left Column */}
            <div className="grid-main">
              {/* Timeline Charts */}
              <Card title="Collection Value Over Time" icon={BsGraphUp}>
                <TimelineChart 
                  data={film.priceOverTime || []} 
                  valueKey="totalValue" 
                  color="var(--accent-gold)"
                  height={140}
                />
              </Card>

              <Card title="Acquisitions Over Time" icon={BsCalendarEvent}>
                <TimelineChart 
                  data={film.moviesAcquiredOverTime || []} 
                  valueKey="count" 
                  color="var(--accent-rose)"
                  height={120}
                />
              </Card>

              {/* Price Histogram */}
              <Card title="Price Distribution" icon={BsPercent}>
                <PercentileHistogram 
                  data={film.priceDistribution || []} 
                  percentiles={film.pricePercentiles}
                />
              </Card>

              {/* Genre & Format Row */}
              <div className="card-row">
                <Card title="Top Genres" icon={BsCollection} className="card-half">
                  <HorizontalBars
                    data={film.genreDistribution || []}
                    nameKey="genre"
                    valueKey="count"
                    colors={PALETTE.spectrum}
                    onClick={(d) => goFilm(`genre:"${d.genre}"`)}
                  />
                </Card>
                <Card title="Format" icon={BsDisc} className="card-half">
                  <HorizontalBars
                    data={film.formatDistribution || []}
                    nameKey="format"
                    valueKey="count"
                    colors={PALETTE.amber}
                    onClick={(d) => goFilm(`format:"${d.format}"`)}
                    showAll={true}
                  />
                </Card>
              </div>

              {/* Decades & Origins */}
              <div className="card-row">
                <Card title="By Decade" icon={BsCalendarEvent} className="card-half">
                  <HorizontalBars
                    data={film.moviesByDecade || []}
                    nameKey="decade"
                    valueKey="count"
                    colors={PALETTE.warm}
                    onClick={(d) => {
                      const start = parseInt(d.decade);
                      goFilm(`year:>=${start} year:<=${start + 9}`);
                    }}
                    showAll={true}
                  />
                </Card>
                <Card title="Origins" icon={BsPeople} className="card-half">
                  <HorizontalBars
                    data={film.originDistribution || []}
                    nameKey="origin"
                    valueKey="count"
                    colors={PALETTE.spectrum}
                    onClick={(d) => {
                      const langMap = {
                        English: 'en', Spanish: 'es', French: 'fr', German: 'de', Italian: 'it',
                        Japanese: 'ja', Korean: 'ko', Chinese: 'zh', Portuguese: 'pt', Russian: 'ru',
                        Arabic: 'ar', Hindi: 'hi', Dutch: 'nl', Swedish: 'sv', Norwegian: 'no',
                        Danish: 'da', Finnish: 'fi', Polish: 'pl', Czech: 'cs', Hungarian: 'hu',
                        Turkish: 'tr', Thai: 'th', Vietnamese: 'vi'
                      };
                      const code = langMap[d.origin] || String(d.origin).toLowerCase();
                      goFilm(`original_language:"${code}"`);
                    }}
                    limit={8}
                  />
                </Card>
              </div>

              {/* Runtime & Age */}
              <div className="card-row">
                <Card title="Runtime" icon={BsClock} className="card-half">
                  <HorizontalBars
                    data={film.runtimeDistribution || []}
                    nameKey="runtime"
                    valueKey="count"
                    colors={PALETTE.gold}
                    onClick={(d) => {
                      const runtime = String(d.runtime);
                      if (runtime === 'Under 90 min') goFilm('runtime:<90');
                      else if (runtime === '90-120 min') goFilm('runtime:>=90 runtime:<=120');
                      else if (runtime === '120-150 min') goFilm('runtime:>=120 runtime:<=150');
                      else if (runtime === '150-180 min') goFilm('runtime:>=150 runtime:<=180');
                      else if (runtime === 'Over 180 min') goFilm('runtime:>180');
                    }}
                    showAll={true}
                  />
                </Card>
                <Card title="Age Rating" icon={BsEyeSlash} className="card-half">
                  <HorizontalBars
                    data={film.ageDistribution || []}
                    nameKey="ageRecommendation"
                    valueKey="count"
                    colors={PALETTE.crimson}
                    onClick={(d) => {
                      const age = d.ageRecommendation;
                      if (age === 'All Ages') goFilm('recommended_age:<=6');
                      else {
                        const ageNum = parseInt(String(age).replace('+', ''), 10);
                        goFilm(`recommended_age:${ageNum}`);
                      }
                    }}
                    showAll={true}
                  />
                </Card>
              </div>

              {/* Commercial Success */}
              {film.commercialSuccess && (
                <Card title="Commercial Success" icon={BsTrophy}>
                  <div className="commercial-stats">
                    <div className="commercial-stat">
                      <span className="cs-value gold">{film.commercialSuccess.overallROI}%</span>
                      <span className="cs-label">Overall ROI</span>
                    </div>
                    <div className="commercial-stat">
                      <span className="cs-value rose">{film.commercialSuccess.profitabilityRate}%</span>
                      <span className="cs-label">Profitable</span>
                    </div>
                    <div className="commercial-stat">
                      <span className="cs-value amber">{film.commercialSuccess.profitableMovies}/{film.commercialSuccess.totalMoviesWithData}</span>
                      <span className="cs-label">Success Rate</span>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Right Column - Lists */}
            <div className="grid-side">
              <Card title="Top Directors" icon={BsListOl}>
                <RankedList
                  items={film.topDirectors || []}
                  nameKey="director"
                  valueKey="count"
                  onClick={(d) => goFilm(`director:"${d.director}"`)}
                  colors={PALETTE.gold}
                />
              </Card>

              <Card title="Top Actors" icon={BsPeople}>
                <RankedList
                  items={film.topActors || []}
                  nameKey="actor"
                  valueKey="count"
                  onClick={(d) => goFilm(`actor:"${d.actor}"`)}
                  colors={PALETTE.rose}
                />
              </Card>

              {(film.topROIMovies || []).length > 0 && (
                <Card title="Highest ROI" icon={BsGraphUp}>
                  <RankedList
                    items={film.topROIMovies}
                    nameKey="title"
                    valueKey="roi"
                    valueFormat={(v) => `${v}%`}
                    onClick={(d) => goFilm(`title:"${d.title}"`)}
                    colors={PALETTE.gold}
                    limit={6}
                  />
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============= MUSICDEX TAB ============= */}
      {tab === 'music' && (
        <div className="tab-panel">
          {/* Key Stats */}
          <div className="stats-row">
            <StatCard icon={BsVinyl} value={music.totalAlbums || 0} label="Albums" accent="gold" />
            <StatCard icon={BsMusicNoteBeamed} value={music.totalTracks || 0} label="Tracks" accent="rose" />
            <StatCard icon={BsClock} value={fmt.duration(music.totalDuration)} label="Duration" accent="amber" />
            <StatCard icon={BsPeople} value={music.diversityMetrics?.artistDiversity || 0} label="Artists" accent="warm" />
          </div>

          {/* Track Overlap - Stats */}
          {music.overlapStats && music.overlapStats.totalSharedTracks > 0 && (
            <Card title="Track Overlap Analysis" icon={BsLayers} className="overlap-card">
              <div className="overlap-grid">
                <div className="overlap-stat-box">
                  <span className="osb-value">{music.overlapStats.totalSharedTracks}</span>
                  <span className="osb-label">Shared Tracks</span>
                </div>
                <div className="overlap-stat-box">
                  <span className="osb-value">{music.overlapPercentage}%</span>
                  <span className="osb-label">Albums with Overlap</span>
                </div>
                <div className="overlap-stat-box">
                  <span className="osb-value">{music.overlapStats.albumsWithOverlap}</span>
                  <span className="osb-label">Albums Affected</span>
                </div>
                {music.overlapStats.mostOverlappedTrack && (
                  <div 
                    className="overlap-stat-box highlight clickable"
                    onClick={() => goMusic(`track:"${music.overlapStats.mostOverlappedTrack.title}"`)}
                    title={`Click to find "${music.overlapStats.mostOverlappedTrack.title}"`}
                  >
                    <span className="osb-value osb-track">{music.overlapStats.mostOverlappedTrack.title}</span>
                    <span className="osb-label">Most Overlapped ({music.overlapStats.mostOverlappedTrack.albumCount} albums)</span>
                    <span className="osb-action">Find track →</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Main Grid */}
          <div className="analytics-grid">
            <div className="grid-main">
              <Card title="Top Genres" icon={BsCollection}>
                <HorizontalBars
                  data={music.genreDistribution || []}
                  nameKey="genre"
                  valueKey="count"
                  colors={PALETTE.spectrum}
                  onClick={(d) => goMusic(`genre:"${d.genre}"`)}
                />
              </Card>

              <div className="card-row">
                <Card title="By Decade" icon={BsCalendarEvent} className="card-half">
                  <HorizontalBars
                    data={music.decadeDistribution || []}
                    nameKey="decade"
                    valueKey="count"
                    colors={PALETTE.warm}
                    onClick={(d) => {
                      const start = parseInt(d.decade);
                      goMusic(`year:>=${start} year:<=${start + 9}`);
                    }}
                    showAll={true}
                  />
                </Card>
                <Card title="Duration Ranges" icon={BsClock} className="card-half">
                  <HorizontalBars
                    data={music.durationDistribution || []}
                    nameKey="range"
                    valueKey="count"
                    colors={PALETTE.gold}
                    onClick={(d) => {
                      const range = d.range;
                      if (range === 'Under 30 min') goMusic('duration:<30');
                      else if (range === '30-45 min') goMusic('duration:>=30 duration:<45');
                      else if (range === '45-60 min') goMusic('duration:>=45 duration:<60');
                      else if (range === '60-75 min') goMusic('duration:>=60 duration:<75');
                      else if (range === '75-90 min') goMusic('duration:>=75 duration:<90');
                      else if (range === 'Over 90 min') goMusic('duration:>=90');
                    }}
                    showAll={true}
                  />
                </Card>
              </div>

              <div className="card-row">
                <Card title="Record Labels" icon={BsDisc} className="card-half">
                  <HorizontalBars
                    data={music.labelDistribution || []}
                    nameKey="label"
                    valueKey="count"
                    colors={PALETTE.spectrum}
                    onClick={(d) => goMusic(`label:"${d.label}"`)}
                    limit={6}
                  />
                </Card>
                <Card title="Release Countries" icon={BsGlobe} className="card-half">
                  <HorizontalBars
                    data={music.countryDistribution || []}
                    nameKey="country"
                    valueKey="count"
                    colors={PALETTE.gold}
                    onClick={(d) => goMusic(`country:"${d.code || d.country}"`)}
                    showAll={true}
                  />
                </Card>
              </div>
            </div>

            <div className="grid-side">
              {music.diversityMetrics && (
                <Card title="Collection Diversity" icon={BsBarChartFill}>
                  <div className="diversity-grid">
                    <div className="div-item">
                      <span className="div-val">{music.diversityMetrics.artistDiversity}</span>
                      <span className="div-lbl">Artists</span>
                    </div>
                    <div className="div-item">
                      <span className="div-val">{music.diversityMetrics.genreDiversity}</span>
                      <span className="div-lbl">Genres</span>
                    </div>
                    <div className="div-item">
                      <span className="div-val">{music.diversityMetrics.labelDiversity}</span>
                      <span className="div-lbl">Labels</span>
                    </div>
                    <div className="div-item">
                      <span className="div-val">{music.diversityMetrics.countryDiversity}</span>
                      <span className="div-lbl">Countries</span>
                    </div>
                  </div>
                </Card>
              )}

              <Card title="Top Artists" icon={BsPeople}>
                <RankedList
                  items={music.artistDistribution || []}
                  nameKey="artist"
                  valueKey="count"
                  onClick={(d) => goMusic(`artist:"${d.artist}"`)}
                  colors={PALETTE.gold}
                />
              </Card>

              <Card title="Longest Albums" icon={BsClock}>
                <RankedList
                  items={music.longestAlbums || []}
                  nameKey="title"
                  valueKey="duration"
                  valueFormat={(v) => fmt.time(v)}
                  onClick={(d) => goMusic(`title:"${d.title}"`)}
                  colors={PALETTE.rose}
                  limit={6}
                />
              </Card>

              {(music.trackOverlap || []).length > 0 && (
                <Card title="Shared Tracks" icon={BsLayers}>
                  <RankedList
                    items={music.trackOverlap}
                    nameKey="title"
                    valueKey="albumCount"
                    valueFormat={(v) => `${v} albums`}
                    onClick={(d) => goMusic(`track:"${d.title}"`)}
                    colors={PALETTE.warm}
                    limit={6}
                  />
                </Card>
              )}

              {(music.topGenreCrossovers || []).length > 0 && (
                <Card title="Genre Crossovers" icon={BsCollection}>
                  <RankedList
                    items={music.topGenreCrossovers}
                    nameKey="crossover"
                    valueKey="count"
                    colors={PALETTE.spectrum}
                    limit={6}
                  />
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============= BOOKDEX TAB ============= */}
      {tab === 'book' && (
        <div className="tab-panel">
          {/* Key Stats */}
          <div className="stats-row">
            <StatCard icon={BsBook} value={book.totalBooks || 0} label="Books" accent="gold" />
            <StatCard icon={BsLayers} value={fmt.number(book.totalPages)} label="Pages" accent="rose" />
            <StatCard icon={BsEye} value={`${book.readBooks || 0} (${book.readPercentage || 0}%)`} label="Read" accent="teal" />
            <StatCard icon={BsPeople} value={book.diversityMetrics?.authorDiversity || 0} label="Authors" accent="amber" />
          </div>

          {/* Main Grid */}
          <div className="analytics-grid">
            <div className="grid-main">
              <Card title="Top Genres" icon={BsCollection}>
                <HorizontalBars
                  data={book.genreDistribution || []}
                  nameKey="genre"
                  valueKey="count"
                  colors={PALETTE.spectrum}
                  onClick={(d) => goBook(`genre:"${d.genre}"`)}
                />
              </Card>

              {(book.booksReadOverTime || []).length > 0 && (
                <Card title="Reading Progress" icon={BsGraphUp}>
                  <TimelineChart 
                    data={book.booksReadOverTime} 
                    valueKey="count" 
                    color="var(--accent-teal)"
                    height={120}
                  />
                </Card>
              )}

              <Card title="By Decade" icon={BsCalendarEvent}>
                <HorizontalBars
                  data={book.decadeDistribution || []}
                  nameKey="decade"
                  valueKey="count"
                  colors={PALETTE.warm}
                  onClick={(d) => {
                    const start = parseInt(d.decade);
                    goBook(`year:>=${start} year:<=${start + 9}`);
                  }}
                  showAll={true}
                />
              </Card>

              <div className="card-row">
                <Card title="Publishers" icon={BsDisc} className="card-half">
                  <HorizontalBars
                    data={book.publisherDistribution || []}
                    nameKey="publisher"
                    valueKey="count"
                    colors={PALETTE.spectrum}
                    onClick={(d) => goBook(`publisher:"${d.publisher}"`)}
                    limit={6}
                  />
                </Card>
                <Card title="Languages" icon={BsPeople} className="card-half">
                  <HorizontalBars
                    data={book.languageDistribution || []}
                    nameKey="language"
                    valueKey="count"
                    colors={PALETTE.gold}
                    onClick={(d) => goBook(`language:"${d.language}"`)}
                    showAll={true}
                  />
                </Card>
              </div>

              <div className="card-row">
                <Card title="Ratings" icon={BsStar} className="card-half">
                  <HorizontalBars
                    data={book.ratingDistribution || []}
                    nameKey="rating"
                    valueKey="count"
                    colors={PALETTE.crimson}
                    onClick={(d) => {
                      const [min, max] = String(d.rating).split('-').map(Number);
                      goBook(`rating:>=${min} rating:<=${max}`);
                    }}
                    showAll={true}
                  />
                </Card>
                <Card title="Page Count" icon={BsLayers} className="card-half">
                  <HorizontalBars
                    data={book.pageCountDistribution || []}
                    nameKey="range"
                    valueKey="count"
                    colors={PALETTE.rose}
                    onClick={(d) => {
                      const range = d.range;
                      if (range === 'Under 200') goBook('page_count:<200');
                      else if (range === '200-300') goBook('page_count:>=200 page_count:<300');
                      else if (range === '300-400') goBook('page_count:>=300 page_count:<400');
                      else if (range === '400-500') goBook('page_count:>=400 page_count:<500');
                      else if (range === '500-600') goBook('page_count:>=500 page_count:<600');
                      else if (range === 'Over 600') goBook('page_count:>=600');
                    }}
                    showAll={true}
                  />
                </Card>
              </div>
            </div>

            <div className="grid-side">
              {book.diversityMetrics && (
                <Card title="Collection Diversity" icon={BsBarChartFill}>
                  <div className="diversity-grid">
                    <div className="div-item">
                      <span className="div-val">{book.diversityMetrics.authorDiversity}</span>
                      <span className="div-lbl">Authors</span>
                    </div>
                    <div className="div-item">
                      <span className="div-val">{book.diversityMetrics.genreDiversity}</span>
                      <span className="div-lbl">Genres</span>
                    </div>
                    <div className="div-item">
                      <span className="div-val">{book.diversityMetrics.publisherDiversity}</span>
                      <span className="div-lbl">Publishers</span>
                    </div>
                    <div className="div-item">
                      <span className="div-val">{book.diversityMetrics.seriesDiversity}</span>
                      <span className="div-lbl">Series</span>
                    </div>
                  </div>
                </Card>
              )}

              <Card title="Top Authors" icon={BsPeople}>
                <RankedList
                  items={book.authorDistribution || []}
                  nameKey="author"
                  valueKey="count"
                  onClick={(d) => goBook(`author:"${d.author}"`)}
                  colors={PALETTE.gold}
                />
              </Card>

              <Card title="Longest Books" icon={BsLayers}>
                <RankedList
                  items={book.longestBooks || []}
                  nameKey="title"
                  valueKey="pages"
                  valueFormat={(v) => `${v}p`}
                  onClick={(d) => goBook(`title:"${d.title}"`)}
                  colors={PALETTE.rose}
                  limit={6}
                />
              </Card>

              {(book.seriesDistribution || []).length > 0 && (
                <Card title="Top Series" icon={BsCollection}>
                  <RankedList
                    items={book.seriesDistribution}
                    nameKey="series"
                    valueKey="count"
                    onClick={(d) => goBook(`series:"${d.series}"`)}
                    colors={PALETTE.warm}
                    limit={6}
                  />
                </Card>
              )}

              {(book.topGenreCrossovers || []).length > 0 && (
                <Card title="Genre Crossovers" icon={BsLayers}>
                  <RankedList
                    items={book.topGenreCrossovers}
                    nameKey="crossover"
                    valueKey="count"
                    colors={PALETTE.spectrum}
                    limit={6}
                  />
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
