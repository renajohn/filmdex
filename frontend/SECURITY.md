# Frontend Security Guidelines

## 🔒 Client-Side Security

### Input Validation

All user inputs are validated on the client side:

```javascript
// Form validation
const validateMovieForm = (formData) => {
  const errors = {};
  
  if (!formData.title?.trim()) {
    errors.title = 'Title is required';
  }
  
  if (formData.year && (formData.year < 1800 || formData.year > 2030)) {
    errors.year = 'Year must be between 1800 and 2030';
  }
  
  return errors;
};
```

### XSS Prevention

All user-generated content is properly escaped:

```javascript
// Safe HTML rendering
const renderPlot = (plot) => {
  return <p dangerouslySetInnerHTML={{ __html: escapeHtml(plot) }} />;
};

// HTML escaping utility
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};
```

### CSRF Protection

API requests include CSRF tokens when available:

```javascript
// CSRF token handling
const getCSRFToken = () => {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
};

// Include in API requests
const apiRequest = async (url, options = {}) => {
  const token = getCSRFToken();
  return fetch(url, {
    ...options,
    headers: {
      'X-CSRF-Token': token,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
};
```

## 🛡️ File Upload Security

### File Type Validation

```javascript
// Validate file types
const validateFileType = (file) => {
  const allowedTypes = ['text/csv'];
  return allowedTypes.includes(file.type);
};

// Validate file size
const validateFileSize = (file, maxSize = 20 * 1024 * 1024) => {
  return file.size <= maxSize;
};

// Complete file validation
const validateFile = (file) => {
  const errors = [];
  
  if (!validateFileType(file)) {
    errors.push('Only CSV files are allowed');
  }
  
  if (!validateFileSize(file)) {
    errors.push('File size must be less than 20MB');
  }
  
  return errors;
};
```

### File Content Validation

```javascript
// Validate CSV content
const validateCSVContent = (content) => {
  const lines = content.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }
  
  // Check for malicious content
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i
  ];
  
  for (const line of lines) {
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(line)) {
        throw new Error('CSV contains potentially malicious content');
      }
    }
  }
};
```

## 🔐 API Security

### Secure API Communication

```javascript
// API service with security headers
class ApiService {
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers
      },
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    return response.json();
  }
}
```

### Error Handling

```javascript
// Secure error handling
const handleApiError = (error) => {
  console.error('API Error:', error);
  
  // Don't expose sensitive error details
  const userMessage = error.message.includes('Network')
    ? 'Network error. Please check your connection.'
    : 'An error occurred. Please try again.';
    
  return userMessage;
};
```

## 🖼️ Image Security

### Image URL Validation

```javascript
// Validate image URLs
const validateImageUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS and local images
    if (parsedUrl.protocol !== 'https:' && !parsedUrl.hostname.includes('localhost')) {
      return false;
    }
    
    // Check for allowed domains
    const allowedDomains = [
      'image.tmdb.org',
      'localhost',
      '127.0.0.1'
    ];
    
    return allowedDomains.some(domain => parsedUrl.hostname.includes(domain));
  } catch {
    return false;
  }
};
```

### Safe Image Rendering

```javascript
// Safe image component
const SafeImage = ({ src, alt, ...props }) => {
  const [isValid, setIsValid] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    if (validateImageUrl(src)) {
      setIsValid(true);
    } else {
      setHasError(true);
    }
  }, [src]);
  
  if (hasError || !isValid) {
    return <div className="image-placeholder">No image available</div>;
  }
  
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      {...props}
    />
  );
};
```

## 🔍 Data Sanitization

### Input Sanitization

```javascript
// Sanitize user input
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>\"'%;()&+]/g, '') // Remove potentially dangerous characters
    .substring(0, 1000); // Limit length
};
```

### Output Encoding

```javascript
// Encode output for safe display
const encodeOutput = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Safe text rendering
const SafeText = ({ children }) => {
  const encodedText = encodeOutput(children);
  return <span dangerouslySetInnerHTML={{ __html: encodedText }} />;
};
```

## 🚀 Build Security

### Environment Variables

```javascript
// Secure environment variable usage
const config = {
  apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:3001',
  // Never expose sensitive data in environment variables
  // API keys should be handled by the backend
};
```

### Content Security Policy

```html
<!-- Add CSP meta tag to index.html -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline'; 
               img-src 'self' data: https://image.tmdb.org; 
               connect-src 'self' https://api.themoviedb.org;">
```

## 🔒 State Security

### Sensitive Data Handling

```javascript
// Don't store sensitive data in component state
const [userData, setUserData] = useState({
  // ✅ Safe to store
  preferences: {},
  theme: 'light',
  
  // ❌ Never store
  // apiKeys: '',
  // passwords: '',
  // tokens: ''
});
```

### Local Storage Security

```javascript
// Secure local storage usage
const secureStorage = {
  set: (key, value) => {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  },
  
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      return null;
    }
  },
  
  remove: (key) => {
    localStorage.removeItem(key);
  }
};
```

## 🛡️ Component Security

### Props Validation

```javascript
// Validate component props
const MovieCard = ({ movie, onSelect }) => {
  // Validate required props
  if (!movie || typeof movie !== 'object') {
    console.error('MovieCard: Invalid movie prop');
    return null;
  }
  
  if (typeof onSelect !== 'function') {
    console.error('MovieCard: onSelect must be a function');
    return null;
  }
  
  // Component implementation...
};
```

### Event Handler Security

```javascript
// Secure event handlers
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  
  if (!file) return;
  
  // Validate file before processing
  const errors = validateFile(file);
  if (errors.length > 0) {
    setError(errors.join(', '));
    return;
  }
  
  // Process file safely
  processFile(file);
};
```

## 🔍 Security Testing

### Input Testing

```javascript
// Test malicious inputs
const testSecurity = () => {
  const maliciousInputs = [
    '<script>alert("xss")</script>',
    'javascript:alert("xss")',
    '"><img src=x onerror=alert("xss")>',
    '${7*7}',
    '{{7*7}}'
  ];
  
  maliciousInputs.forEach(input => {
    const result = sanitizeInput(input);
    console.assert(!result.includes('<script>'), 'XSS prevention failed');
  });
};
```

### API Security Testing

```javascript
// Test API security
const testApiSecurity = async () => {
  try {
    // Test with invalid data
    await apiService.addMovie({
      title: '<script>alert("xss")</script>',
      year: 'invalid'
    });
  } catch (error) {
    console.assert(error.message.includes('validation'), 'Input validation failed');
  }
};
```

## ⚠️ Security Checklist

### Development

- [ ] All inputs are validated
- [ ] Output is properly encoded
- [ ] No sensitive data in client state
- [ ] File uploads are validated
- [ ] Image URLs are validated
- [ ] API errors are handled securely
- [ ] XSS prevention is implemented
- [ ] CSRF protection is in place

### Production

- [ ] CSP headers are configured
- [ ] HTTPS is enforced
- [ ] Secure cookies are used
- [ ] Content is properly encoded
- [ ] Error messages don't expose internals
- [ ] Dependencies are up to date
- [ ] Security headers are set

## 📞 Security Incident Response

### If a Security Issue is Discovered

1. **Immediate Response**:
   - Remove malicious content
   - Block suspicious requests
   - Notify backend team

2. **Investigation**:
   - Review client-side code
   - Check for data exposure
   - Analyze attack vectors

3. **Remediation**:
   - Fix security vulnerabilities
   - Update validation rules
   - Enhance security measures

4. **Prevention**:
   - Update security guidelines
   - Conduct security review
   - Implement additional safeguards
