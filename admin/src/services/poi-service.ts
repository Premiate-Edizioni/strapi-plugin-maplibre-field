/**
 * POI Service Layer
 *
 * Handles POI queries from multiple sources (Nominatim, Custom GeoJSON APIs)
 * Provides distance calculations, viewport filtering, and data transformation
 */

// User-Agent for Nominatim API compliance
const USER_AGENT = 'strapi-plugin-maplibre-field (Strapi CMS)';

// =============================================================================
// GeoJSON Feature Interface (RFC 7946) - Used for storing location data
// =============================================================================

/**
 * Properties for a LocationFeature (all optional, omitted if not available)
 */
export interface LocationProperties {
  /** POI name or short location name */
  name?: string;
  /** Full formatted address */
  address?: string;
  /** Source identifier: "nominatim" or custom source ID like "fotta-skatespots" */
  source?: string;
  /** Original ID from the source */
  sourceId?: string;
  /** Display name of the source layer, e.g., "Fotta Skatespots" */
  sourceLayer?: string;
  /** POI category/type: "skating_spot", "bus_stop", etc. */
  category?: string;
  /** How the location was created: "search" | "poi_click" | "map_click" */
  inputMethod?: 'search' | 'poi_click' | 'map_click';
  /** Original metadata preserved from the source */
  metadata?: Record<string, unknown>;
}

/**
 * GeoJSON Feature for storing location data (RFC 7946 compliant)
 * This is the canonical format for storing locations in the database.
 */
export interface LocationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: LocationProperties;
}

/**
 * Create a LocationFeature with clean properties (no null/empty values)
 * @param coordinates [lng, lat] coordinates
 * @param properties Optional properties to include
 * @returns LocationFeature with only defined, non-empty properties
 */
export function createLocationFeature(
  coordinates: [number, number],
  properties: Partial<LocationProperties> = {}
): LocationFeature {
  // Filter out undefined, null, and empty string values
  const cleanProperties = Object.fromEntries(
    Object.entries(properties).filter(([, v]) => v != null && v !== '')
  ) as LocationProperties;

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates,
    },
    properties: cleanProperties,
  };
}

// =============================================================================
// POI Interface - Used internally for POI queries and display
// =============================================================================

export interface POI {
  id: string;
  name: string;
  type: string;
  coordinates: [number, number]; // [lng, lat]
  address: string;
  distance?: number; // meters from reference point
  metadata?: Record<string, unknown>;
  source: 'nominatim' | 'custom'; // Track data source
  mapName?: string; // Display name of the custom map source
  layerId?: string; // ID of the layer this POI belongs to
}

export interface GeoJSONFeature {
  id?: string;
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    name?: string | null;
    [key: string]: unknown;
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface POIServiceConfig {
  nominatimUrl: string;
  customApiUrl?: string | null;
  mapName?: string; // Display name for custom map source
  layerId?: string; // ID of the layer
  radius: number;
  categories: string[];
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param coord1 First coordinate [lng, lat]
 * @param coord2 Second coordinate [lng, lat]
 * @returns Distance in meters
 */
export function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1[1] * Math.PI) / 180;
  const φ2 = (coord2[1] * Math.PI) / 180;
  const Δφ = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const Δλ = ((coord2[0] - coord1[0]) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Query POIs from custom GeoJSON API
 * @param apiUrl Custom API endpoint URL
 * @param searchQuery Optional search query for filtering
 * @returns Array of GeoJSON features
 */
export async function queryCustomAPI(
  apiUrl: string,
  searchQuery?: string
): Promise<GeoJSONFeature[]> {
  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error(
        `[POI Service] HTTP error for ${apiUrl}: ${response.status} ${response.statusText}`
      );
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as GeoJSONFeatureCollection;

    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      console.error(`[POI Service] Invalid GeoJSON from ${apiUrl}`);
      throw new Error('Invalid GeoJSON response format');
    }

    let features = data.features;

    // Filter by search query if provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      features = features.filter((feature) => {
        const name = feature.properties?.name;
        return name && name.toLowerCase().includes(query);
      });
    }

    return features;
  } catch (error) {
    console.error(`[POI Service] Failed to load from ${apiUrl}:`, error);
    return [];
  }
}

/**
 * Query POIs near coordinates from Nominatim
 * Uses /reverse endpoint with high zoom level to get specific POIs
 * @param lat Latitude
 * @param lng Longitude
 * @param radius Search radius in meters
 * @param nominatimUrl Nominatim API base URL
 * @returns Array of POIs
 */
export async function queryNominatim(
  lat: number,
  lng: number,
  radius: number,
  nominatimUrl: string
): Promise<POI[]> {
  try {
    // Use zoom=18 to get building/POI level detail (higher zoom = more specific)
    // zoom 3: country, zoom 10: city, zoom 18: building
    const url = `${nominatimUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data) {
      return [];
    }

    const coordinates: [number, number] = [parseFloat(data.lon), parseFloat(data.lat)];
    const distance = calculateDistance([lng, lat], coordinates);

    // Only return if within radius
    if (distance > radius) {
      return [];
    }

    // Determine POI name - prefer specific name over generic address
    let poiName = data.name || data.display_name || 'Unknown Location';

    // If there's a specific amenity/shop/building name, use it
    if (data.namedetails) {
      poiName = data.namedetails.name || poiName;
    }

    // Convert Nominatim response to POI
    const poi: POI = {
      id: `nominatim-${data.place_id || Date.now()}`,
      name: poiName,
      type: data.type || data.class || 'address',
      coordinates,
      address: data.display_name || '',
      distance,
      metadata: {
        osm_id: data.osm_id,
        osm_type: data.osm_type,
        place_id: data.place_id,
        addresstype: data.addresstype,
        class: data.class,
        category: data.category,
      },
      source: 'nominatim',
    };

    return [poi];
  } catch (error) {
    console.error('Nominatim query error:', error);
    return [];
  }
}

/**
 * Convert GeoJSON feature to POI interface
 * @param feature GeoJSON feature
 * @param clickCoords Optional reference coordinates for distance calculation
 * @param mapName Optional display name for the custom map source
 * @param layerId Optional ID of the layer this POI belongs to
 * @returns POI object or null if invalid
 */
export function geoJSONFeatureToPOI(
  feature: GeoJSONFeature,
  clickCoords?: [number, number],
  mapName?: string,
  layerId?: string
): POI | null {
  if (!feature.geometry || feature.geometry.type !== 'Point') {
    return null;
  }

  const coordinates = feature.geometry.coordinates as [number, number];
  const properties = feature.properties || {};

  // Helper to safely get string from unknown
  const getString = (val: unknown): string | undefined =>
    typeof val === 'string' ? val : undefined;

  // Handle null or missing name
  const name = getString(properties.name) || 'Unnamed Location';

  const poi: POI = {
    id: feature.id?.toString() || `custom-${Date.now()}-${Math.random()}`,
    name,
    type:
      getString(properties.type) ||
      getString(properties.sport) ||
      getString(properties.leisure) ||
      'poi',
    coordinates,
    address: getString(properties.address) || '', // Leave empty if not provided
    metadata: properties,
    source: 'custom',
    mapName, // Include the custom map name
    layerId, // Include the layer ID
  };

  // Calculate distance if reference coordinates provided
  if (clickCoords) {
    poi.distance = calculateDistance(clickCoords, coordinates);
  }

  return poi;
}

/**
 * Filter GeoJSON features by distance from click point
 * @param features Array of GeoJSON features
 * @param clickCoords Click coordinates [lng, lat]
 * @param radius Maximum distance in meters
 * @returns Filtered features within radius
 */
export function filterByDistance(
  features: GeoJSONFeature[],
  clickCoords: [number, number],
  radius: number
): GeoJSONFeature[] {
  return features.filter((feature) => {
    if (!feature.geometry || feature.geometry.type !== 'Point') {
      return false;
    }

    const featureCoords = feature.geometry.coordinates as [number, number];
    const distance = calculateDistance(clickCoords, featureCoords);
    return distance <= radius;
  });
}

/**
 * Find nearest POI to click coordinates
 * @param clickCoordinates Click coordinates [lng, lat]
 * @param pois Array of POIs
 * @returns Nearest POI or null if none found
 */
export function findNearestPOI(clickCoordinates: [number, number], pois: POI[]): POI | null {
  if (!pois || pois.length === 0) {
    return null;
  }

  let nearest: POI | null = null;
  let minDistance = Infinity;

  for (const poi of pois) {
    const distance = poi.distance ?? calculateDistance(clickCoordinates, poi.coordinates);

    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...poi, distance };
    }
  }

  return nearest;
}

/**
 * Search POIs for geocoder (queries custom POI sources only)
 * Note: Nominatim search is handled directly by geocoder-control.tsx
 * @param query Search query string
 * @param config POI service configuration
 * @returns Array of custom POIs only
 */
export async function searchPOIsForGeocoder(
  query: string,
  config: POIServiceConfig
): Promise<POI[]> {
  const results: POI[] = [];

  try {
    // Query custom API if configured
    if (config.customApiUrl) {
      try {
        const customFeatures = await queryCustomAPI(config.customApiUrl, query);

        const customPOIs = customFeatures
          .map((feature) => geoJSONFeatureToPOI(feature, undefined, config.mapName, config.layerId))
          .filter((poi): poi is POI => poi !== null)
          .slice(0, 5); // Limit to 5 custom results

        results.push(...customPOIs);
      } catch (error) {
        console.warn('Custom API search failed:', error);
      }
    }

    return results;
  } catch (error) {
    console.error('Search POIs error:', error);
    return results;
  }
}

/**
 * Search nearby POIs for snap (double-click) - queries BOTH sources
 * @param lat Latitude
 * @param lng Longitude
 * @param config POI service configuration
 * @returns Array of POIs from both Nominatim and Custom API
 */
export async function searchNearbyPOIsForSnap(
  lat: number,
  lng: number,
  config: POIServiceConfig
): Promise<POI[]> {
  const results: POI[] = [];

  try {
    // 1. Query Nominatim
    const nominatimPOIs = await queryNominatim(lat, lng, config.radius, config.nominatimUrl);
    results.push(...nominatimPOIs);

    // 2. Query custom API if configured
    if (config.customApiUrl) {
      try {
        const customFeatures = await queryCustomAPI(config.customApiUrl);

        // Filter by distance from click point
        const nearbyFeatures = filterByDistance(customFeatures, [lng, lat], config.radius);

        const customPOIs = nearbyFeatures
          .map((feature) =>
            geoJSONFeatureToPOI(feature, [lng, lat], config.mapName, config.layerId)
          )
          .filter((poi): poi is POI => poi !== null);

        results.push(...customPOIs);
      } catch (error) {
        console.warn('Custom API query failed, continuing with Nominatim only:', error);
      }
    }

    return results;
  } catch (error) {
    console.error('Search nearby POIs error:', error);
    return results;
  }
}

/**
 * Query POIs for viewport display
 * @param bounds Map bounds {north, south, east, west}
 * @param center Map center [lng, lat]
 * @param maxDisplay Maximum number of POIs to display
 * @param config POI service configuration
 * @returns Array of POIs sorted by distance from center
 */
export async function queryPOIsForViewport(
  bounds: { north: number; south: number; east: number; west: number },
  center: [number, number],
  maxDisplay: number,
  config: POIServiceConfig
): Promise<POI[]> {
  const results: POI[] = [];

  try {
    // Query custom API if configured
    if (config.customApiUrl) {
      try {
        const customFeatures = await queryCustomAPI(config.customApiUrl);

        // Filter by viewport bounds
        const viewportFeatures = customFeatures.filter((feature) => {
          if (!feature.geometry || feature.geometry.type !== 'Point') {
            return false;
          }

          const [lng, lat] = feature.geometry.coordinates;
          return (
            lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east
          );
        });

        const customPOIs = viewportFeatures
          .map((feature) => geoJSONFeatureToPOI(feature, center, config.mapName, config.layerId))
          .filter((poi): poi is POI => poi !== null);

        results.push(...customPOIs);
      } catch (error) {
        console.warn('Custom API viewport query failed:', error);
      }
    }

    // Sort by distance from map center
    results.sort((a, b) => {
      const distA = a.distance ?? calculateDistance(center, a.coordinates);
      const distB = b.distance ?? calculateDistance(center, b.coordinates);
      return distA - distB;
    });

    // Limit to maxDisplay closest POIs
    return results.slice(0, maxDisplay);
  } catch (error) {
    console.error('Query POIs for viewport error:', error);
    return results;
  }
}
