/**
 * SearchBox Component
 *
 * Provides a search interface for geocoding (Nominatim) and custom POI search.
 * Displays results in a dropdown and calls onSelectResult when user selects a location.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Flex, Box, Typography, Button, TextInput } from '@strapi/design-system';
import { Search } from '@strapi/icons';
import { performSearch, type SearchResult, type SearchConfig } from '../../services/geocoder-service';
import type { LocationFeature } from '../../services/poi-service';

export interface SearchBoxProps {
  onSelectResult: (result: LocationFeature) => void;
  nominatimUrl: string;
  poiSearchEnabled?: boolean;
  poiSources?: Array<{
    id: string;
    name: string;
    apiUrl: string;
    enabled?: boolean;
    color?: string;
  }>;
}

const SearchBox: React.FC<SearchBoxProps> = ({
  onSelectResult,
  nominatimUrl,
  poiSearchEnabled,
  poiSources,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      const searchResults = await performSearch(query, {
        nominatimUrl,
        poiSearchEnabled,
        poiSources,
      });

      setResults(searchResults);
      setIsOpen(searchResults.length > 0);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      handleSearch();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    onSelectResult(result.feature);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  return (
    <Box ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <Flex gap={2}>
        <Box style={{ flex: 1 }}>
          <TextInput
            placeholder="Search for a location..."
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Location search"
          />
        </Box>
        <Button
          onClick={handleSearch}
          loading={isLoading}
          disabled={isLoading || !query.trim()}
          startIcon={<Search />}
        >
          Search
        </Button>
      </Flex>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <Box
          ref={dropdownRef}
          background="neutral0"
          shadow="filterShadow"
          borderColor="neutral150"
          hasRadius
          padding={2}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handleSelectResult(result)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                marginBottom: '4px',
                padding: '8px',
                borderRadius: '4px',
                background: 'transparent',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = '#f0f0ff';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Flex gap={2} alignItems="center">
                {/* Source indicator dot */}
                <Box
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: result.source === 'custom' ? '#cc0000' : '#6c757d',
                    flexShrink: 0,
                  }}
                />
                <Typography
                  variant="omega"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {result.place_name}
                </Typography>
              </Flex>
            </button>
          ))}
        </Box>
      )}

      {/* No results message */}
      {isOpen && results.length === 0 && !isLoading && query.trim() && (
        <Box
          background="neutral0"
          shadow="filterShadow"
          borderColor="neutral150"
          hasRadius
          padding={4}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1000,
          }}
        >
          <Typography variant="omega" textColor="neutral600">
            No results found for "{query}"
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SearchBox;
