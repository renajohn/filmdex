import React, { useState, useEffect } from 'react';
import './ColumnMappingModal.css';

const ColumnMappingModal = ({ 
  isOpen, 
  onClose, 
  sheetHeaders = [], 
  onConfirm, 
  onCancel,
  cachedMapping = null
}) => {
  const [mappings, setMappings] = useState({});
  const [errors, setErrors] = useState({});

  // Available database fields (from spec) - moved outside component to prevent recreation
  const dbFields = [
    { key: 'title', label: 'Title', required: true },
    { key: 'original_title', label: 'Original Title', required: false },
    { key: 'comments', label: 'Comments', required: false },
    { key: 'price', label: 'Price (CHF)', required: false },
    { key: 'acquired_date', label: 'Acquired Date', required: false },
    { key: 'format', label: 'Format', required: false }
  ];

  useEffect(() => {
    if (isOpen && sheetHeaders.length > 0) {
      if (cachedMapping) {
        // Use cached mapping if available
        setMappings(cachedMapping);
      } else {
        // Auto-map common column names
        const autoMappings = {};
        dbFields.forEach(field => {
          const matchingHeader = sheetHeaders.find(header => {
            const headerLower = header.toLowerCase().trim();
            const fieldKeyLower = field.key.toLowerCase();
            
            // Direct match
            if (headerLower === fieldKeyLower) return true;
            
            // Contains match
            if (headerLower.includes(fieldKeyLower) || fieldKeyLower.includes(headerLower)) return true;
            
            // Special mappings for common variations (only for spec fields)
            const specialMappings = {
              'title': ['movie title', 'name', 'film', 'movie'],
              'original_title': ['original title', 'original name', 'foreign title'],
              'comments': ['comments', 'notes', 'remarks'],
              'price': ['price', 'cost', 'purchase price', 'amount paid'],
              'acquired_date': ['acquired', 'purchase date', 'date acquired', 'acquired date'],
              'format': ['format', 'medium', 'type', 'disk type']
            };
            
            const variations = specialMappings[fieldKeyLower] || [];
            return variations.some(variation => headerLower.includes(variation));
          });
          
          if (matchingHeader) {
            autoMappings[field.key] = matchingHeader;
          }
        });
        setMappings(autoMappings);
      }
    }
  }, [isOpen, sheetHeaders, cachedMapping]);

  const handleMappingChange = (dbField, sheetHeader) => {
    setMappings(prev => ({
      ...prev,
      [dbField]: sheetHeader
    }));
    
    // Clear error when user makes a selection
    if (errors[dbField]) {
      setErrors(prev => ({
        ...prev,
        [dbField]: null
      }));
    }
  };

  const validateMappings = () => {
    const newErrors = {};
    dbFields.forEach(field => {
      if (field.required && !mappings[field.key]) {
        newErrors[field.key] = `${field.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (validateMappings()) {
      onConfirm(mappings);
    }
  };

  const handleCancel = () => {
    setMappings({});
    setErrors({});
    onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content column-mapping-modal">
        <div className="modal-header">
          <h2>Map Columns</h2>
          <p>Map your CSV columns to the movie database fields</p>
        </div>
        
        <div className="mapping-container">
          {dbFields.map(field => (
            <div key={field.key} className="mapping-row">
              <div className="field-label">
                <span className="field-name">{field.label}</span>
                {field.required && <span className="required">*</span>}
              </div>
              
              <select
                value={mappings[field.key] || ''}
                onChange={(e) => handleMappingChange(field.key, e.target.value)}
                className={`mapping-select ${errors[field.key] ? 'error' : ''}`}
              >
                <option value="">Select a column...</option>
                {sheetHeaders.map(header => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              
              {errors[field.key] && (
                <span className="error-message">{errors[field.key]}</span>
              )}
            </div>
          ))}
        </div>
        
        <div className="modal-footer">
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={handleConfirm}
          >
            Process CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnMappingModal;
