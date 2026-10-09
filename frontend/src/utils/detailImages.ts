import musicService from '../services/musicService';
import bookService from '../services/bookService';

// The images each details card shows for an item, to fetch them ahead of a step.

export function movieImages(movie: any): Array<string | null> {
  const local = (path?: string | null) =>
    !path ? null : path.startsWith('http') || path.startsWith('/') ? path : `/api/images/${path}`;
  return [local(movie.poster_path), local(movie.backdrop_path)];
}

export function albumImages(album: any): Array<string | null> {
  return [musicService.getImageUrl(album.cover), musicService.getImageUrl(album.backCover)];
}

export function bookImages(book: any): Array<string | null> {
  return [bookService.getImageUrl(book.cover)];
}
