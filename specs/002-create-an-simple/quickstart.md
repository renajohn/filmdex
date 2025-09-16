# Quickstart for Movie Collection App

This document describes how to set up and run the Movie Collection App for managing your physical movie collection.

## Prerequisites

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **Google Account** (for creating the Google Sheet and OAuth2 setup)
- **Google Cloud Project** (for API credentials)

## Project Structure

```
pokedex/
├── backend/          # Express.js API server
├── frontend/         # React.js web application
└── specs/           # Project specifications
```

## Google OAuth2 Setup

Before running the application, you need to set up Google OAuth2 credentials:

### Step 1: Create Google Cloud Project

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create a new project** or select an existing one
3. **Enable the Google Sheets API:**
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click on it and press "Enable"

### Step 2: Create OAuth2 Credentials

1. **Go to "APIs & Services" > "Credentials"**
2. **Click "Create Credentials" > "OAuth client ID"**
3. **Choose "Desktop application" as the application type**
4. **Name your OAuth client** (e.g., "Movie Collection App")
5. **Download the credentials JSON file**

### Step 3: Configure Credentials

1. **Copy the downloaded JSON file to the backend directory:**
   ```bash
   cp ~/Downloads/your-credentials.json backend/credentials.json
   ```

2. **Or use the template file:**
   ```bash
   cd backend
   cp credentials.json.template credentials.json
   # Edit credentials.json with your actual client ID and secret
   ```

3. **Update the redirect URI in your Google Cloud Console:**
   - Go back to your OAuth client in Google Cloud Console
   - Add `http://localhost:3001/auth/google/callback` to authorized redirect URIs

## Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This will install: Express.js, SQLite3, Google APIs, CORS, and testing libraries.

3. **Ensure credentials.json is in place:**
   ```bash
   ls -la credentials.json
   ```
   Should show the file exists.

4. **Start the backend server:**
   ```bash
   npm start
   ```
   
   The server will start on `http://localhost:3001` and you should see:
   ```
   Connected to the SQLite database.
   Server is running on port 3001
   ```

5. **Verify the backend is running:**
   ```bash
   curl http://localhost:3001/health
   ```
   Should return: `{"status":"OK","timestamp":"..."}`

## Frontend Setup

1. **Open a new terminal and navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   This will install: React, testing libraries, and other frontend dependencies.

3. **Start the frontend development server:**
   ```bash
   npm start
   ```
   
   The React app will start on `http://localhost:3000` and should automatically open in your browser.

## Usage Guide

### 1. Access the Application

Open your browser and navigate to `http://localhost:3000`. You'll see the Movie Collection Manager with two tabs:
- **Search Movies** - Browse and search your collection
- **Import from Google Sheets** - Import movies from a Google Sheet

### 2. Import Movies from Google Sheets

#### Step 1: Prepare Your Google Sheet

1. **Create a new Google Sheet** with your movie collection
2. **Set up your columns** (the app will auto-detect common column names):
   ```
   Title | Genre | Director | Cast | Year | Format | IMDB Rating | Rotten Tomatoes | Plot | Acquired Date
   ```
3. **Copy the Google Sheet URL** from your browser's address bar

#### Step 2: Authenticate with Google

1. **Click the "Import from Google Sheets" tab**
2. **Click "Authenticate with Google"** button
3. **A popup window will open** asking you to sign in to Google
4. **Sign in with your Google account** and grant permissions
5. **The popup will close automatically** when authentication is complete
6. **You'll see a success message** confirming authentication

#### Step 3: Import the Data

1. **Paste your Google Sheet URL** in the input field
2. **Click "Import Movies"**
3. **Wait for the import to complete** - you'll see a success message with the number of movies imported
4. **Switch to the "Search Movies" tab** to see your imported collection

#### Example Google Sheet Format

| Title | Genre | Director | Cast | Year | Format | IMDB Rating | Rotten Tomatoes | Plot | Acquired Date |
|-------|-------|----------|------|------|--------|-------------|-----------------|------|---------------|
| The Matrix | Action | Lana Wachowski | Keanu Reeves; Laurence Fishburne | 1999 | Blu-ray | 8.7 | 88 | A computer hacker learns about the true nature of reality... | 2023-01-15 |
| Inception | Sci-Fi | Christopher Nolan | Leonardo DiCaprio; Marion Cotillard | 2010 | 4K UHD | 8.8 | 87 | A thief who steals corporate secrets through dream-sharing technology... | 2023-02-20 |

### 3. Search and Browse Your Collection

#### Search Options

Use the **Search Movies** tab to find movies by:

- **Title** - Partial text matching (e.g., "matrix" finds "The Matrix")
- **Genre** - Filter by genre (e.g., "Action", "Comedy", "Drama")
- **Director** - Search by director name
- **Actor** - Search by actor name (searches in cast list)
- **Year** - Exact year match (e.g., 1999)
- **Format** - Physical format (Blu-ray, DVD, 4K UHD)
- **IMDB Rating** - Minimum rating (0.0 to 10.0)
- **Rotten Tomatoes** - Minimum percentage (0 to 100)

#### Search Tips

- **Use multiple criteria** for precise results
- **Leave fields empty** to ignore that criterion
- **Click "Clear"** to reset all search fields and show all movies
- **Results update in real-time** as you type

### 4. View Movie Details

Each movie card displays:
- **Title and Year**
- **Genre and Director**
- **Cast members** (comma-separated)
- **Physical Format**
- **IMDB and Rotten Tomatoes ratings**
- **Plot summary**
- **Acquisition date**

## Troubleshooting

### Backend Issues

**Problem:** "Cannot open database" error
- **Solution:** Ensure you have write permissions in the backend directory

**Problem:** Port 3001 already in use
- **Solution:** Kill the process using port 3001 or change the PORT environment variable

**Problem:** Google Sheets import fails
- **Solution:** Ensure you're authenticated with Google and the URL is correct

**Problem:** "No valid token found" error
- **Solution:** Click "Authenticate with Google" to get a new token

**Problem:** OAuth2 popup doesn't work
- **Solution:** Check that popup blockers are disabled for localhost

**Problem:** "Invalid client" error during authentication
- **Solution:** Verify your credentials.json file is correct and the redirect URI matches

**Problem:** "Access denied" during Google authentication
- **Solution:** Make sure you've enabled the Google Sheets API in your Google Cloud project

### Frontend Issues

**Problem:** Frontend can't connect to backend
- **Solution:** Ensure the backend is running on port 3001

**Problem:** CORS errors
- **Solution:** The backend includes CORS middleware, but ensure both servers are running

**Problem:** Import button doesn't work
- **Solution:** Check browser console for errors and ensure the Google Sheet URL is valid

### Google Sheets Issues

**Problem:** "Invalid Google Sheets URL" error
- **Solution:** Use the full Google Sheets URL, not the sharing link

**Problem:** "Failed to import movies" error
- **Solution:** 
  - Ensure the sheet is publicly accessible
  - Check that the sheet has a header row
  - Verify at least one column contains "title" or similar

## API Endpoints

The backend provides these REST endpoints:

- `GET /movies` - Get all movies
- `GET /movies/search?title=...&genre=...` - Search movies
- `POST /import` - Import from Google Sheets (requires OAuth2)
- `GET /auth/google` - Get Google OAuth2 authorization URL
- `POST /auth/google/callback` - Handle OAuth2 callback
- `GET /health` - Health check

## Development

### Running Tests

**Backend tests:**
```bash
cd backend
npm test
```

**Frontend tests:**
```bash
cd frontend
npm test
```

### Database

The app uses SQLite with a local `db.sqlite` file in the backend directory. The database is automatically created and initialized when the server starts.

### Environment Variables

- `PORT` - Backend server port (default: 3001)
- `REACT_APP_API_URL` - Backend API URL for frontend (default: http://localhost:3001)

## Next Steps

1. **Import your movie collection** from Google Sheets
2. **Explore the search functionality** with different criteria
3. **Add more movies** by updating your Google Sheet and re-importing
4. **Customize the interface** by modifying the React components

## Support

If you encounter issues:
1. Check the browser console for frontend errors
2. Check the backend terminal for server errors
3. Verify your Google Sheet is properly formatted and accessible
4. Ensure both frontend and backend servers are running