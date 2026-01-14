import React, { useRef, useEffect } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import MapLibreGeocoder, { CarmenGeojsonFeature, MaplibreGeocoderSuggestion } from '@maplibre/maplibre-gl-geocoder';
import maplibregl from 'maplibre-gl';
import { usePluginConfig } from '../../hooks/usePluginConfig';
import { searchPOIsForGeocoder } from '../../services/poi-service';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';

// User-Agent for Nominatim API compliance (update version on plugin release)
const USER_AGENT = 'strapi-plugin-maplibre-field/1.0.0 (Strapi CMS)';

interface GeocoderResult {
  result: {
    center?: [number, number];
    place_name: string;
    geometry?: {
      type: string;
      coordinates: [number, number];
    };
  };
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
  [key: string]: unknown;
}

interface GeocoderConfig {
  query?: string | number[];
  [key: string]: unknown;
}

interface GeocoderControlProps {
  mapRef: React.RefObject<MapRef>;
  position?: string;
  onResult?: (evt: GeocoderResult) => void;
}

const GeocoderControl: React.FC<GeocoderControlProps> = ({
  mapRef,
  position = 'top-left',
  onResult,
}) => {
  const geocoderRef = useRef<any>(null);
  const config = usePluginConfig();

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current.getMap();
    if (!map || geocoderRef.current) return;

    const geocoderApi = {
      forwardGeocode: async (geocoderConfig: GeocoderConfig) => {
        // Handle cases where query is not a valid string
        const query = geocoderConfig.query;
        if (typeof query !== 'string' || !query.trim()) {
          return { type: 'FeatureCollection' as const, features: [] };
        }

        try {
          const results: any[] = [];

          // 1. First query custom POI sources (if configured and search enabled)
          if (config.poiSources && config.poiSearchEnabled) {
            const enabledSources = config.poiSources.filter((source) => source.enabled !== false);

            for (const source of enabledSources) {
              try {
                const customPOIs = await searchPOIsForGeocoder(
                  query,
                  {
                    nominatimUrl: config.nominatimUrl || 'https://nominatim.openstreetmap.org',
                    customApiUrl: source.apiUrl,
                    mapName: source.name,
                    radius: 100,
                    categories: [],
                  }
                );

                // Convert custom POIs to GeoJSON features
                const customFeatures = customPOIs
                  .filter((poi) => poi.source === 'custom') // Only custom API results
                  .slice(0, 5) // Limit to 5 custom results
                  .map((poi) => ({
                    type: 'Feature' as const,
                    geometry: {
                      type: 'Point' as const,
                      coordinates: poi.coordinates,
                    },
                    place_name: poi.name,
                    properties: {
                      ...poi,
                      source: 'custom',
                      poi_source_id: source.id, // For color lookup in render function
                    },
                    text: poi.name,
                    place_type: ['poi'],
                    center: poi.coordinates,
                  }));

                results.push(...customFeatures);
              } catch (error) {
                console.warn(`Custom API search failed for ${source.name}, continuing:`, error);
              }
            }
          }

          // 2. Then query Nominatim for global address search
          const nominatimResponse = await fetch(
            `${config.nominatimUrl}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`,
            {
              headers: {
                'User-Agent': USER_AGENT,
              },
            }
          );

          if (nominatimResponse.ok) {
            const nominatimData = (await nominatimResponse.json()) as NominatimSearchResult[];

            // Convert Nominatim results to GeoJSON features
            const nominatimFeatures = nominatimData.map((result: NominatimSearchResult) => ({
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [parseFloat(result.lon), parseFloat(result.lat)] as [number, number],
              },
              place_name: result.display_name,
              properties: { ...result, source: 'nominatim' },
              text: result.display_name,
              place_type: ['place'],
              center: [parseFloat(result.lon), parseFloat(result.lat)] as [number, number],
            }));

            results.push(...nominatimFeatures);
          }

          return {
            type: 'FeatureCollection' as const,
            features: results,
          };
        } catch (error) {
          console.error('Geocoding error:', error);
          return { type: 'FeatureCollection' as const, features: [] };
        }
      },
      maplibregl: maplibregl,
    };

    const geocoderOptions = {
      marker: false,
      showResultsWhileTyping: false, // Require Enter key for Nominatim policy compliance
      render: (item: CarmenGeojsonFeature | MaplibreGeocoderSuggestion) => {
        // Determine source and color
        const properties = 'properties' in item ? item.properties : undefined;
        const source = properties?.source;
        let dotColor = '#6c757d'; // Default gray for Nominatim

        if (source === 'custom') {
          // Look up color from POI source config
          const poiSourceId = properties?.poi_source_id;
          const poiSource = config.poiSources?.find((s: any) => s.id === poiSourceId);
          dotColor = poiSource?.color || '#cc0000'; // Configured or fallback red
        }

        // Escape HTML to prevent XSS
        const escapeHtml = (str: string) => {
          return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        };

        // Get display text - handle both CarmenGeojsonFeature and MaplibreGeocoderSuggestion
        const placeName = 'place_name' in item ? item.place_name : undefined;
        const displayText = escapeHtml(item.text || placeName || '');

        // Return HTML with colored dot (inline styles for compatibility)
        return `
          <div class="maplibregl-ctrl-geocoder--suggestion">
            <div class="maplibregl-ctrl-geocoder--suggestion-icon">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${dotColor};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.1);"></span>
            </div>
            <div class="maplibregl-ctrl-geocoder--suggestion-info">
              <div class="maplibregl-ctrl-geocoder--suggestion-title">
                ${displayText}
              </div>
            </div>
          </div>
        `;
      },
    };

    const geocoder = new MapLibreGeocoder(geocoderApi, geocoderOptions);

    if (onResult) {
      geocoder.on('result', (evt: any) => {
        onResult(evt as GeocoderResult);
      });
    }

    map.addControl(geocoder, position as any);
    geocoderRef.current = geocoder;

    return () => {
      if (geocoderRef.current && map) {
        try {
          map.removeControl(geocoderRef.current);
        } catch (error) {
          // Control might already be removed
          console.warn('Error removing geocoder control:', error);
        }
        geocoderRef.current = null;
      }
    };
  }, [mapRef, position, onResult, config.nominatimUrl]);

  return null;
};

export default GeocoderControl;
