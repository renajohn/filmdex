import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import apiService from '../services/api';
import { BsArrowLeft, BsFilm, BsClock, BsCurrencyDollar, BsCalendar } from 'react-icons/bs';
import './AnalyticsPage.css';

// Refined color palette - Semantic and harmonious
const COLORS = {
  // Format spectrum - Distinct colors for different media types
  format: [
    '#FFD700', // Bright Gold (Blu-ray 4K)
    '#DC143C', // Crimson (Blu-ray)
    '#8B0000', // Dark Red (DVD)
    '#FF8C00', // Dark Orange (Digital)
    '#B87333'  // Copper (Unspecified/Other)
  ],
  // Genre spectrum - Smooth warm gradient (gold → orange → red → burgundy)
  genre: [
    '#FFD700', // 1. Bright Gold
    '#FFCC00', // 2. Golden Yellow
    '#FFB700', // 3. Amber
    '#FFA500', // 4. Orange
    '#FF8C00', // 5. Dark Orange
    '#FF7B00', // 6. Deep Orange
    '#FF6347', // 7. Tomato Red
    '#F94449', // 8. Red
    '#DC143C', // 9. Crimson
    '#C41E3A', // 10. Deep Crimson
    '#8B0000', // 11. Dark Red
    '#7B1113'  // 12. Burgundy
  ],
  // Decade spectrum - Chronological progression (older → newer)
  decade: [
    '#8B4513', // 1. Saddle Brown (oldest)
    '#A0522D', // 2. Sienna
    '#B87333', // 3. Copper
    '#CD853F', // 4. Peru
    '#D2691E', // 5. Chocolate
    '#FF8C00', // 6. Dark Orange
    '#FFA500', // 7. Orange
    '#FFB700', // 8. Light Gold
    '#FFD700'  // 9. Bright Gold (newest)
  ],
  // Rating spectrum - Intuitive (low/bad → high/good)
  // 0-2: Red, 2-4: Orange-Red, 4-6: Orange, 6-7: Yellow, 7-8: Yellow-Green, 8-9: Light Green, 9-10: Green
  rating: [
    '#DC143C', // 0-2: Crimson (bad)
    '#FF4500', // 2-4: Orange Red (poor)
    '#FF8C00', // 4-6: Dark Orange (mediocre)
    '#FFD700', // 6-7: Gold (decent)
    '#9ACD32', // 7-8: Yellow Green (good)
    '#32CD32', // 8-9: Lime Green (very good)
    '#228B22'  // 9-10: Forest Green (excellent)
  ],
  // Age spectrum - Progressive maturity (light → dark)
  age: [
    '#32CD32', // All Ages (Green - family friendly)
    '#9ACD32', // Young (Yellow Green)
    '#FFD700', // 6+ (Gold)
    '#FFA500', // 10+ (Orange)
    '#FF8C00', // 12+ (Dark Orange)
    '#FF6347', // 14+ (Tomato)
    '#DC143C', // 16+ (Crimson)
    '#8B0000'  // 18+ (Dark Red - mature)
  ],
  // Media type colors - Distinct and meaningful
  mediaType: {
    movie: '#FFD700',    // Gold (premium, cinema)
    tvShow: '#DC143C'    // Crimson (serialized content)
  },
  // Commercial success colors - Semantic profit/loss
  commercial: {
    profitable: '#32CD32',     // Green (profit)
    unprofitable: '#DC143C',   // Red (loss)
    highROI: '#FFD700',       // Gold (excellent return)
    lowROI: '#FF8C00'         // Orange (poor return)
  },
  // Chart-specific colors
  areaGold: '#FFD700',
  areaCrimson: '#DC143C',
  barCopper: '#B87333',
  barBurgundy: '#8B0000'
};

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiService.getAnalytics();
      if (response.success) {
        setAnalytics(response.data);
      } else {
        setError('Failed to load analytics');
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return `CHF ${value.toFixed(2)}`;
  };

  const formatMinutes = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDuration = (totalMinutes) => {
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  };

  const formatMonthYear = (dateString) => {
    const [year, month] = dateString.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const CustomTooltip = ({ active, payload, label, isCurrency = false, isDate = false }) => {
    if (active && payload && payload.length) {
      const displayLabel = isDate && label ? formatMonthYear(label) : label;
      return (
        <div className="custom-tooltip">
          <p className="label">{displayLabel}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {isCurrency ? formatCurrency(entry.value) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom label renderer for pie charts with white text
  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        style={{ fontSize: '13px', fontWeight: 600, textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
      >
        {`${name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <button className="back-button" onClick={() => navigate(-1)}>
            <BsArrowLeft /> Back
          </button>
          <h1>Analytics Dashboard</h1>
        </div>
        <div className="loading-message">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <button className="back-button" onClick={() => navigate(-1)}>
            <BsArrowLeft /> Back
          </button>
          <h1>Analytics Dashboard</h1>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          <BsArrowLeft /> Back
        </button>
        <h1>Analytics Dashboard</h1>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card metric-gold">
          <BsFilm className="metric-icon" />
          <div className="metric-content">
            <div className="metric-value">{analytics.totalMovies}</div>
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

      {/* Charts Grid */}
      <div className="dashboard-grid">
        <div className="main-column">
          {/* Price Over Time */}
          <div className="chart-card">
            <h3 className="chart-title">Collection Value Over Time</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={analytics.priceOverTime}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD700" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#FFD700" stopOpacity={0.1}/>
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
                <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} tickFormatter={(value) => `CHF ${value}`} />
                <Tooltip content={<CustomTooltip isCurrency={true} isDate={true} />} />
                <Area type="monotone" dataKey="totalValue" stroke={COLORS.areaGold} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Price Distribution with Percentiles */}
          <div className="chart-card">
            <h3 className="chart-title">Price Distribution with Percentiles (CHF)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.priceDistribution}>
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
                {/* Percentile reference lines */}
                <Line 
                  type="monotone" 
                  dataKey={() => null} 
                  stroke="#FFD700" 
                  strokeWidth={2} 
                  strokeDasharray="5 5"
                  dot={false}
                  name="p50"
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {analytics.priceDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.genre[index % COLORS.genre.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="percentile-markers">
              <div className="percentile-marker p50">
                <span className="marker-label">p50</span>
                <span className="marker-value">{formatCurrency(analytics.pricePercentiles.p50)}</span>
              </div>
              <div className="percentile-marker p90">
                <span className="marker-label">p90</span>
                <span className="marker-value">{formatCurrency(analytics.pricePercentiles.p90)}</span>
              </div>
              <div className="percentile-marker p95">
                <span className="marker-label">p95</span>
                <span className="marker-value">{formatCurrency(analytics.pricePercentiles.p95)}</span>
              </div>
              <div className="percentile-marker p99">
                <span className="marker-label">p99</span>
                <span className="marker-value">{formatCurrency(analytics.pricePercentiles.p99)}</span>
              </div>
            </div>
            <div className="percentile-note-compact">
              <strong>Note:</strong> Box set prices divided by movie count (e.g., CHF 99 box set ÷ 11 movies = CHF 9 each)
            </div>
          </div>

          {/* Movies Acquired Over Time */}
          <div className="chart-card">
            <h3 className="chart-title">Movies Acquired Over Time</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={analytics.moviesAcquiredOverTime}>
                <defs>
                  <linearGradient id="colorMovies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC143C" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#DC143C" stopOpacity={0.1}/>
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
                <Tooltip content={<CustomTooltip isDate={true} />} />
                <Area type="monotone" dataKey="count" stroke={COLORS.areaCrimson} strokeWidth={3} fillOpacity={1} fill="url(#colorMovies)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Genre Distribution and Format Distribution - Side by Side */}
          <div className="chart-row">
            <div className="chart-card">
              <h3 className="chart-title">Movies by Genre</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                  data={analytics.genreDistribution.slice(0, 10)} 
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                  <YAxis 
                    type="category" 
                    dataKey="genre" 
                    stroke="#a0a0a0" 
                    style={{ fontSize: '12px' }} 
                    width={100}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                    {analytics.genreDistribution.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.genre[index % COLORS.genre.length]} />
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
                    data={analytics.formatDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={110}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="format"
                    label={false}
                  >
                    {analytics.formatDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.format[index % COLORS.format.length]} />
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

          {/* Movies vs TV Shows and Origin Distribution */}
          <div className="chart-row">
            <div className="chart-card">
              <h3 className="chart-title">Movies vs TV Shows</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={analytics.mediaTypeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="type"
                    label={false}
                  >
                    {analytics.mediaTypeDistribution.map((entry) => (
                      <Cell 
                        key={`cell-${entry.type}`} 
                        fill={entry.type === 'Movie' ? COLORS.mediaType.movie : COLORS.mediaType.tvShow} 
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
                  data={analytics.originDistribution.slice(0, 10)} 
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                  <YAxis 
                    type="category" 
                    dataKey="origin" 
                    stroke="#a0a0a0" 
                    style={{ fontSize: '12px' }} 
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                    {analytics.originDistribution.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.genre[index % COLORS.genre.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Movies by Decade and Rating Distribution */}
          <div className="chart-row">
            <div className="chart-card">
              <h3 className="chart-title">Movies by Decade</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analytics.moviesByDecade}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                  <XAxis dataKey="decade" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {analytics.moviesByDecade.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.decade[index % COLORS.decade.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h3 className="chart-title">Rating Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analytics.ratingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                  <XAxis dataKey="rating" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {analytics.ratingDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.rating[index % COLORS.rating.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Age Distribution */}
          <div className="chart-card">
            <h3 className="chart-title">Age Recommendations</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analytics.ageDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="ageRecommendation" stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                <YAxis stroke="#a0a0a0" style={{ fontSize: '12px' }} />
                <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {analytics.ageDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.age[index % COLORS.age.length]} />
                    ))}
                  </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Commercial Success Section */}
          {analytics.commercialSuccess && (
            <>
              <div className="section-divider">
                <h2 className="section-title">Commercial Success Insights</h2>
                <p className="section-subtitle">Budget & Revenue Analysis ({analytics.commercialSuccess.totalMoviesWithData} movies with data)</p>
              </div>

              {/* Commercial Success Overview */}
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
                    <div className="metric-value">{analytics.commercialSuccess.profitableMovies}/{analytics.commercialSuccess.totalMoviesWithData}</div>
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

              {/* ROI by Genre */}
              <div className="chart-card">
                <h3 className="chart-title">Average ROI by Genre</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart 
                    data={analytics.roiByGenre} 
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#a0a0a0" style={{ fontSize: '12px' }} label={{ value: 'ROI %', position: 'insideBottom', offset: -5 }} />
                    <YAxis 
                      type="category" 
                      dataKey="genre" 
                      stroke="#a0a0a0" 
                      style={{ fontSize: '12px' }} 
                      width={100}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="averageROI" radius={[0, 8, 8, 0]}>
                      {analytics.roiByGenre.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS.genre[index % COLORS.genre.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

        </div>

        {/* Sidebar */}
        <div className="sidebar-column">
          {/* Top Directors */}
          <div className="list-card">
            <h3 className="chart-title">Top Directors</h3>
            <div className="custom-list">
              {analytics.topDirectors.slice(0, 10).map((item, index) => (
                <div key={index} className="list-item">
                  <span className="list-rank" style={{ backgroundColor: COLORS.genre[index] }}>{index + 1}</span>
                  <span className="list-name" title={item.director}>
                    {item.director.length > 25 ? item.director.substring(0, 25) + '...' : item.director}
                  </span>
                  <span className="list-value">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Actors */}
          <div className="list-card">
            <h3 className="chart-title">Top Actors</h3>
            <div className="custom-list">
              {analytics.topActors.slice(0, 10).map((item, index) => (
                <div key={index} className="list-item">
                  <span className="list-rank" style={{ backgroundColor: COLORS.genre[index] }}>{index + 1}</span>
                  <span className="list-name" title={item.actor}>
                    {item.actor.length > 25 ? item.actor.substring(0, 25) + '...' : item.actor}
                  </span>
                  <span className="list-value">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Genre-Director Breakdown */}
          {analytics.genreDirectorBreakdown && analytics.genreDirectorBreakdown.slice(0, 2).map((genreData, genreIndex) => (
            <div key={genreIndex} className="list-card">
              <h3 className="chart-title">{genreData.genre} Directors</h3>
              <div className="custom-list">
                {genreData.directors.slice(0, 6).map((item, index) => (
                  <div key={index} className="list-item">
                    <span className="list-rank" style={{ backgroundColor: COLORS.genre[index] }}>
                      {index + 1}
                    </span>
                    <span className="list-name" title={item.director}>
                      {item.director.length > 22 ? item.director.substring(0, 22) + '...' : item.director}
                    </span>
                    <span className="list-value">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Commercial Success Lists */}
          {analytics.topROIMovies && analytics.topROIMovies.length > 0 && (
            <>
              <div className="list-card">
                <h3 className="chart-title">Highest ROI Movies</h3>
                <div className="custom-list">
                  {analytics.topROIMovies.slice(0, 8).map((item, index) => (
                    <div key={index} className="list-item">
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
                  {analytics.topProfitableMovies.slice(0, 8).map((item, index) => (
                    <div key={index} className="list-item">
                      <span className="list-rank" style={{ backgroundColor: '#DC143C' }}>{index + 1}</span>
                      <span className="list-name" title={item.title}>
                        {item.title.length > 20 ? item.title.substring(0, 20) + '...' : item.title}
                      </span>
                      <span className="list-value" style={{ fontSize: '0.75rem' }}>
                        ${(item.profit / 1000000).toFixed(0)}M
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
