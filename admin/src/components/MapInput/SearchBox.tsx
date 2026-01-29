/**
 * SearchBox Component
 *
 * Provides a search interface for geocoding (Nominatim) and custom POI search.
 * Displays results in a dropdown and calls onSelectResult when user selects a location.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Flex, Box, Typography, TextInput } from '@strapi/design-system';
import { performSearch, type SearchResult } from '../../services/geocoder-service';
import type { LocationFeature } from '../../services/poi-service';
import getTranslation from '../../utils/getTrad';

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
  const { formatMessage } = useIntl();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  /**
   * Get the indicator color for a search result
   * - Nominatim results: gray (#6c757d)
   * - Custom POI results: color from configuration (or red fallback)
   */
  const getResultColor = (result: SearchResult): string => {
    if (result.source === 'nominatim') {
      return '#6c757d'; // Gray for Nominatim
    }

    // Custom POI - look up color from configuration
    const sourceId = result.feature.properties?.sourceId;
    if (sourceId && poiSources) {
      const source = poiSources.find((s) => s.id === sourceId);
      if (source?.color) {
        return source.color;
      }
    }

    // Fallback color for custom POIs without configured color
    return '#cc0000'; // Red fallback
  };

  return (
    <Box ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <TextInput
        placeholder={formatMessage({ id: getTranslation('search.placeholder') })}
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Location search"
      />

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
          {results.map((result) => {
            const dotColor = getResultColor(result);

            return (
              <Box
                key={result.id}
                paddingTop={2}
                paddingBottom={2}
                paddingLeft={3}
                paddingRight={3}
                hasRadius
                background={hoveredId === result.id ? 'primary100' : 'neutral0'}
                onMouseEnter={() => setHoveredId(result.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleSelectResult(result)}
                style={{
                  cursor: 'pointer',
                }}
              >
                <Flex gap={2} alignItems="center">
                  {/* Source indicator dot */}
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="omega"
                    textColor="neutral800"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {result.place_name}
                  </Typography>
                </Flex>
              </Box>
            );
          })}
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
