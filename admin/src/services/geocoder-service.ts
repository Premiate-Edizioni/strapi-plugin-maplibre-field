/**
 * Geocoder Service
 *
 * Combines Nominatim geocoding and custom POI search into a unified search interface
 */

import { searchPOIsForGeocoder, type POI } from './poi-service';
import type { LocationFeature } from './poi-service';

// User-Agent for Nominatim API compliance
const USER_AGENT = 'strapi-plugin-maplibre-field/1.0.0 (Strapi CMS)';

export interface SearchResult {
  id: string;
  place_name: string;
  feature: LocationFeature;
  source: 'nominatim' | 'custom';
}

export interface POISource {
  id: string;
  name: string;
  apiUrl: string;
  enabled?: boolean;
  color?: string;
}

export interface SearchConfig {
  nominatimUrl: string;
  poiSearchEnabled?: boolean;
  poiSources?: POISource[];
}

/**
 * Perform unified search across Nominatim and custom POI sources
 * @param query Search query string
 * @param config Search configuration
 * @returns Array of search results
 */
export async function performSearch(query: string, config: SearchConfig): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // 1. Search custom POIs if enabled (reuse existing logic)
  if (config.poiSearchEnabled && config.poiSources) {
    const enabledSources = config.poiSources.filter((source) => source.enabled !== false);

    for (const source of enabledSources) {
      try {
        const poiResults = await searchPOIsForGeocoder(query, {
          nominatimUrl: config.nominatimUrl,
          customApiUrl: source.apiUrl,
          mapName: source.name,
          radius: 100,
          categories: [],
        });

        // Convert POI results to SearchResult format
        results.push(
          ...poiResults.map((poi: POI, idx: number) => ({
            id: `poi-${source.id}-${idx}`,
            place_name: poi.name,
            feature: {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: poi.coordinates,
              },
              properties: {
                name: poi.name,
                address: poi.address,
                source: 'custom',
                sourceId: source.id,
                sourceLayer: source.name,
                category: poi.type, // POI.type is the category
                inputMethod: 'search' as const,
              },
            },
            source: 'custom' as const,
          }))
        );
      } catch (error) {
        console.warn(`POI search failed for ${source.name}:`, error);
        // Continue with other sources
      }
    }
  }

  // 2. Search Nominatim for global address search
  try {
    const response = await fetch(
      `${config.nominatimUrl}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
      {
        headers: {
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();

      // Convert Nominatim results to SearchResult format
      results.push(
        ...data.map((result: any, idx: number) => ({
          id: `nominatim-${idx}`,
          place_name: result.display_name,
          feature: {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [parseFloat(result.lon), parseFloat(result.lat)],
            },
            properties: {
              name: result.display_name,
              address: result.display_name,
              source: 'nominatim',
              inputMethod: 'search' as const,
            },
          },
          source: 'nominatim' as const,
        }))
      );
    }
  } catch (error) {
    console.error('Nominatim search error:', error);
    // Continue - POI results might still be available
  }

  return results;
}
