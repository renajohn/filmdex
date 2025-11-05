const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bookService = require('../services/bookService');
const imageService = require('../services/imageService');
const Book = require('../models/book');
const logger = require('../logger');

// Configure multer for cover uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const customCoverDir = path.join(imageService.getLocalImagesDir(), 'book', 'custom');
    // Ensure directory exists
    if (!fs.existsSync(customCoverDir)) {
      fs.mkdirSync(customCoverDir, { recursive: true });
    }
    cb(null, customCoverDir);
  },
  filename: (req, file, cb) => {
    const bookId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `book_${bookId}_${timestamp}${ext}`);
  }
});

const coverUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

const bookController = {
  // Get all books
  getAllBooks: async (req, res) => {
    try {
      const books = await bookService.getAllBooks();
      res.json(books);
    } catch (error) {
      console.error('Error getting all books:', error);
      res.status(500).json({ error: 'Failed to get books' });
    }
  },

  // Get books by status (owned or wish)
  getBooksByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      if (!['owned', 'wish'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "owned" or "wish"' });
      }
      
      const books = await bookService.getBooksByStatus(status);
      res.json(books);
    } catch (error) {
      console.error('Error getting books by status:', error);
      res.status(500).json({ error: 'Failed to get books by status' });
    }
  },

  // Update book status
  updateBookStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['owned', 'wish'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "owned" or "wish"' });
      }
      
      const result = await bookService.updateBookStatus(id, status);
      res.json(result);
    } catch (error) {
      console.error('Error updating book status:', error);
      res.status(500).json({ error: 'Failed to update book status' });
    }
  },

  // Get book by ID
  getBookById: async (req, res) => {
    try {
      const { id } = req.params;
      const book = await bookService.getBookById(id);
      res.json(book);
    } catch (error) {
      console.error('Error getting book by ID:', error);
      if (error.message === 'Book not found') {
        res.status(404).json({ error: 'Book not found' });
      } else {
        res.status(500).json({ error: 'Failed to get book' });
      }
    }
  },

  // Add new book
  addBook: async (req, res) => {
    try {
      const bookData = req.body;
      const book = await bookService.addBook(bookData);
      res.status(201).json(book);
    } catch (error) {
      console.error('Error adding book:', error);
      if (error.message === 'Book with this ISBN already exists in collection') {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to add book' });
      }
    }
  },

  // Batch add books
  addBooksBatch: async (req, res) => {
    try {
      const { books } = req.body;
      if (!Array.isArray(books) || books.length === 0) {
        return res.status(400).json({ error: 'Books array is required' });
      }
      
      const result = await bookService.addBooksBatch(books);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error adding books batch:', error);
      res.status(500).json({ error: 'Failed to add books batch' });
    }
  },

  // Update book
  updateBook: async (req, res) => {
    try {
      const { id } = req.params;
      const bookData = req.body;
      const book = await bookService.updateBook(id, bookData);
      res.json(book);
    } catch (error) {
      console.error('Error updating book:', error);
      res.status(500).json({ error: 'Failed to update book' });
    }
  },

  // Delete book
  deleteBook: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await bookService.deleteBook(id);
      if (result.deleted) {
        res.json({ message: 'Book deleted successfully' });
      } else {
        res.status(404).json({ error: 'Book not found' });
      }
    } catch (error) {
      console.error('Error deleting book:', error);
      res.status(500).json({ error: 'Failed to delete book' });
    }
  },

  // Search books
  searchBooks: async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const books = await bookService.searchBooks(q);
      res.json(books);
    } catch (error) {
      console.error('Error searching books:', error);
      res.status(500).json({ error: 'Failed to search books' });
    }
  },

  // Search external book APIs (Babelio, Google Books, OpenLibrary)
  searchExternalBooks: async (req, res) => {
    try {
      const { q, isbn, author, title, limit, language } = req.query;
      
      if (!q && !isbn && !author && !title) {
        return res.status(400).json({ error: 'Search query, ISBN, author, or title is required' });
      }
      
      const filters = {
        isbn: isbn || null,
        author: author || null,
        title: title || null,
        limit: limit ? parseInt(limit) : 20,
        language: language || 'any'
      };
      
      const query = q || '';
      const books = await bookService.searchExternalBooks(query, filters);
      res.json(books);
    } catch (error) {
      console.error('Error searching external books:', error);
      res.status(500).json({ error: 'Failed to search external books' });
    }
  },

  // Search for all volumes in a series
  searchSeriesVolumes: async (req, res) => {
    try {
      const { series, language, maxVolumes } = req.query;
      
      if (!series) {
        return res.status(400).json({ error: 'Series name is required' });
      }
      
      const options = {
        language: language || 'any',
        maxVolumes: maxVolumes ? parseInt(maxVolumes) : 50
      };
      
      const volumes = await bookService.searchSeriesVolumes(series, options);
      res.json(volumes);
    } catch (error) {
      console.error('Error searching series volumes:', error);
      res.status(500).json({ error: 'Failed to search series volumes' });
    }
  },

  // Get existing books in a series
  getBooksBySeries: async (req, res) => {
    try {
      const { series } = req.query;
      
      if (!series) {
        return res.status(400).json({ error: 'Series name is required' });
      }
      
      const books = await bookService.getBooksBySeries(series);
      res.json(books);
    } catch (error) {
      console.error('Error getting books by series:', error);
      res.status(500).json({ error: 'Failed to get books by series' });
    }
  },

  // Get autocomplete suggestions
  getAutocompleteSuggestions: async (req, res) => {
    try {
      const { field, value } = req.query;
      
      if (!field) {
        return res.status(400).json({ error: 'Field parameter is required' });
      }
      
      const suggestions = await bookService.getAutocompleteSuggestions(field, value || '');
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      res.status(500).json({ error: 'Failed to get autocomplete suggestions' });
    }
  },

  // Enrich a book with OpenLibrary data
  enrichBook: async (req, res) => {
    try {
      const bookData = req.body;
      
      if (!bookData) {
        return res.status(400).json({ error: 'Book data is required' });
      }
      
      const enrichedBook = await bookService.enrichBook(bookData);
      res.json(enrichedBook);
    } catch (error) {
      console.error('Error enriching book:', error);
      res.status(500).json({ error: 'Failed to enrich book' });
    }
  },

  // Upload custom cover for a book
  uploadCustomCover: async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = req.file;
      logger.info(`Uploading custom cover for book ${id}: ${file.filename}`);

      // Resize the image to max 1200x1200
      let width = 500;
      let height = 500;
      
      try {
        await imageService.resizeImage(file.path, file.path, 1200, 1200);
        
        // Get updated dimensions after resize
        const sharp = require('sharp');
        const metadata = await sharp(file.path).metadata();
        width = metadata.width;
        height = metadata.height;
        logger.info(`Cover resized to ${width}x${height}`);
      } catch (error) {
        // If resize fails, log but continue
        logger.warn('Failed to resize cover image:', error.message);
      }

      // Construct the cover path using API endpoint (works with Home Assistant ingress)
      const coverPath = `/api/images/book/custom/${file.filename}`;

      // Update only the cover field
      await Book.updateCover(id, coverPath);

      res.json({
        success: true,
        coverPath: coverPath,
        filename: file.filename,
        width,
        height
      });
    } catch (error) {
      logger.error('Error uploading custom cover:', error);
      res.status(500).json({ error: 'Failed to upload custom cover' });
    }
  },

  // Middleware for cover upload
  coverUploadMiddleware: coverUpload.single('cover'),

  // Export books to CSV
  exportCSV: async (req, res) => {
    try {
      const books = await bookService.getAllBooks();
      
      // Convert to CSV
      const headers = [
        'Title', 'Authors', 'ISBN', 'ISBN-13', 'Publisher', 'Published Year',
        'Language', 'Format', 'Series', 'Series Number', 'Genres', 'Rating',
        'Owner', 'Borrowed', 'Borrowed Date', 'Returned Date', 'Page Count',
        'Narrator', 'Runtime', 'Filetype', 'DRM', 'Created At'
      ];
      
      const rows = books.map(book => [
        book.title || '',
        Array.isArray(book.authors) ? book.authors.join('; ') : '',
        book.isbn || '',
        book.isbn13 || '',
        book.publisher || '',
        book.publishedYear || '',
        book.language || '',
        book.format || '',
        book.series || '',
        book.seriesNumber || '',
        Array.isArray(book.genres) ? book.genres.join('; ') : '',
        book.rating || '',
        book.owner || '',
        book.borrowed ? 'Yes' : 'No',
        book.borrowedDate || '',
        book.returnedDate || '',
        book.pageCount || '',
        book.narrator || '',
        book.runtime || '',
        book.filetype || '',
        book.drm || '',
        book.createdAt || ''
      ]);
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=books.csv');
      res.send(csv);
    } catch (error) {
      console.error('Error exporting books to CSV:', error);
      res.status(500).json({ error: 'Failed to export books to CSV' });
    }
  }
};

module.exports = bookController;

