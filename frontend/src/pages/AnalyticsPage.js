// src/pages/AnalyticsPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tab, Tabs } from 'react-bootstrap';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import apiService from '../services/api';
import { BsFilm, BsClock, BsCurrencyDollar, BsCalendar, BsMusicNote, BsVinyl, BsPeople, BsGraphUp } from 'react-icons/bs';
import './AnalyticsPage.css';

// ===============================
// COLORS
// ===============================
const COLORS = {
  format: ['#FFD700', '#DC143C', '#8B0000', '#FF8C00', '#B87333'],
  genre: ['#FFD700', '#FFCC00', '#FFB700', '#FFA500', '#FF8C00', '#FF7B00', '#FF6347', '#F94449', '#DC143C', '#C41E3A', '#8B0000', '#7B1113'],
  decade: ['#8B4513', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700', '#FFD700'],
  rating: ['#DC143C', '#FF4500', '#FF8C00', '#FFD700', '#9ACD32', '#32CD32', '#228B22'],
  age: ['#32CD32', '#9ACD32', '#FFD700', '#FFA500', '#FF8C00', '#FF6347', '#DC143C', '#8B0000'],
  mediaType: { movie: '#FFD700', tvShow: '#DC143C' },
  commercial: { profitable: '#32CD32', unprofitable: '#DC143C', highROI: '#FFD700', lowROI: '#FF8C00' },
  areaGold: '#FFD700',
  areaCrimson: '#DC143C',
  barCopper: '#B87333',
  barBurgundy: '#8B0000',
  music: ['#FFD700', '#FF8C00', '#DC143C', '#B87333', '#8B0000', '#FF6347', '#C41E3A', '#7B1113', '#FFB700', '#FFA500', '#FF7B00', '#FF4500'],
  musicCharts: {
    // Sophisticated palettes organized by analytics type
    distribution: {
      // Time-based analytics - warm, chronological feel
      decades: ['#B87333', '#CD853F', '#D2691E', '#FF8C00'],
      quality: ['#8B4513', '#A0522D', '#B87333', '#CD853F'],
      
      // Content analytics - rich, content-focused colors
      genres: ['#8B0000', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700', '#FFD700', '#F0E68C'],
      artists: ['#8B0000', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700', '#FFD700', '#F0E68C'],
      labels: ['#8B0000', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700']
    },
    
    lists: {
      // Performance metrics - sophisticated, achievement-focused
      longestAlbums: ['#8B4513', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700'],
      
      // Relationship analytics - subtle, connection-focused
      collaborations: ['#8B0000', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700'],
      crossovers: ['#8B0000', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700'],
      sharedTracks: ['#8B4513', '#A0522D', '#B87333', '#CD853F', '#D2691E', '#FF8C00', '#FFA500', '#FFB700']
    }
  },
};

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [musicAnalytics, setMusicAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('filmdex');
  const [tabLoading, setTabLoading] = useState(false);

  // -------- Navigation helpers
  const navigateWithSearch = (searchQuery) => {
    navigate(`/filmdex?search=${encodeURIComponent(searchQuery)}`);
  };
  const navigateToMusicDex = (searchQuery) => {
    navigate(`/musicdex?search=${encodeURIComponent(searchQuery)}`);
  };

  // -------- Tabs
  const handleTabChange = (tabKey) => {
    setTabLoading(true);
    setActiveTab(tabKey);
    setTimeout(() => setTabLoading(false), 300);
  };

  // -------- Language code helper
  const getLanguageCode = (displayName) => {
    const map = {
      English: 'en', Spanish: 'es', French: 'fr', German: 'de', Italian: 'it',
      Japanese: 'ja', Korean: 'ko', Chinese: 'zh', Portuguese: 'pt', Russian: 'ru',
      Arabic: 'ar', Hindi: 'hi', Dutch: 'nl', Swedish: 'sv', Norwegian: 'no',
      Danish: 'da', Finnish: 'fi', Polish: 'pl', Czech: 'cs', Hungarian: 'hu',
      Turkish: 'tr', Thai: 'th', Vietnamese: 'vi'
    };
    return map[displayName] || String(displayName || '').toLowerCase();
  };

  // -------- Data fetch
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const [analyticsResponse, musicAnalyticsResponse] = await Promise.all([
          apiService.getAnalytics(),
          apiService.getMusicAnalytics(),
        ]);
        if (analyticsResponse?.success) setAnalytics(analyticsResponse.data);
        else setError('Failed to load analytics');

        if (musicAnalyticsResponse?.success) setMusicAnalytics(musicAnalyticsResponse.data);
      } catch (e) {
        console.error('Error fetching analytics:', e);
        setError('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // -------- Formatters (defensive)
  const formatCurrency = (value) => `CHF ${Number(value || 0).toFixed(2)}`;
  const formatMinutes = (minutes) => {
    const total = Number(minutes || 0);
    const hours = Math.floor(total / 60);
    const mins = Math.floor(total % 60);
    return `${hours}h ${mins}m`;
  };
  const formatDuration = (totalMinutes) => {
    const total = Number(totalMinutes || 0);
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  };
  const formatMonthYear = (dateString) => {
    if (!dateString) return '';
    const [year, month] = String(dateString).split('-');
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // -------- Tooltip
  const CustomTooltip = ({ active, payload, label, isCurrency = false, isDate = false }) => {
    if (active && payload && payload.length) {
      const displayLabel = isDate && label ? formatMonthYear(label) : label;
      return (
        <div className="custom-tooltip">
          <p className="label">{displayLabel}</p>
          {payload.map((entry, i) => (
            <p key={i} style={{ color: entry.color }}>
              {entry.name}: {isCurrency ? formatCurrency(entry.value) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // -------- Render guards
  if (loading) {
    return (
      <div className="analytics-page">
        <div className="loading-message">Loading analytics...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="analytics-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }
  if (!analytics) return null;

  // Safe fallbacks for arrays
  const priceOverTime = analytics.priceOverTime ?? [];
  const moviesAcquiredOverTime = analytics.moviesAcquiredOverTime ?? [];
  const priceDistribution = analytics.priceDistribution ?? [];
  const pricePercentiles = analytics.pricePercentiles ?? { p50: 0, p90: 0, p95: 0, p99: 0 };
  const genreDistribution = analytics.genreDistribution ?? [];
  const formatDistribution = analytics.formatDistribution ?? [];
  const mediaTypeDistribution = analytics.mediaTypeDistribution ?? [];
  const originDistribution = analytics.originDistribution ?? [];
  const moviesByDecade = analytics.moviesByDecade ?? [];
  const ratingDistribution = analytics.ratingDistribution ?? [];
  const ageDistribution = analytics.ageDistribution ?? [];
  const runtimeDistribution = analytics.runtimeDistribution ?? [];
  const topDirectors = analytics.topDirectors ?? [];
  const topActors = analytics.topActors ?? [];
  const topROIMovies = analytics.topROIMovies ?? [];
  const topProfitableMovies = analytics.topProfitableMovies ?? [];
  const roiByGenre = analytics.roiByGenre ?? [];

  return (
    <div className="analytics-page">
      <Tabs activeKey={activeTab} onSelect={handleTabChange} className="analytics-tabs" variant="tabs">
        {/* ================= FilmDex ================= */}
        <Tab
          eventKey="filmdex"
          title={
            <span>
              <BsFilm className="me-2" />
              FilmDex Analytics
            </span>
          }
        >
          <div className={`tab-content ${activeTab === 'filmdex' ? 'active' : ''}`}>
            {tabLoading && activeTab === 'filmdex' ? (
              <div className="tab-loading">
                <div className="spinner-border text-warning" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3">Loading FilmDex analytics...</p>
              </div>
            ) : (
              <>
              {/* ---- Key Metrics ---- */}
              <div className="metrics-grid">
                <div className="metric-card metric-gold">
                  <BsFilm className="metric-icon" />
                  <div className="metric-content">
                    <div className="metric-value">{analytics.totalMovies ?? 0}</div>
                    <div className="metric-label">Total Movies</div>
                  </div>
                </div>
                <div className="metric-card metric-crimson">
                  <BsClock className="metric-icon" />
                  <div className="metric-content">
                    <div className="metric-value">{formatDuration(analytics.totalRuntime)}</div>
                    <div className="metric-label">Total Runtime</div>
                  </div>
                </div>
                <div className="metric-card metric-copper">
                  <BsCurrencyDollar className="metric-icon" />
                  <div className="metric-content">
                    <div className="metric-value">{formatCurrency(analytics.totalSpent)}</div>
                    <div className="metric-label">Total Spent</div>
                  </div>
                </div>
                <div className="metric-card metric-darkred">
                  <BsCalendar className="metric-icon" />
                  <div className="metric-content">
                    <div className="metric-value">{formatCurrency(analytics.averagePrice)}</div>
                    <div className="metric-label">Average Price</div>
                  </div>
                </div>
              </div>

              {/* ---- Main Grid ---- */}
              <div className="dashboard-grid">
                <div className="main-column">
                  {/* Collection Value Over Time */}
                  <div className="chart-card">
                    <h3 className="chart-title">Collection Value Over Time</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={priceOverTime}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.areaGold} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={COLORS.areaGold} stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                        <XAxis
                          dataKey="period"
                          stroke="#a0a0a0"
                          style={{ fontSize: '11px' }}
                          tickFormatter={formatMonthYear}
                          interval="preserveStartEnd"
                          minTickGap={50}
                        />
                        <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} tickFormatter={(v) => `CHF ${v}`} />
                        <Tooltip content={<CustomTooltip isCurrency isDate />} />
                        <Area type="monotone" dataKey="totalValue" stroke={COLORS.areaGold} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Movies Acquired Over Time */}
                  <div className="chart-card">
                    <h3 className="chart-title">Movies Acquired Over Time</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={moviesAcquiredOverTime}>
                        <defs>
                          <linearGradient id="colorMovies" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.areaCrimson} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={COLORS.areaCrimson} stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                        <XAxis
                          dataKey="period"
                          stroke="#a0a0a0"
                          style={{ fontSize: '11px' }}
                          tickFormatter={formatMonthYear}
                          interval="preserveStartEnd"
                          minTickGap={50}
                        />
                        <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                        <Tooltip content={<CustomTooltip isDate />} />
                        <Area type="monotone" dataKey="count" stroke={COLORS.areaCrimson} strokeWidth={3} fillOpacity={1} fill="url(#colorMovies)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Price Distribution with Percentiles */}
                  <div className="chart-card">
                    <h3 className="chart-title">Price Distribution with Percentiles (CHF)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={priceDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                        <XAxis
                          dataKey="range"
                          stroke="#a0a0a0"
                          style={{ fontSize: '10px' }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          interval="preserveStartEnd"
                          minTickGap={20}
                        />
                        <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {priceDistribution.map((entry, index) => {
                            const fill = COLORS.genre[index % COLORS.genre.length];
                            return (
                              <Cell
                                key={`cell-${index}`}
                                fill={fill}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const raw = String(entry.range || '').trim();
                                  const normalized = raw.replace(/[–—]/g, '-');
                                  if (/\+$/.test(normalized)) {
                                    const min = parseInt(normalized, 10);
                                    navigateWithSearch(`price:>=${min}`);
                                  } else if (/^\d+\s*-\s*\d+$/.test(normalized)) {
                                    const [min, max] = normalized.split('-').map((s) => parseInt(s, 10));
                                    navigateWithSearch(`price:>=${min} price:<=${max}`);
                                  }
                                }}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="percentile-markers">
                      <div className="percentile-marker p50">
                        <span className="marker-label">p50</span>
                        <span className="marker-value">{formatCurrency(pricePercentiles.p50)}</span>
                      </div>
                      <div className="percentile-marker p90">
                        <span className="marker-label">p90</span>
                        <span className="marker-value">{formatCurrency(pricePercentiles.p90)}</span>
                      </div>
                      <div className="percentile-marker p95">
                        <span className="marker-label">p95</span>
                        <span className="marker-value">{formatCurrency(pricePercentiles.p95)}</span>
                      </div>
                      <div className="percentile-marker p99">
                        <span className="marker-label">p99</span>
                        <span className="marker-value">{formatCurrency(pricePercentiles.p99)}</span>
                      </div>
                    </div>
                    <div className="percentile-note-compact">
                      <strong>Note:</strong> Box set prices divided by movie count (e.g., CHF 99 box set ÷ 11 movies = CHF 9 each)
                    </div>
                  </div>

                  {/* Genres & Formats */}
                  <div className="chart-row">
                    <div className="chart-card">
                      <h3 className="chart-title">Movies by Genre</h3>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={genreDistribution.slice(0, 10)}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal vertical={false} />
                          <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis type="category" dataKey="genre" stroke="#a0a0a0" style={{ fontSize: '12px' }} width={100} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                            {genreDistribution.slice(0, 10).map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.genre[index % COLORS.genre.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateWithSearch(`genre:"${entry.genre}"`)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
                      <h3 className="chart-title">Collection by Format</h3>
                      <ResponsiveContainer width="100%" height={400}>
                        <PieChart>
                          <Pie
                            data={formatDistribution}
                            cx="50%"
                            cy="45%"
                            innerRadius={70}
                            outerRadius={110}
                            dataKey="count"
                            nameKey="format"
                            label={false}
                          >
                            {formatDistribution.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.format[index % COLORS.format.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateWithSearch(`format:"${entry.format}"`)}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend
                            verticalAlign="bottom"
                            height={60}
                            formatter={(value, entry) => `${value} (${entry.payload.count})`}
                            wrapperStyle={{ fontSize: '13px', color: '#b0b0b0' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Media Type & Origins */}
                  <div className="chart-row">
                    <div className="chart-card">
                      <h3 className="chart-title">Movies vs TV Shows</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={mediaTypeDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            dataKey="count"
                            nameKey="type"
                            label={false}
                          >
                            {mediaTypeDistribution.map((entry) => (
                              <Cell
                                key={`cell-${entry.type}`}
                                fill={entry.type === 'Movie' ? COLORS.mediaType.movie : COLORS.mediaType.tvShow}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const mediaType = entry.type === 'Movie' ? 'movie' : 'tv';
                                  navigateWithSearch(`media_type:"${mediaType}"`);
                                }}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value, entry) => `${value} (${entry.payload.count})`}
                            wrapperStyle={{ fontSize: '13px', color: '#b0b0b0' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
                      <h3 className="chart-title">Movie Origins (by Language)</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={originDistribution.slice(0, 10)}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal vertical={false} />
                          <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis type="category" dataKey="origin" stroke="#a0a0a0" style={{ fontSize: '12px' }} width={80} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                            {originDistribution.slice(0, 10).map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.genre[index % COLORS.genre.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => navigateWithSearch(`original_language:"${getLanguageCode(entry.origin)}"`)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Decades & Ratings */}
                  <div className="chart-row">
                    <div className="chart-card">
                      <h3 className="chart-title">Movies by Decade</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={moviesByDecade}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                          <XAxis dataKey="decade" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            {moviesByDecade.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.decade[index % COLORS.decade.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const startYear = parseInt(entry.decade, 10);
                                  const endYear = startYear + 9;
                                  navigateWithSearch(`year:>=${startYear} year:<=${endYear}`);
                                }}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
                      <h3 className="chart-title">Rating Distribution</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={ratingDistribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                          <XAxis dataKey="rating" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar
                            dataKey="imdb"
                            name="IMDB"
                            fill="#FFD700"
                            radius={[8, 8, 0, 0]}
                            style={{ cursor: 'pointer' }}
                            onClick={(data, index) => {
                              const entry = ratingDistribution[index];
                              const [min, max] = String(entry.rating).split('-').map(Number);
                              navigateWithSearch(`imdb_rating:>=${min} imdb_rating:<=${max}`);
                            }}
                          />
                          <Bar
                            dataKey="tmdb"
                            name="TMDB"
                            fill="#DC143C"
                            radius={[8, 8, 0, 0]}
                            style={{ cursor: 'pointer' }}
                            onClick={(data, index) => {
                              const entry = ratingDistribution[index];
                              const [min, max] = String(entry.rating).split('-').map(Number);
                              navigateWithSearch(`tmdb_rating:>=${min} tmdb_rating:<=${max}`);
                            }}
                          />
                          <Bar
                            dataKey="rottenTomatoes"
                            name="Rotten Tomatoes"
                            fill="#32CD32"
                            radius={[8, 8, 0, 0]}
                            style={{ cursor: 'pointer' }}
                            onClick={(data, index) => {
                              const entry = ratingDistribution[index];
                              const [min, max] = String(entry.rating).split('-').map(Number);
                              const minPercent = min * 10;
                              const maxPercent = max * 10;
                              navigateWithSearch(`rotten_tomato_rating:>=${minPercent} rotten_tomato_rating:<=${maxPercent}`);
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Age & Runtime */}
                  <div className="chart-row">
                    <div className="chart-card">
                      <h3 className="chart-title">Age Recommendations</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={ageDistribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                          <XAxis dataKey="ageRecommendation" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            {ageDistribution.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.age[index % COLORS.age.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const age = entry.ageRecommendation;
                                  if (age === 'All Ages') {
                                    navigateWithSearch('recommended_age:<=6');
                                  } else {
                                    const ageNum = parseInt(String(age).replace('+', ''), 10);
                                    navigateWithSearch(`recommended_age:${ageNum}`);
                                  }
                                }}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="chart-card">
                      <h3 className="chart-title">Runtime Distribution</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={runtimeDistribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                          <XAxis dataKey="runtime" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            {runtimeDistribution.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.decade[index % COLORS.decade.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const runtime = String(entry.runtime);
                                  if (runtime === 'Under 90 min') {
                                    navigateWithSearch('runtime:<90');
                                  } else if (runtime === '90-120 min') {
                                    navigateWithSearch('runtime:>=90 runtime:<=120');
                                  } else if (runtime === '120-150 min') {
                                    navigateWithSearch('runtime:>=120 runtime:<=150');
                                  } else if (runtime === '150-180 min') {
                                    navigateWithSearch('runtime:>=150 runtime:<=180');
                                  } else if (runtime === 'Over 180 min') {
                                    navigateWithSearch('runtime:>180');
                                  }
                                }}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Commercial Success */}
                  {analytics.commercialSuccess && (
                    <>
                      <div className="section-divider">
                        <h2 className="section-title">Commercial Success Insights</h2>
                        <p className="section-subtitle">
                          Budget & Revenue Analysis ({analytics.commercialSuccess.totalMoviesWithData} movies with data)
                        </p>
                      </div>

                      <div className="metrics-grid">
                        <div className="metric-card metric-gold">
                          <div className="metric-content">
                            <div className="metric-value">{analytics.commercialSuccess.overallROI}%</div>
                            <div className="metric-label">Overall ROI</div>
                          </div>
                        </div>
                        <div className="metric-card metric-crimson">
                          <div className="metric-content">
                            <div className="metric-value">{analytics.commercialSuccess.profitabilityRate}%</div>
                            <div className="metric-label">Profitability Rate</div>
                          </div>
                        </div>
                        <div className="metric-card metric-copper">
                          <div className="metric-content">
                            <div className="metric-value">
                              {analytics.commercialSuccess.profitableMovies}/{analytics.commercialSuccess.totalMoviesWithData}
                            </div>
                            <div className="metric-label">Profitable Movies</div>
                          </div>
                        </div>
                        <div className="metric-card metric-darkred">
                          <div className="metric-content">
                            <div className="metric-value">{analytics.commercialSuccess.averageROI}%</div>
                            <div className="metric-label">Average ROI</div>
                          </div>
                        </div>
                      </div>

                      <div className="chart-card">
                        <h3 className="chart-title">Average ROI by Genre</h3>
                        <ResponsiveContainer width="100%" height={350}>
                          <BarChart
                            data={roiByGenre}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal vertical={false} />
                            <XAxis
                              type="number"
                              stroke="#a0a0a0"
                              style={{ fontSize: '12px' }}
                              label={{ value: 'ROI %', position: 'insideBottom', offset: -5 }}
                            />
                            <YAxis
                              type="category"
                              dataKey="genre"
                              stroke="#a0a0a0"
                              style={{ fontSize: '12px' }}
                              width={100}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="averageROI" radius={[0, 8, 8, 0]}>
                              {roiByGenre.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS.genre[index % COLORS.genre.length]}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => navigateWithSearch(`genre:"${entry.genre}"`)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>

                {/* ---- Sidebar ---- */}
                <div className="sidebar-column">
                  <div className="list-card">
                    <h3 className="chart-title">Top Directors</h3>
                    <div className="custom-list">
                      {topDirectors.slice(0, 10).map((item, index) => (
                        <div
                          key={index}
                          className="list-item clickable-item"
                          onClick={() => navigateWithSearch(`director:"${item.director}"`)}
                          title={`Click to view all movies by ${item.director}`}
                        >
                          <span className="list-rank" style={{ backgroundColor: COLORS.genre[index % COLORS.genre.length] }}>{index + 1}</span>
                          <span className="list-name" title={item.director}>
                            {item.director.length > 25 ? item.director.substring(0, 25) + '...' : item.director}
                          </span>
                          <span className="list-value">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="list-card">
                    <h3 className="chart-title">Top Actors</h3>
                    <div className="custom-list">
                      {topActors.slice(0, 10).map((item, index) => (
                        <div
                          key={index}
                          className="list-item clickable-item"
                          onClick={() => navigateWithSearch(`actor:"${item.actor}"`)}
                          title={`Click to view all movies with ${item.actor}`}
                        >
                          <span className="list-rank" style={{ backgroundColor: COLORS.genre[index % COLORS.genre.length] }}>{index + 1}</span>
                          <span className="list-name" title={item.actor}>
                            {item.actor.length > 25 ? item.actor.substring(0, 25) + '...' : item.actor}
                          </span>
                          <span className="list-value">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {topROIMovies.length > 0 && (
                    <>
                      <div className="list-card">
                        <h3 className="chart-title">Highest ROI Movies</h3>
                        <div className="custom-list">
                          {topROIMovies.slice(0, 8).map((item, index) => (
                            <div
                              key={index}
                              className="list-item clickable-item"
                              onClick={() => navigateWithSearch(`title:"${item.title}"`)}
                              title={`Click to view ${item.title}`}
                            >
                              <span className="list-rank" style={{ backgroundColor: '#FFD700' }}>{index + 1}</span>
                              <span className="list-name" title={item.title}>
                                {item.title.length > 20 ? item.title.substring(0, 20) + '...' : item.title}
                              </span>
                              <span className="list-value">{item.roi}%</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="list-card">
                        <h3 className="chart-title">Most Profitable Movies</h3>
                        <div className="custom-list">
                          {topProfitableMovies.slice(0, 8).map((item, index) => (
                            <div
                              key={index}
                              className="list-item clickable-item"
                              onClick={() => navigateWithSearch(`title:"${item.title}"`)}
                              title={`Click to view ${item.title}`}
                            >
                              <span className="list-rank" style={{ backgroundColor: '#DC143C' }}>{index + 1}</span>
                              <span className="list-name" title={item.title}>
                                {item.title.length > 20 ? item.title.substring(0, 20) + '...' : item.title}
                              </span>
                              <span className="list-value" style={{ fontSize: '0.75rem' }}>
                                ${((item.profit || 0) / 1_000_000).toFixed(0)}M
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              </>
            )}
          </div>
        </Tab>

        {/* ================= MusicDex ================= */}
        <Tab
          eventKey="musicdex"
          title={
            <span>
              <BsMusicNote className="me-2" />
              MusicDex Analytics
            </span>
          }
        >
          <div className={`tab-content ${activeTab === 'musicdex' ? 'active' : ''}`}>
            {tabLoading && activeTab === 'musicdex' ? (
              <div className="tab-loading">
                <div className="spinner-border text-warning" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3">Loading MusicDex analytics...</p>
              </div>
            ) : (
              musicAnalytics && (
                <>
                {/* ---- Enhanced Key Metrics ---- */}
                <div className="metrics-grid">
                  <div className="metric-card metric-purple">
                    <BsMusicNote className="metric-icon" />
                    <div className="metric-content">
                      <div className="metric-value">{musicAnalytics.totalAlbums ?? 0}</div>
                      <div className="metric-label">Total Albums</div>
                    </div>
                  </div>
                  <div className="metric-card metric-blue">
                    <BsClock className="metric-icon" />
                    <div className="metric-content">
                      <div className="metric-value">{formatDuration(musicAnalytics.totalDuration ?? 0)}</div>
                      <div className="metric-label">Total Duration</div>
                    </div>
                  </div>
                  <div className="metric-card metric-teal">
                    <BsVinyl className="metric-icon" />
                    <div className="metric-content">
                      <div className="metric-value">{musicAnalytics.totalTracks ?? 0}</div>
                      <div className="metric-label">Total Tracks</div>
                    </div>
                  </div>
                  <div className="metric-card metric-indigo">
                    <BsGraphUp className="metric-icon" />
                    <div className="metric-content">
                      <div className="metric-value">{formatMinutes(musicAnalytics.averageDuration ?? 0)}</div>
                      <div className="metric-label">Average Duration</div>
                    </div>
                  </div>
                  <div className="metric-card metric-rose">
                    <BsPeople className="metric-icon" />
                    <div className="metric-content">
                      <div className="metric-value">{musicAnalytics.diversityMetrics?.artistDiversity ?? 0}</div>
                      <div className="metric-label">Unique Artists</div>
                    </div>
                  </div>
                </div>

                {/* ---- Track Overlap Overview - Featured Section ---- */}
                {musicAnalytics.overlapStats && (
                  <div className="chart-card overlap-featured">
                    <h3 className="chart-title">Track Overlap Analysis</h3>
                    <div className="overlap-overview">
                      <div className="overlap-summary">
                        <div className="overlap-main-stats">
                          <div className="overlap-main-metric">
                            <div className="overlap-main-value">{musicAnalytics.overlapStats.totalSharedTracks}</div>
                            <div className="overlap-main-label">Tracks Appear on Multiple Albums</div>
                          </div>
                          <div className="overlap-main-metric">
                            <div className="overlap-main-value">{musicAnalytics.overlapPercentage}%</div>
                            <div className="overlap-main-label">of Albums Have Overlaps</div>
                          </div>
                        </div>
                        <div className="overlap-details">
                          <div className="overlap-detail-item">
                            <span className="detail-label">Total Instances:</span>
                            <span className="detail-value">{musicAnalytics.overlapStats.totalOverlapInstances}</span>
                          </div>
                          <div className="overlap-detail-item">
                            <span className="detail-label">Albums Affected:</span>
                            <span className="detail-value">{musicAnalytics.overlapStats.albumsWithOverlap}</span>
                          </div>
                          <div className="overlap-detail-item">
                            <span className="detail-label">Average per Track:</span>
                            <span className="detail-value">{musicAnalytics.overlapStats.averageOverlapPerTrack}</span>
                          </div>
                          <div className="overlap-detail-item">
                            <span className="detail-label">Artists with Overlap:</span>
                            <span className="detail-value">{musicAnalytics.overlapStats.artistsWithOverlap}</span>
                          </div>
                        </div>
                      </div>
                      {musicAnalytics.overlapStats.mostOverlappedTrack && (
                        <div className="most-overlapped-featured">
                          <h4>Most Overlapped Track</h4>
                          <div 
                            className="clickable-track-featured"
                            onClick={() => navigateToMusicDex(`track:"${musicAnalytics.overlapStats.mostOverlappedTrack.title}"`)}
                            title={`Click to view albums with ${musicAnalytics.overlapStats.mostOverlappedTrack.title}`}
                          >
                            <div className="track-title">{musicAnalytics.overlapStats.mostOverlappedTrack.title}</div>
                            <div className="track-count">Appears on {musicAnalytics.overlapStats.mostOverlappedTrack.albumCount} albums</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ---- Main Grid ---- */}
                <div className="dashboard-grid">
                  <div className="main-column">
                    {/* Genre Evolution Over Time */}
                    <div className="chart-card">
                      <h3 className="chart-title">Genre Evolution Over Time</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={musicAnalytics.genreEvolution ?? []}>
                          <defs>
                            <linearGradient id="colorGenre1" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FFD700" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#FFD700" stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id="colorGenre2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#DC143C" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#DC143C" stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id="colorGenre3" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#B87333" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#B87333" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                          <XAxis
                            dataKey="decade"
                            stroke="#a0a0a0"
                            style={{ fontSize: '11px' }}
                          />
                          <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          {musicAnalytics.genreDistribution?.slice(0, 3).map((genre, index) => (
                            <Area
                              key={genre.genre}
                              type="monotone"
                              dataKey={genre.genre}
                              stackId="1"
                              stroke={COLORS.music[index % COLORS.music.length]}
                              fill={`url(#colorGenre${index + 1})`}
                              strokeWidth={2}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Albums by Decade */}
                    <div className="chart-card">
                      <h3 className="chart-title">Albums by Decade</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={musicAnalytics.decadeDistribution ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                          <XAxis dataKey="decade" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            {(musicAnalytics.decadeDistribution ?? []).map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.musicCharts.distribution.decades[index % COLORS.musicCharts.distribution.decades.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const decade = parseInt(entry.decade);
                                  const startYear = decade;
                                  const endYear = decade + 9;
                                  navigateToMusicDex(`year:>=${startYear} year:<=${endYear}`);
                                }}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Duration Distribution */}
                    <div className="chart-card">
                      <h3 className="chart-title">Album Duration Distribution</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={musicAnalytics.durationDistribution ?? []}
                            cx="50%"
                            cy="45%"
                            innerRadius={70}
                            outerRadius={110}
                            dataKey="count"
                            nameKey="range"
                            label={false}
                          >
                            {(musicAnalytics.durationDistribution ?? []).map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS.music[index % COLORS.music.length]}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const range = entry.range;
                                  if (range === 'Under 30 min') {
                                    navigateToMusicDex('duration:<30');
                                  } else if (range === '30-45 min') {
                                    navigateToMusicDex('duration:>=30 duration:<45');
                                  } else if (range === '45-60 min') {
                                    navigateToMusicDex('duration:>=45 duration:<60');
                                  } else if (range === '60-75 min') {
                                    navigateToMusicDex('duration:>=60 duration:<75');
                                  } else if (range === '75-90 min') {
                                    navigateToMusicDex('duration:>=75 duration:<90');
                                  } else if (range === 'Over 90 min') {
                                    navigateToMusicDex('duration:>=90');
                                  }
                                }}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend
                            verticalAlign="bottom"
                            height={60}
                            formatter={(value, entry) => `${value} (${entry.payload.count})`}
                            wrapperStyle={{ fontSize: '13px', color: '#b0b0b0' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Genres & Artists */}
                    <div className="chart-row">
                      <div className="chart-card">
                        <h3 className="chart-title">Top Genres</h3>
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart
                            data={musicAnalytics.genreDistribution?.slice(0, 10) ?? []}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal vertical={false} />
                            <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                            <YAxis type="category" dataKey="genre" stroke="#a0a0a0" style={{ fontSize: '12px' }} width={100} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                              {(musicAnalytics.genreDistribution?.slice(0, 10) ?? []).map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS.musicCharts.distribution.genres[index % COLORS.musicCharts.distribution.genres.length]}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => navigateToMusicDex(`genre:"${entry.genre}"`)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="chart-card">
                        <h3 className="chart-title">Top Artists</h3>
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart
                            data={musicAnalytics.artistDistribution?.slice(0, 10) ?? []}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal vertical={false} />
                            <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                            <YAxis type="category" dataKey="artist" stroke="#a0a0a0" style={{ fontSize: '12px' }} width={100} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                              {(musicAnalytics.artistDistribution?.slice(0, 10) ?? []).map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS.musicCharts.distribution.artists[index % COLORS.musicCharts.distribution.artists.length]}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => navigateToMusicDex(`artist:"${entry.artist}"`)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Labels & Types */}
                    <div className="chart-row">
                      <div className="chart-card">
                        <h3 className="chart-title">Top Record Labels</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart
                            data={musicAnalytics.labelDistribution?.slice(0, 8) ?? []}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal vertical={false} />
                            <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                            <YAxis type="category" dataKey="label" stroke="#a0a0a0" style={{ fontSize: '12px' }} width={80} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                              {(musicAnalytics.labelDistribution?.slice(0, 8) ?? []).map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS.musicCharts.distribution.labels[index % COLORS.musicCharts.distribution.labels.length]}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => navigateToMusicDex(`label:"${entry.label}"`)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="chart-card">
                        <h3 className="chart-title">Album Types</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={musicAnalytics.typeDistribution ?? []}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              dataKey="count"
                              nameKey="type"
                              label={false}
                            >
                              {(musicAnalytics.typeDistribution ?? []).map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS.music[index % COLORS.music.length]}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => navigateToMusicDex(`type:"${entry.type}"`)}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend
                              verticalAlign="bottom"
                              height={36}
                              formatter={(value, entry) => `${value} (${entry.payload.count})`}
                              wrapperStyle={{ fontSize: '13px', color: '#b0b0b0' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Recording Quality */}
                    {musicAnalytics.qualityDistribution && musicAnalytics.qualityDistribution.length > 0 && (
                      <div className="chart-card">
                        <h3 className="chart-title">Recording Quality Distribution</h3>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={musicAnalytics.qualityDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                            <XAxis dataKey="quality" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                            <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                              {musicAnalytics.qualityDistribution.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS.musicCharts.distribution.quality[index % COLORS.musicCharts.distribution.quality.length]}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => navigateToMusicDex(`quality:"${entry.quality}"`)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                  </div>

                  {/* ---- Sidebar ---- */}
                  <div className="sidebar-column">
                    {/* Longest Albums */}
                    <div className="list-card">
                      <h3 className="chart-title">Longest Albums</h3>
                      <div className="custom-list">
                        {(musicAnalytics.longestAlbums ?? []).slice(0, 8).map((album, index) => (
                          <div
                            key={index}
                            className="list-item clickable-item"
                            onClick={() => navigateToMusicDex(`title:"${album.title}"`)}
                            title={`Click to view ${album.title}`}
                          >
                            <span className="list-rank" style={{ backgroundColor: COLORS.musicCharts.lists.longestAlbums[index % COLORS.musicCharts.lists.longestAlbums.length] }}>{index + 1}</span>
                            <span className="list-name" title={album.title}>
                              {album.title.length > 20 ? album.title.substring(0, 20) + '...' : album.title}
                            </span>
                            <span className="list-value">{formatMinutes(album.duration)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top Collaborations */}
                    {musicAnalytics.topCollaborations && musicAnalytics.topCollaborations.length > 0 && (
                      <div className="list-card">
                        <h3 className="chart-title">Top Collaborations</h3>
                        <div className="custom-list">
                          {musicAnalytics.topCollaborations.slice(0, 8).map((collab, index) => (
                            <div
                              key={index}
                              className="list-item clickable-item"
                              onClick={() => navigateToMusicDex(`artist:"${collab.collaboration.split(' & ')[0]}" artist:"${collab.collaboration.split(' & ')[1]}"`)}
                              title={`Click to view albums by ${collab.collaboration}`}
                            >
                              <span className="list-rank" style={{ backgroundColor: COLORS.musicCharts.lists.collaborations[index % COLORS.musicCharts.lists.collaborations.length] }}>{index + 1}</span>
                              <span className="list-name" title={collab.collaboration}>
                                {collab.collaboration.length > 25 ? collab.collaboration.substring(0, 25) + '...' : collab.collaboration}
                              </span>
                              <span className="list-value">{collab.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Genre Crossovers */}
                    {musicAnalytics.topGenreCrossovers && musicAnalytics.topGenreCrossovers.length > 0 && (
                      <div className="list-card">
                        <h3 className="chart-title">Genre Crossovers</h3>
                        <div className="custom-list">
                          {musicAnalytics.topGenreCrossovers.slice(0, 8).map((crossover, index) => (
                            <div
                              key={index}
                              className="list-item clickable-item"
                              onClick={() => navigateToMusicDex(`genre:"${crossover.crossover.split(' + ')[0]}" genre:"${crossover.crossover.split(' + ')[1]}"`)}
                              title={`Click to view albums with ${crossover.crossover}`}
                            >
                              <span className="list-rank" style={{ backgroundColor: COLORS.musicCharts.lists.crossovers[index % COLORS.musicCharts.lists.crossovers.length] }}>{index + 1}</span>
                              <span className="list-name" title={crossover.crossover}>
                                {crossover.crossover.length > 25 ? crossover.crossover.substring(0, 25) + '...' : crossover.crossover}
                              </span>
                              <span className="list-value">{crossover.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Track Overlap */}
                    {musicAnalytics.trackOverlap && musicAnalytics.trackOverlap.length > 0 && (
                      <div className="list-card">
                        <h3 className="chart-title">Shared Tracks</h3>
                        <div className="custom-list">
                          {musicAnalytics.trackOverlap.slice(0, 8).map((track, index) => (
                            <div
                              key={index}
                              className="list-item clickable-item"
                              onClick={() => navigateToMusicDex(`track:"${track.title}"`)}
                              title={`Click to view albums with ${track.title}`}
                            >
                              <span className="list-rank" style={{ backgroundColor: COLORS.musicCharts.lists.sharedTracks[index % COLORS.musicCharts.lists.sharedTracks.length] }}>{index + 1}</span>
                              <span className="list-name" title={track.title}>
                                {track.title.length > 25 ? track.title.substring(0, 25) + '...' : track.title}
                              </span>
                              <span className="list-value">{track.albumCount}</span>
                            </div>
                          ))}
                        </div>
                        <div className="overlap-stats">
                          <p><strong>{musicAnalytics.overlapPercentage}%</strong> of albums have shared tracks</p>
                          {musicAnalytics.overlapStats && (
                            <p><strong>{musicAnalytics.overlapStats.totalSharedTracks}</strong> tracks appear on multiple albums</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Artists with Most Overlap */}
                    {musicAnalytics.topOverlappingArtists && musicAnalytics.topOverlappingArtists.length > 0 && (
                      <div className="list-card">
                        <h3 className="chart-title">Artists with Track Overlaps</h3>
                        <div className="custom-list">
                          {musicAnalytics.topOverlappingArtists.slice(0, 8).map((artist, index) => (
                            <div
                              key={index}
                              className="list-item clickable-item"
                              onClick={() => navigateToMusicDex(`artist:"${artist.artist}"`)}
                              title={`${artist.artist}: ${artist.overlappingTracks} tracks appear on ${artist.albumCount} albums. Click to view albums.`}
                            >
                              <span className="list-rank" style={{ backgroundColor: '#DC143C' }}>{index + 1}</span>
                              <span className="list-name" title={artist.artist}>
                                {artist.artist.length > 20 ? artist.artist.substring(0, 20) + '...' : artist.artist}
                              </span>
                              <span className="list-value" style={{ fontSize: '0.75rem' }}>
                                {artist.overlappingTracks} tracks on {artist.albumCount} albums
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="overlap-stats">
                          <p><strong>{musicAnalytics.overlapStats?.artistsWithOverlap || 0}</strong> artists have overlapping tracks</p>
                        </div>
                      </div>
                    )}

                    {/* Diversity Metrics */}
                    {musicAnalytics.diversityMetrics && (
                      <div className="list-card">
                        <h3 className="chart-title">Collection Diversity</h3>
                        <div className="custom-list">
                          <div className="list-item">
                            <span className="list-rank" style={{ backgroundColor: '#B87333' }}>A</span>
                            <span className="list-name">Artists</span>
                            <span className="list-value">{musicAnalytics.diversityMetrics.artistDiversity}</span>
                          </div>
                          <div className="list-item">
                            <span className="list-rank" style={{ backgroundColor: '#DC143C' }}>G</span>
                            <span className="list-name">Genres</span>
                            <span className="list-value">{musicAnalytics.diversityMetrics.genreDiversity}</span>
                          </div>
                          <div className="list-item">
                            <span className="list-rank" style={{ backgroundColor: '#FF6347' }}>L</span>
                            <span className="list-name">Labels</span>
                            <span className="list-value">{musicAnalytics.diversityMetrics.labelDiversity}</span>
                          </div>
                          <div className="list-item">
                            <span className="list-rank" style={{ backgroundColor: '#FFD700' }}>C</span>
                            <span className="list-name">Countries</span>
                            <span className="list-value">{musicAnalytics.diversityMetrics.countryDiversity}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </>
              )
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  );
};

export default AnalyticsPage;
