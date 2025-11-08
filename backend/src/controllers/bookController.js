const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bookService = require('../services/bookService');
const imageService = require('../services/imageService');
const configManager = require('../config');
const Book = require('../models/book');
const logger = require('../logger');

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

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

// Configure multer for ebook uploads
const ebookStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let ebookDir;
    try {
      ebookDir = configManager.getEbooksPath();
    } catch (error) {
      // Fallback to default if config not loaded
      ebookDir = path.join(__dirname, '..', '..', 'data', 'ebooks');
    }
    // Ensure directory exists
    if (!fs.existsSync(ebookDir)) {
      fs.mkdirSync(ebookDir, { recursive: true });
    }
    cb(null, ebookDir);
  },
  filename: (req, file, cb) => {
    const bookId = req.params.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || path.extname(file.originalname);
    let originalName = path.basename(file.originalname, ext);
    // Remove quotes (straight, curly, or smart quotes) from start and end before sanitizing
    originalName = originalName.replace(/^[""'']+|[""'']+$/g, '').trim();
    // Sanitize filename - replace any remaining special characters with underscores
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `book_${bookId}_${timestamp}_${sanitizedName}${ext}`);
  }
});

const ebookUpload = multer({
  storage: ebookStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max for ebooks
  },
  fileFilter: (req, file, cb) => {
    // Accept common ebook formats
    const allowedTypes = [
      'application/epub+zip',
      'application/x-mobipocket-ebook',
      'application/pdf',
      'application/x-fictionbook+xml',
      'text/plain'
    ];
    const allowedExtensions = ['.epub', '.mobi', '.azw', '.pdf', '.fb2', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only EPUB, MOBI, AZW, PDF, FB2, and TXT files are allowed'), false);
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

  // Get books by status (owned, borrowed, or wish)
  getBooksByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      if (!['owned', 'borrowed', 'wish'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "owned", "borrowed", or "wish"' });
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
      
      if (!['owned', 'borrowed', 'wish'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "owned", "borrowed", or "wish"' });
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

  // Search external book APIs (Google Books, OpenLibrary)
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

  // Upload ebook file for a book
  uploadEbook: async (req, res) => {
    try {
      const { id } = req.params;
      const bookId = parseInt(id, 10);
      
      if (isNaN(bookId)) {
        logger.error(`Invalid book ID: ${id}`);
        return res.status(400).json({ error: 'Invalid book ID' });
      }
      
      if (!req.file) {
        logger.warn(`No file uploaded for book ${bookId}`);
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = req.file;
      logger.info(`Uploading ebook for book ${bookId}: ${file.filename}`);

      // Verify book exists first
      try {
        const existingBook = await Book.findById(bookId);
        if (!existingBook) {
          logger.error(`Book ${bookId} not found`);
          return res.status(404).json({ error: 'Book not found' });
        }
        logger.info(`Book ${bookId} found, current ebook_file: ${existingBook.ebookFile || 'none'}`);
      } catch (checkError) {
        logger.error(`Error checking book ${bookId}:`, checkError);
        return res.status(500).json({ error: 'Failed to verify book exists' });
      }

      // Update only the ebook_file field
      try {
        const result = await Book.updateEbookFile(bookId, file.filename);
        logger.info(`Successfully updated ebook_file for book ${bookId}: ${file.filename}`, result);
        
        if (result.changes === 0) {
          logger.warn(`Warning: No rows were updated for book ${bookId}`);
        }
      } catch (dbError) {
        logger.error(`Database error updating ebook_file for book ${bookId}:`, dbError);
        logger.error(`Database error stack:`, dbError.stack);
        throw dbError;
      }

      // Verify the update by fetching the book
      try {
        const updatedBook = await Book.findById(bookId);
        logger.info(`Verified update - book ${bookId} ebook_file:`, updatedBook?.ebookFile || updatedBook?.ebook_file);
        
        if (!updatedBook?.ebookFile && !updatedBook?.ebook_file) {
          logger.error(`Update verification failed - ebook_file is still empty for book ${bookId}`);
        }
      } catch (verifyError) {
        logger.warn(`Could not verify ebook_file update for book ${bookId}:`, verifyError.message);
      }

      res.json({
        success: true,
        filename: file.filename,
        originalName: req.file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });
    } catch (error) {
      logger.error('Error uploading ebook:', error);
      logger.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to upload ebook: ' + error.message });
    }
  },

  // Get ebook file info
  getEbookInfo: async (req, res) => {
    try {
      const { id } = req.params;
      const bookId = parseInt(id, 10);
      
      if (isNaN(bookId)) {
        return res.status(400).json({ error: 'Invalid book ID' });
      }
      
      const book = await Book.findById(bookId);
      if (!book) {
        return res.status(404).json({ error: 'Book not found' });
      }

      if (!book.ebookFile) {
        return res.status(404).json({ error: 'No ebook file found for this book' });
      }

      let ebookDir;
      try {
        ebookDir = configManager.getEbooksPath();
      } catch (error) {
        ebookDir = path.join(__dirname, '..', '..', 'data', 'ebooks');
      }
      const filePath = path.join(ebookDir, book.ebookFile);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Ebook file not found on server' });
      }

      const stats = fs.statSync(filePath);
      const ext = path.extname(book.ebookFile).toLowerCase();
      const formatMap = {
        '.epub': 'EPUB',
        '.mobi': 'MOBI',
        '.azw': 'AZW',
        '.pdf': 'PDF',
        '.fb2': 'FB2',
        '.txt': 'TXT'
      };
      const format = formatMap[ext] || ext.toUpperCase().replace('.', '');
      // Extract original filename: format is book_{id}_{timestamp}_{originalName}
      // Split by underscore and take everything after index 3 (book, id, timestamp)
      const parts = book.ebookFile.split('_');
      let originalFilename = parts.slice(3).join('_') || book.ebookFile;
      // Remove any quotes (straight, curly, or smart quotes) from start and end
      originalFilename = originalFilename.replace(/^[""'']+|[""'']+$/g, '').trim();

      res.json({
        filename: book.ebookFile,
        originalName: originalFilename,
        format: format,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size)
      });
    } catch (error) {
      logger.error('Error getting ebook info:', error);
      res.status(500).json({ error: 'Failed to get ebook info' });
    }
  },

  // Download ebook file
  downloadEbook: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get book to find ebook filename
      const book = await Book.findById(id);
      if (!book) {
        return res.status(404).json({ error: 'Book not found' });
      }

      if (!book.ebookFile) {
        return res.status(404).json({ error: 'No ebook file found for this book' });
      }

      let ebookDir;
      try {
        ebookDir = configManager.getEbooksPath();
      } catch (error) {
        // Fallback to default if config not loaded
        ebookDir = path.join(__dirname, '..', '..', 'data', 'ebooks');
      }
      const filePath = path.join(ebookDir, book.ebookFile);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Ebook file not found on server' });
      }

      // Get original filename if available, otherwise use stored filename
      let originalFilename = book.ebookFile.split('_').slice(3).join('_') || book.ebookFile;
      // Remove any quotes (straight, curly, or smart quotes) from start and end
      originalFilename = originalFilename.replace(/^[""'']+|[""'']+$/g, '').trim();
      
      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${originalFilename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      logger.error('Error downloading ebook:', error);
      res.status(500).json({ error: 'Failed to download ebook' });
    }
  },

  // Delete ebook file
  deleteEbook: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get book to find ebook filename
      const book = await Book.findById(id);
      if (!book) {
        return res.status(404).json({ error: 'Book not found' });
      }

      if (!book.ebookFile) {
        return res.status(404).json({ error: 'No ebook file found for this book' });
      }

      let ebookDir;
      try {
        ebookDir = configManager.getEbooksPath();
      } catch (error) {
        // Fallback to default if config not loaded
        ebookDir = path.join(__dirname, '..', '..', 'data', 'ebooks');
      }
      const filePath = path.join(ebookDir, book.ebookFile);

      // Delete file if exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted ebook file: ${filePath}`);
      }

      // Update database to remove ebook_file
      await Book.updateEbookFile(id, null);

      res.json({ success: true, message: 'Ebook deleted successfully' });
    } catch (error) {
      logger.error('Error deleting ebook:', error);
      res.status(500).json({ error: 'Failed to delete ebook' });
    }
  },

  // Middleware for ebook upload
  ebookUploadMiddleware: ebookUpload.single('ebook'),

  // Export books to CSV
  exportCSV: async (req, res) => {
    try {
      const books = await bookService.getAllBooks();
      
      // Convert to CSV
      const headers = [
        'Title', 'Authors', 'ISBN', 'ISBN-13', 'Publisher', 'Published Year',
        'Language', 'Format', 'Series', 'Series Number', 'Genres', 'Rating',
        'Owner', 'Title Status', 'Read Date', 'Page Count',
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
        book.titleStatus || 'owned',
        book.readDate || '',
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

