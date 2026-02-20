import React, { useState, useEffect, useRef } from 'react';
import apiService from '../services/api';
import './AutocompleteInput.css';

interface AutocompleteInputProps {
  field: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement> | { target: { value: string } }) => void;
  placeholder?: string;
  type?: string;
  min?: number | null;
  step?: number | null;
  options?: string[] | null; // For select fields
}

const AutocompleteInput = ({
  field,
  value,
  onChange,
  placeholder,
  type = 'text',
  min = null,
  step = null,
  options = null // For select fields
}: AutocompleteInputProps) => {
  const [suggestions, setSuggestions] = useState<Array<string | Record<string, unknown>>>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const suggestionRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (value && value.length > 0) {
      fetchSuggestions(value);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [value, field]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSuggestions = async (query: string) => {
    if (!query || query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const results = await apiService.getAutocompleteSuggestions(field, query) as Array<string | Record<string, unknown>>;
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(e);
    fetchSuggestions(newValue);
  };

  const handleSuggestionClick = (suggestion: string | Record<string, unknown>) => {
    // Extract the actual value from the suggestion object
    const suggestionValue = typeof suggestion === 'object' ? (suggestion[field] as string) : suggestion;
    onChange({ target: { value: suggestionValue } });
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Delay hiding suggestions to allow clicks on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }, 150);
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  // For select fields, use options instead of autocomplete
  if (options) {
    return (
      <div className="autocomplete-container">
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={value}
          onChange={onChange as React.ChangeEventHandler<HTMLSelectElement>}
          className="autocomplete-input"
        >
          <option value="">{placeholder}</option>
          {options.map((option, index) => (
            <option key={index} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="autocomplete-container">
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        min={min !== null ? min : undefined}
        step={step !== null ? step : undefined}
        className="autocomplete-input"
      />

      {isLoading && (
        <div className="autocomplete-loading">
          <div className="loading-spinner" data-testid="loading-spinner"></div>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="autocomplete-suggestions">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              ref={el => { suggestionRefs.current[index] = el; }}
              className={`autocomplete-suggestion ${
                index === highlightedIndex ? 'highlighted' : ''
              }`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {typeof suggestion === 'object' ? (suggestion[field] as string) : suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutocompleteInput;
