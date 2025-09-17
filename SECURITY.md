# Security Guidelines for FilmDex

## 🔒 Environment Variables & API Keys

### ✅ **What's Protected**

The build system automatically excludes the following from Docker images:

- `.env` files (all variants)
- API keys and secrets
- Development credentials
- Local configuration files
- Data directory contents

### ��️ **Security Features**

1. **Comprehensive .dockerignore**: Excludes all environment files
2. **Build-time Security Check**: Warns if .env files are detected in dist
3. **No Hardcoded Secrets**: All sensitive data comes from environment variables
4. **Data Volume Mounting**: Database and images are mounted as volumes, not copied

### 📋 **Environment Variables**

The application expects these environment variables to be set at runtime:

```bash
# API Keys (set these in your deployment environment)
TMDB_API_KEY=your_tmdb_key_here
OMDB_API_KEY=your_omdb_key_here

# Application Settings
NODE_ENV=production
PORT=3001
```

### 🔧 **Configuration Files**

#### Data Configuration (`data/config.json`)
```json
{
  "tmdb_api_key": "your_tmdb_key_here",
  "omdb_api_key": "your_omdb_key_here",
  "log_level": "info",
  "max_upload_mb": 20,
}
```

#### Deployment Configuration
- `deployment.dev.json` - Development settings
- `deployment.prod.json` - Production settings

### 🐳 **Docker Security**

When building Docker images:

1. **Never include .env files** - They are automatically excluded
2. **Use environment variables** - Pass secrets at runtime
3. **Volume mounting** - Data directory is mounted as volume
4. **Multi-stage builds** - Only production dependencies included

### 🚀 **Deployment Best Practices**

#### Local Development
```bash
# .env files are used for local development
npm run dev
```

#### Production Deployment
```bash
# Environment variables are passed at runtime
docker run -e TMDB_API_KEY=xxx -e OMDB_API_KEY=yyy filmdex:latest
```

#### Docker Compose
```yaml
version: '3.8'
services:
  filmdex:
    image: filmdex:latest
    ports:
      - "3001:3001"
    volumes:
      - ./data:/data
    environment:
      - TMDB_API_KEY=${TMDB_API_KEY}
      - OMDB_API_KEY=${OMDB_API_KEY}
    env_file:
      - .env.production
```

### ⚠️ **Security Warnings**

1. **Never commit .env files** to version control
2. **Never hardcode API keys** in source code
3. **Always use environment variables** in production
4. **Regularly rotate API keys**
5. **Secure your data directory** with proper permissions
6. **Use HTTPS in production** for API endpoints

### 🔍 **Verification**

The build system includes security checks that will warn you if:
- `.env` files are found in the dist directory
- `.dockerignore` is not properly configured
- Sensitive files might be included in Docker images

### 📁 **File Structure**

```
project/
├── .env                    # ❌ Excluded from Docker
├── backend/.env           # ❌ Excluded from Docker
├── data/                  # ✅ Mounted as volume
│   ├── config.json        # ✅ Runtime configuration
│   ├── db.sqlite          # ✅ Persistent data
│   └── images/            # ✅ Movie images
├── dist/                  # ✅ Docker build context
│   ├── .dockerignore      # ✅ Excludes sensitive files
│   └── ...
├── deployment.dev.json    # ✅ Development config
└── deployment.prod.json   # ✅ Production config
```

### 🔐 **API Key Management**

#### TMDB API Key
- Get from: https://www.themoviedb.org/settings/api
- Used for: Movie metadata, posters, cast/crew data
- Rate limits: 40 requests per 10 seconds

#### OMDB API Key
- Get from: http://www.omdbapi.com/apikey.aspx
- Used for: Additional movie details, ratings
- Rate limits: 1000 requests per day (free tier)

### 🛠️ **Troubleshooting**

If you see security warnings during build:

1. Check that `.env` files are not being copied to dist
2. Verify `.dockerignore` contains `.env` patterns
3. Ensure API keys are passed as environment variables at runtime
4. Verify data directory permissions are correct

### 📞 **Support**

If you have security concerns or questions, please review this document and the build system output for guidance.

## 🔒 **Additional Security Considerations**

### Database Security
- SQLite database is stored in mounted volume
- No network access required for database
- Consider encrypting sensitive data if needed

### Image Security
- Images are stored locally in data directory
- No external image hosting required
- Consider image optimization for storage efficiency

### Network Security
- API endpoints are prefixed with `/api/`
- CORS is configured for frontend access
- Consider adding authentication for production use
