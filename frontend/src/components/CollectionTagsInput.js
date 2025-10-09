import React, { useState, useEffect, useRef } from 'react';
import { FormControl, Dropdown, Badge, Button } from 'react-bootstrap';
import { BsX, BsPlus } from 'react-icons/bs';
import apiService from '../services/api';
import './CollectionTagsInput.css';

const CollectionTagsInput = ({ 
  value = [], 
  onChange, 
  placeholder = "Add collections...", 
  disabled = false,
  movieId = null 
}) => {
  const [tags, setTags] = useState(value);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Update tags when value prop changes
  useEffect(() => {
    setTags(value);
  }, [value]);

  // Load suggestions when input changes
  useEffect(() => {
    const loadSuggestions = async () => {
      if (inputValue.trim().length > 0) {
        try {
          setLoading(true);
          const suggestions = await apiService.getCollectionSuggestions(inputValue);
          setSuggestions(suggestions);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error loading collection suggestions:', error);
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timeoutId = setTimeout(loadSuggestions, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tagName) => {
    const trimmedTag = tagName.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      const newTags = [...tags, trimmedTag];
      setTags(newTags);
      onChange(newTags);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const removeTag = (tagToRemove) => {
    const newTags = tags.filter(tag => tag !== tagToRemove);
    setTags(newTags);
    onChange(newTags);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleSuggestionClick = (suggestion) => {
    addTag(suggestion);
  };

  const handleInputFocus = () => {
    if (inputValue.trim().length > 0 || suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className="collection-tags-input" ref={suggestionsRef}>
      <div className="tags-container">
        {tags.map((tag, index) => (
          <Badge key={index} bg="secondary" className="collection-tag">
            {tag}
            {!disabled && (
              <Button
                variant="link"
                size="sm"
                className="tag-remove-btn"
                onClick={() => removeTag(tag)}
                disabled={disabled}
              >
                <BsX size={12} />
              </Button>
            )}
          </Badge>
        ))}
        
        {!disabled && (
          <FormControl
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onFocus={handleInputFocus}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="tag-input"
            disabled={disabled}
          />
        )}
      </div>

      {showSuggestions && (suggestions.length > 0 || inputValue.trim()) && (
        <div className="suggestions-dropdown">
          {suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="suggestion-item"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </div>
            ))
          ) : inputValue.trim() ? (
            <div className="suggestion-item create-new" onClick={() => addTag(inputValue)}>
              <BsPlus size={14} /> Create "{inputValue.trim()}"
            </div>
          ) : null}
        </div>
      )}

      {loading && (
        <div className="suggestions-loading">
          Loading suggestions...
        </div>
      )}
    </div>
  );
};

export default CollectionTagsInput;
