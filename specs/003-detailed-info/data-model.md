# Data Model: Movie Detail View

## Movie (Local Database)
- **title**: TEXT
- **plot**: TEXT
- **genre**: TEXT
- **imdb_rating**: REAL
- **rotten_tomatoes_rating**: REAL
- **year**: INTEGER
- **format**: TEXT
- **date_of_acquisition**: TEXT

## MovieDetails (TMDB API)
- **poster_path**: TEXT
- **adult**: BOOLEAN
- **overview**: TEXT
- **release_date**: TEXT
- **genres**: ARRAY
- **id**: INTEGER
- **original_title**: TEXT
- **original_language**: TEXT
- **title**: TEXT
- **backdrop_path**: TEXT
- **popularity**: REAL
- **vote_count**: INTEGER
- **video**: BOOLEAN
- **vote_average**: REAL
- **credits**: OBJECT
  - **cast**: ARRAY
    - **name**: TEXT
    - **profile_path**: TEXT
  - **crew**: ARRAY
- **videos**: OBJECT
  - **results**: ARRAY
    - **key**: TEXT (YouTube key)
    - **site**: TEXT
    - **type**: TEXT (e.g., "Trailer")