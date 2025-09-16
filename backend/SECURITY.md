# Backend Security Guidelines

## 🔒 API Security

### Input Validation

All API endpoints implement comprehensive input validation:

```javascript
// Example: Movie creation validation
const validateMovie = (movie) => {
  if (!movie.title || typeof movie.title !== 'string') {
    throw new Error('Title is required and must be a string');
  }
  if (movie.year && (movie.year < 1800 || movie.year > 2030)) {
    throw new Error('Year must be between 1800 and 2030');
  }
  // Additional validation...
};
```

### SQL Injection Prevention

All database queries use parameterized statements:

```javascript
// ✅ Safe - Parameterized query
const stmt = db.prepare('SELECT * FROM movies WHERE title = ?');
const movies = stmt.all(title);

// ❌ Dangerous - String concatenation
const query = `SELECT * FROM movies WHERE title = '${title}'`;
```

### CORS Configuration

CORS is properly configured for frontend access:

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## 🛡️ File Upload Security

### CSV Import Validation

```javascript
// File type validation
if (!file.mimetype.includes('text/csv')) {
  throw new Error('Only CSV files are allowed');
}

// File size validation
if (file.size > maxUploadBytes) {
  throw new Error('File too large');
}

// Content validation
const csvContent = file.buffer.toString('utf8');
if (!isValidCSV(csvContent)) {
  throw new Error('Invalid CSV format');
}
```

### Image Upload Security

```javascript
// Allowed image types
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

// File extension validation
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

// Image size limits
const maxImageSize = 5 * 1024 * 1024; // 5MB
```

## 🔐 API Key Management

### Environment Variable Security

```javascript
// Never log API keys
const apiKey = process.env.TMDB_API_KEY;
if (!apiKey) {
  logger.warn('TMDB API key not configured');
  return;
}

// Mask API keys in logs
logger.info(`API key configured: ${apiKey.substring(0, 8)}...`);
```

### External API Security

```javascript
// Rate limiting for external APIs
const rateLimiter = {
  tmdb: new Map(),
  omdb: new Map()
};

// Request timeout
const apiTimeout = 10000; // 10 seconds

// Error handling for external APIs
try {
  const response = await fetch(apiUrl, {
    timeout: apiTimeout,
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
} catch (error) {
  logger.error('External API error:', error.message);
  throw new Error('External service unavailable');
}
```

## 🗄️ Database Security

### Connection Security

```javascript
// Database file permissions
const dbPath = path.join(dataPath, 'db.sqlite');
fs.chmodSync(dbPath, 0o600); // Read/write for owner only

// Connection validation
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');
});
```

### Query Security

```javascript
// Prepared statements for all queries
const getMovieById = db.prepare('SELECT * FROM movies WHERE id = ?');
const searchMovies = db.prepare(`
  SELECT * FROM movies 
  WHERE title LIKE ? 
  AND year = ? 
  LIMIT ? OFFSET ?
`);

// Input sanitization
const sanitizeInput = (input) => {
  return input.replace(/[<>\"'%;()&+]/g, '');
};
```

## 📝 Logging Security

### Sensitive Data Protection

```javascript
// Never log sensitive data
logger.info('User login attempt', { userId, ip: req.ip });
// ❌ Don't log: password, API keys, tokens

// Mask sensitive data in logs
const maskApiKey = (key) => key ? `${key.substring(0, 8)}...` : 'not set';
logger.info('API key status:', { tmdb: maskApiKey(tmdbKey) });
```

### Log Rotation

```javascript
// Log file management
const logConfig = {
  maxSize: '10m',
  maxFiles: 5,
  compress: true
};
```

## 🔍 Error Handling Security

### Information Disclosure Prevention

```javascript
// Don't expose internal errors to clients
app.use((error, req, res, next) => {
  logger.error('Internal error:', error);
  
  // Generic error response
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});
```

### Error Logging

```javascript
// Log security-relevant errors
if (error.code === 'SQLITE_CONSTRAINT') {
  logger.warn('Database constraint violation:', {
    error: error.message,
    query: error.sql,
    ip: req.ip
  });
}
```

## 🚀 Deployment Security

### Environment Configuration

```javascript
// Validate required environment variables
const requiredEnvVars = ['NODE_ENV', 'PORT'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  logger.error('Missing required environment variables:', missingVars);
  process.exit(1);
}
```

### Process Security

```javascript
// Run with limited privileges
process.setuid('filmdex');
process.setgid('filmdex');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});
```

## 🔒 Data Protection

### Personal Data Handling

```javascript
// Minimize data collection
const movieData = {
  title: sanitizeInput(movie.title),
  year: parseInt(movie.year),
  // Only collect necessary fields
};

// Data retention
const cleanupOldData = () => {
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
  db.run('DELETE FROM temp_imports WHERE created_at < ?', [cutoffDate]);
};
```

### Data Encryption

```javascript
// Encrypt sensitive data at rest
const crypto = require('crypto');
const algorithm = 'aes-256-gcm';

const encrypt = (text, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  // Implementation...
};
```

## 🛠️ Security Monitoring

### Audit Logging

```javascript
// Log security events
const auditLog = (event, details) => {
  logger.info('Security event:', {
    event,
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    ...details
  });
};

// Usage
auditLog('FILE_UPLOAD', { fileName, fileSize, fileType });
auditLog('API_KEY_USAGE', { service: 'tmdb', endpoint: '/search' });
```

### Health Checks

```javascript
// Security health check
app.get('/api/health/security', (req, res) => {
  const securityStatus = {
    apiKeysConfigured: !!(tmdbKey && omdbKey),
    databaseAccessible: checkDatabaseConnection(),
    filePermissions: checkFilePermissions(),
    lastSecurityCheck: new Date().toISOString()
  };
  
  res.json(securityStatus);
});
```

## ⚠️ Security Checklist

### Before Deployment

- [ ] All API keys are in environment variables
- [ ] Database file has correct permissions (600)
- [ ] Input validation is implemented
- [ ] SQL injection prevention is in place
- [ ] CORS is properly configured
- [ ] Error handling doesn't expose internals
- [ ] Logging doesn't include sensitive data
- [ ] File uploads are validated
- [ ] Rate limiting is implemented
- [ ] Security headers are set

### Regular Maintenance

- [ ] Rotate API keys regularly
- [ ] Update dependencies for security patches
- [ ] Review access logs
- [ ] Monitor for suspicious activity
- [ ] Backup data securely
- [ ] Test security measures

## 📞 Security Incident Response

### If a Security Issue is Discovered

1. **Immediate Response**:
   - Isolate affected systems
   - Preserve evidence
   - Notify stakeholders

2. **Investigation**:
   - Review logs
   - Identify scope of impact
   - Determine root cause

3. **Remediation**:
   - Apply fixes
   - Update security measures
   - Monitor for recurrence

4. **Post-Incident**:
   - Document lessons learned
   - Update security procedures
   - Conduct security review
