import MovieCast from '../models/movieCast';
import MovieCrew from '../models/movieCrew';
import imageService from './imageService';
import logger from '../logger';
import type { MovieCastData, MovieCrewData } from '../types';

export interface TMDBCredits {
  cast?: Array<{
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
  }>;
  crew?: Array<{
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }>;
}

const movieCreditsService = {
  // Process cast and crew for a movie
  processCastAndCrew: async (movieId: number, credits: TMDBCredits | undefined, tmdbId: number): Promise<void> => {
    try {
      // Clear existing cast and crew
      await MovieCast.deleteByMovieId(movieId);
      await MovieCrew.deleteByMovieId(movieId);

      // Process cast (first 10 actors)
      if (credits?.cast) {
        const castMembers: MovieCastData[] = [];
        for (let i = 0; i < Math.min(credits.cast.length, 10); i++) {
          const actor = credits.cast[i];
          logger.debug(`Processing actor ${i}: ${actor.name} (ID: ${actor.id}, profile: ${actor.profile_path})`);
          const localProfilePath = await imageService.downloadProfile(
            actor.profile_path,
            tmdbId
          );

          castMembers.push({
            movie_id: movieId,
            tmdb_cast_id: actor.id,
            name: actor.name,
            character: actor.character,
            profile_path: actor.profile_path,
            local_profile_path: localProfilePath,
            order_index: i
          });
        }

        if (castMembers.length > 0) {
          await MovieCast.createMultiple(castMembers);
          logger.debug(`Created ${castMembers.length} cast members for movie ${movieId}`);
        }
      }

      // Process crew (only director)
      if (credits?.crew) {
        const director = credits.crew.find(person => person.job === 'Director');
        if (director) {
          const localProfilePath = await imageService.downloadProfile(
            director.profile_path,
            tmdbId,
            director.id
          );

          const crewMembers: MovieCrewData[] = [{
            movie_id: movieId,
            tmdb_crew_id: director.id,
            name: director.name,
            job: director.job,
            department: director.department,
            profile_path: director.profile_path,
            local_profile_path: localProfilePath
          }];

          await MovieCrew.createMultiple(crewMembers);
          logger.debug(`Created director for movie ${movieId}: ${director.name}`);
        }
      }
    } catch (error) {
      console.error(`Error processing cast and crew for movie ${movieId}:`, error);
    }
  },};

export default movieCreditsService;
