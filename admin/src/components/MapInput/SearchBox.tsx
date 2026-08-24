/**
 * SearchBox Component
 *
 * Provides a search interface for geocoding (Nominatim) and custom POI search.
 * Displays results in a dropdown and calls onSelectResult when user selects a location.
 *
 * Built on the design system's Combobox, which implements the WAI-ARIA combobox pattern for us:
 * arrow-key navigation, Enter to pick, Escape to dismiss, the listbox/option roles and the live
 * announcements. The previous hand-rolled dropdown was a list of clickable <div>s — reachable with
 * a mouse only, and invisible to a screen reader.
 *
 * `autocomplete="none"` is essential: results come from a server, so the labels need not contain
 * what the user typed (searching "duomo" can legitimately return "Piazza del Duomo, Milano" or a
 * POI named something else entirely). Any client-side filtering would hide valid results.
 */

import React, { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Box, Combobox, ComboboxOption, Flex, Typography } from '@strapi/design-system';
import { Search } from '@strapi/icons';
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
    type?: 'geojson' | 'pmtiles';
    sourceLayer?: string;
    enabled?: boolean;
    color?: string;
  }>;
  queryMapFeatures?: (
    sourceId: string,
    sourceLayer: string
  ) => {
    geometry: { type: string; coordinates: number[] };
    properties: Record<string, unknown> | null;
    id?: string | number;
  }[];
}

const SearchBox: React.FC<SearchBoxProps> = ({
  onSelectResult,
  nominatimUrl,
  poiSearchEnabled,
  poiSources,
  queryMapFeatures,
}) => {
  const { formatMessage, locale } = useIntl();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  // Whether the results on screen answer the text currently in the box. Editing the text
  // invalidates them, which is what puts Enter back in "run a search" mode.
  const [hasSearched, setHasSearched] = useState(false);

  // Backspace opens the list inside the primitive, and that is an editing keystroke, not a request
  // to see the options — it must not be allowed to fire a search.
  const isEditingKeyRef = useRef(false);
  // Whether the open request being handled is someone asking for the options — the chevron, or the
  // arrow keys. Clicking anywhere in the field also asks the primitive to open, and that one is
  // just "put the cursor here".
  const wantsOptionsRef = useRef(false);

  const handleTextChange = (value: string) => {
    setQuery(value);
    setResults([]);
    setHasSearched(false);
    setIsOpen(false);
  };

  /**
   * The chevron is the standard "show me the options" affordance, so it has to do something. With
   * text in the box and no results yet, the options are whatever the search returns — so run it,
   * exactly as Enter does. With an empty box there is nothing to search, so open on the empty-state
   * message, the way Strapi's own relation picker does.
   *
   * Requests to open never come from typing: `isPrintableCharacter` below switches that off, both
   * because Nominatim's usage policy rules out autocomplete-style querying and because an open list
   * is the state in which Enter picks an option instead of searching.
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsOpen(false);
      return;
    }

    if (isEditingKeyRef.current) return;

    // Merely clicking into the box is not a request for options: with nothing to show it would
    // greet the user with an empty popup. Once a search has produced results, reopening them on
    // click is the ordinary combobox behaviour and worth keeping.
    if (!wantsOptionsRef.current && results.length === 0) return;

    if (query.trim() && !hasSearched && !isLoading) {
      handleSearch();
      return;
    }

    setIsOpen(true);
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    // Open before the request resolves so the combobox can show its loading message, and stay open
    // on an empty result so the "no results" message is reachable at all.
    setIsOpen(true);

    try {
      const searchResults = await performSearch(query, {
        nominatimUrl,
        language: locale,
        poiSearchEnabled,
        poiSources,
        queryMapFeatures,
      });

      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setHasSearched(true);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    isEditingKeyRef.current = e.key === 'Backspace';
    wantsOptionsRef.current = e.key === 'ArrowDown' || e.key === 'ArrowUp';

    // Enter runs the search while the list is closed, and picks the highlighted result while it is
    // open — the combobox handles the latter.
    if (e.key === 'Enter' && !isOpen) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setIsOpen(false);
  };

  const handleSelectResult = (id: string) => {
    const result = results.find((r) => r.id === id);
    if (!result) return;

    onSelectResult(result.feature);
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  /**
   * Get the indicator color for a search result
   * - Nominatim results: gray (#6c757d)
   * - Custom POI results: color from configuration (or red fallback)
   *
   * The colour repeats what the second line of each result says in words — it is a redundant cue,
   * never the only way to tell the sources apart.
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

  /** Where a result came from, named rather than merely coloured. */
  const getSourceLabel = (result: SearchResult): string =>
    result.source === 'nominatim'
      ? formatMessage({
          id: getTranslation('search.source-osm'),
          defaultMessage: 'OpenStreetMap',
        })
      : result.feature.properties?.sourceLayer ||
        formatMessage({ id: getTranslation('search.source-poi'), defaultMessage: 'Custom layer' });

  return (
    <Box
      width="100%"
      // The chevron is the only part of the field that means "show me the options"; it is the one
      // element carrying aria-expanded. Capture runs before the primitive's own handler, which is
      // what lets handleOpenChange tell a chevron press from a click into the text.
      onPointerDownCapture={(e: React.PointerEvent) => {
        wantsOptionsRef.current = Boolean(
          (e.target as HTMLElement)?.closest?.('button[aria-expanded]')
        );
      }}
    >
      <Combobox
        name="location-search"
        autocomplete="none"
        // On blur a combobox reverts the text to the selected option's label, and having none it
        // empties the box — wiping the search the moment focus moves to another field in the edit
        // view. `allowCustomValue` tells it the typed text is a legitimate value of its own, so it
        // survives losing focus and the results stay available when the user comes back.
        allowCustomValue
        placeholder={formatMessage({
          id: getTranslation('search.placeholder'),
          defaultMessage: 'Search for a location...',
        })}
        startIcon={<Search />}
        textValue={query}
        onTextValueChange={handleTextChange}
        open={isOpen}
        onOpenChange={handleOpenChange}
        onKeyDown={handleKeyDown}
        loading={isLoading}
        loadingMessage={formatMessage({
          id: getTranslation('search.loading'),
          defaultMessage: 'Searching…',
        })}
        isPrintableCharacter={() => false}
        noOptionsMessage={(value) =>
          hasSearched
            ? formatMessage(
                {
                  id: getTranslation('search.no-results'),
                  defaultMessage: 'No results found for “{query}”',
                },
                { query: value || query }
              )
            : formatMessage({
                id: getTranslation('search.no-results-yet'),
                defaultMessage: 'No results available',
              })
        }
        value=""
        onChange={handleSelectResult}
        onClear={handleClear}
        clearLabel={formatMessage({ id: getTranslation('search.clear'), defaultMessage: 'Clear' })}
      >
        {results.map((result) => {
          const name = result.feature.properties?.name || result.place_name;
          const address = result.feature.properties?.address;
          const context = [getSourceLabel(result), address].filter(Boolean).join(' · ');

          return (
            <ComboboxOption key={result.id} value={result.id} textValue={result.place_name}>
              <Flex gap={2} alignItems="center">
                <div
                  aria-hidden
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: getResultColor(result),
                    flexShrink: 0,
                  }}
                />
                <Flex direction="column" alignItems="flex-start" gap={0} overflow="hidden">
                  {/* No textColor: Typography defaults to currentcolor, so the name picks up the
                      primary600 the design system paints on a highlighted option — the same cue
                      Strapi's relation picker gives. Pinning it to neutral800 suppressed it. */}
                  <Typography variant="omega" ellipsis>
                    {name}
                  </Typography>
                  <Typography variant="pi" textColor="neutral600" ellipsis>
                    {context}
                  </Typography>
                </Flex>
              </Flex>
            </ComboboxOption>
          );
        })}
      </Combobox>
    </Box>
  );
};

export default SearchBox;
