/**
 * Geocoder Service
 *
 * Combines Nominatim geocoding and custom POI search into a unified search interface
 */

import {
  formatAddress,
  formatLabel,
  formatName,
  searchPOIsForGeocoder,
  type POI,
} from './poi-service';
import type { LocationFeature, NominatimGeocoding } from './poi-service';

// Nominatim requests send no custom headers, `User-Agent` included — see the note in poi-service.ts.

// Minimal GeoJSON Feature type for map feature queries
interface MapFeature {
  geometry: { type: string; coordinates: number[] };
  properties: Record<string, unknown> | null;
  id?: string | number;
}

/** One feature of a Nominatim `format=geocodejson` response */
interface NominatimFeature {
  geometry: { coordinates: [number, number] };
  properties: { geocoding: NominatimGeocoding };
}

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
  type?: 'geojson' | 'pmtiles';
  sourceLayer?: string;
  enabled?: boolean;
  color?: string;
}

export interface SearchConfig {
  nominatimUrl: string;
  /** Sent to Nominatim as `accept-language`; localises the place names it returns */
  language?: string;
  poiSearchEnabled?: boolean;
  poiSources?: POISource[];
  // Callback to query loaded map features (used for pmtiles sources)
  queryMapFeatures?: (sourceId: string, sourceLayer: string) => MapFeature[];
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
      // PMTiles sources: search features already loaded in the map via querySourceFeatures
      if (source.type === 'pmtiles') {
        if (config.queryMapFeatures && source.sourceLayer) {
          try {
            const sourceId = `pmtiles-source-${source.id}`;
            const features = config.queryMapFeatures(sourceId, source.sourceLayer);
            const q = query.toLowerCase();
            features
              .filter((f) =>
                String(f.properties?.name ?? '')
                  .toLowerCase()
                  .includes(q)
              )
              .forEach((f, idx) => {
                const coords = f.geometry.coordinates as [number, number];
                results.push({
                  id: `pmtiles-${source.id}-${idx}`,
                  place_name: String(f.properties?.name ?? 'Unknown'),
                  feature: {
                    type: 'Feature' as const,
                    geometry: { type: 'Point' as const, coordinates: coords },
                    properties: {
                      name: f.properties?.name as string | undefined,
                      address: f.properties?.address as string | undefined,
                      source: 'custom',
                      sourceId: source.id,
                      sourceLayer: source.sourceLayer,
                      category: f.properties?.type as string | undefined,
                      inputMethod: 'search' as const,
                    },
                  },
                  source: 'custom' as const,
                });
              });
          } catch (error) {
            console.warn(`PMTiles search failed for ${source.name}:`, error);
          }
        }
        continue;
      }

      // GeoJSON sources: fetch via HTTP
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
    const params = new URLSearchParams({
      q: query,
      format: 'geocodejson',
      addressdetails: '1',
      limit: '5',
    });

    if (config.language) {
      params.set('accept-language', config.language);
    }

    const response = await fetch(`${config.nominatimUrl}/search?${params.toString()}`);

    if (response.ok) {
      const data = await response.json();

      // Convert Nominatim results to SearchResult format
      results.push(
        ...(data?.features ?? []).map((result: NominatimFeature, idx: number) => {
          const geocoding = result.properties.geocoding;
          const address = formatAddress(geocoding);
          const name = formatName(geocoding);

          return {
            id: `nominatim-${idx}`,
            place_name: formatLabel(geocoding),
            feature: {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [
                  Number(result.geometry.coordinates[0]),
                  Number(result.geometry.coordinates[1]),
                ] as [number, number],
              },
              properties: {
                name,
                address,
                source: 'nominatim',
                inputMethod: 'search' as const,
              },
            },
            source: 'nominatim' as const,
          };
        })
      );
    }
  } catch (error) {
    console.error('Nominatim search error:', error);
    // Continue - POI results might still be available
  }

  return results;
}
