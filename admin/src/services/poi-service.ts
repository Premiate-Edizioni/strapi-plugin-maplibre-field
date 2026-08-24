/**
 * POI Service Layer
 *
 * Handles POI queries from multiple sources (Nominatim, Custom GeoJSON APIs)
 * Provides distance calculations, viewport filtering, and data transformation
 */

/**
 * Nominatim requests deliberately send no custom headers — in particular no `User-Agent`.
 *
 * This code runs in the browser, where a `User-Agent` set on fetch() is silently dropped by
 * Chromium (crbug.com/571722) and, in the browsers that do honour it, is not CORS-safelisted: it
 * turns every call into a preflight OPTIONS plus the GET, doubling the load on a service whose
 * usage policy caps clients at 1 request per second.
 *
 * The policy asks for "a valid HTTP Referer *or* User-Agent identifying the application", and the
 * browser already sends the CMS origin as `Referer`, so the requirement is met without the header.
 * Adding one back would cost a round-trip and buy nothing.
 */

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
  /** How the location was created: "search" | "poi_click" | "map_click" | "marker_drag" */
  inputMethod?: 'search' | 'poi_click' | 'map_click' | 'marker_drag';
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
  sourceType?: 'geojson' | 'pmtiles'; // Skip HTTP fetch for pmtiles sources
  language?: string; // Sent to Nominatim as `accept-language`
}

// =============================================================================
// Nominatim GeocodeJSON
// =============================================================================

/**
 * The `properties.geocoding` object of a Nominatim `format=geocodejson` result.
 *
 * GeocodeJSON normalises the address keys across countries, which `format=geojson` and `jsonv2` do
 * not: a single `city` instead of the `city|town|village` variance, and `street`/`housenumber`
 * instead of the raw OSM tags `road`/`house_number`. The same names are emitted by Photon and
 * Addok, so switching geocoding provider would not change the shape we read.
 *
 * @see https://github.com/geocoders/geocodejson-spec/blob/master/draft/README.md
 */
export interface NominatimGeocoding {
  /** One of "house", "street", "locality", "city", "region", "country" */
  type?: string | null;
  name?: string | null;
  housenumber?: string | null;
  street?: string | null;
  locality?: string | null;
  district?: string | null;
  postcode?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  country?: string | null;
  country_code?: string | null;
  /** Nominatim's suggested label: every administrative level, comma-joined */
  label?: string | null;
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  [key: string]: unknown;
}

/** Trimmed string value, or an empty string for anything Nominatim left null, absent or blank. */
const clean = (value: unknown): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : '';

/**
 * Build a readable address string from a Nominatim GeocodeJSON object.
 *
 * Nominatim does no postal formatting of its own: its `label` (and the `display_name` of the other
 * formats) concatenates every administrative level it holds for the place, in the same order for
 * every country, giving strings shaped like
 * "<name>, <housenumber>, <street>, <quarter>, <district>, <city>, <county>, <region>, <postcode>,
 * <country>" — most of which is not part of an address.
 *
 * This keeps a whitelist of postal fields only and joins them in one generic order. It deliberately
 * does *not* reorder per country: a US address comes out as "5th Avenue 350, …" rather than
 * "350 5th Avenue". Consumers needing locale-correct rendering should format it themselves from the
 * coordinates and name.
 *
 * @param geocoding The `properties.geocoding` object, or null/undefined
 * @returns Formatted address, or an empty string when no usable field is present
 */
export function formatAddress(geocoding: NominatimGeocoding | null | undefined): string {
  if (!geocoding) {
    return '';
  }

  // GeocodeJSON's `type` names the level the result *is*, and on that level Nominatim leaves the
  // matching field null and carries the value in `name`: a street result has no `street`, a city
  // result has no `city`. Without these fallbacks the address loses the very thing it is about —
  // a search for "Rivoli" would format as "10098, Piemonte, Italia", a postcode with no comune.
  const name = clean(geocoding.name);
  const street = clean(geocoding.street) || (geocoding.type === 'street' ? name : '');
  const housenumber = clean(geocoding.housenumber);
  const postcode = clean(geocoding.postcode);
  const city =
    clean(geocoding.city) ||
    clean(geocoding.locality) ||
    (geocoding.type === 'city' || geocoding.type === 'locality' ? name : '');
  const country = clean(geocoding.country);

  // `state` repeats the city for city-states and city-provinces (e.g. New York, Berlin).
  const state = clean(geocoding.state);
  const region = state.toLowerCase() === city.toLowerCase() ? '' : state;

  return [
    [street, housenumber].filter(Boolean).join(' '),
    [postcode, city].filter(Boolean).join(' '),
    region,
    country,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Pick a short name for a reverse-geocoding hit.
 *
 * Named places carry `name`. Unnamed features — a bin, a bench, a plain house — do not, and there
 * the whole formatted address would end up repeated verbatim in the name. Fall back to the street
 * (with its housenumber when there is one), then to the city: enough to identify the point without
 * restating the address.
 *
 * @param geocoding The `properties.geocoding` object, or null/undefined
 * @returns A short name, or an empty string when no usable field is present
 */
export function formatName(geocoding: NominatimGeocoding | null | undefined): string {
  if (!geocoding) {
    return '';
  }

  const name = clean(geocoding.name);
  if (name) {
    return name;
  }

  const street = [clean(geocoding.street), clean(geocoding.housenumber)].filter(Boolean).join(' ');

  return street || clean(geocoding.city) || clean(geocoding.locality);
}

/**
 * Build the one-line label for a geocoding result in the search dropdown.
 *
 * A result list has to be both scannable and unambiguous. The name on its own repeats for every
 * house on a street; the address on its own hides which place was matched. Show the name first and
 * the address as context — the same shape as Nominatim's own `label`, minus the administrative
 * levels {@link formatAddress} drops.
 *
 * The name is left out when the address already carries it, so a city ("10098 Rivoli, Piemonte,
 * Italia") or a street is never stated twice.
 *
 * @param geocoding The `properties.geocoding` object, or null/undefined
 * @returns The label, or an empty string when no usable field is present
 */
export function formatLabel(geocoding: NominatimGeocoding | null | undefined): string {
  const address = formatAddress(geocoding);
  const name = formatName(geocoding);

  if (!address || !name) {
    return address || name;
  }

  return address.toLowerCase().includes(name.toLowerCase()) ? address : `${name}, ${address}`;
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
 * @param language Optional `accept-language` value; Nominatim localises place names accordingly
 * @returns Array of POIs
 */
export async function queryNominatim(
  lat: number,
  lng: number,
  radius: number,
  nominatimUrl: string,
  language?: string
): Promise<POI[]> {
  try {
    // Use zoom=18 to get building/POI level detail (higher zoom = more specific)
    // zoom 3: country, zoom 10: city, zoom 18: building
    const params = new URLSearchParams({
      format: 'geocodejson',
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      addressdetails: '1',
    });

    if (language) {
      params.set('accept-language', language);
    }

    // No custom headers: see the note on Nominatim requests at the top of this file.
    const response = await fetch(`${nominatimUrl}/reverse?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    const geocoding: NominatimGeocoding | undefined = feature?.properties?.geocoding;

    if (!feature?.geometry?.coordinates || !geocoding) {
      return [];
    }

    const [lon, latitude] = feature.geometry.coordinates;
    const coordinates: [number, number] = [Number(lon), Number(latitude)];
    const distance = calculateDistance([lng, lat], coordinates);

    // Only return if within radius
    if (distance > radius) {
      return [];
    }

    const address = formatAddress(geocoding);

    // Convert Nominatim response to POI
    const poi: POI = {
      id: `nominatim-${geocoding.place_id || Date.now()}`,
      name: formatName(geocoding) || 'Unknown Location',
      type: geocoding.osm_value || geocoding.osm_key || 'address',
      coordinates,
      address,
      distance,
      metadata: {
        osm_id: geocoding.osm_id,
        osm_type: geocoding.osm_type,
        place_id: geocoding.place_id,
        addresstype: geocoding.type,
        class: geocoding.osm_key,
        category: geocoding.osm_value,
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
 * Search one custom POI source near coordinates, for snap (double-click, marker drag).
 *
 * This queries the custom source only. Nominatim covers the basemap's own POIs and is independent
 * of how many custom sources are configured, so the caller queries it once per gesture rather than
 * once per source — see `setLocationWithPOISnap()` in the MapInput component.
 *
 * @param lat Latitude
 * @param lng Longitude
 * @param config POI service configuration
 * @returns Array of POIs from the custom source, empty if none is configured or reachable
 */
export async function searchNearbyCustomPOIs(
  lat: number,
  lng: number,
  config: POIServiceConfig
): Promise<POI[]> {
  // pmtiles sources are snapped through queryRenderedFeatures, not fetched over HTTP
  if (!config.customApiUrl || config.sourceType === 'pmtiles') {
    return [];
  }

  try {
    const customFeatures = await queryCustomAPI(config.customApiUrl);

    // Filter by distance from click point
    const nearbyFeatures = filterByDistance(customFeatures, [lng, lat], config.radius);

    return nearbyFeatures
      .map((feature) => geoJSONFeatureToPOI(feature, [lng, lat], config.mapName, config.layerId))
      .filter((poi): poi is POI => poi !== null);
  } catch (error) {
    console.warn('Custom API query failed:', error);
    return [];
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
    // Query custom API if configured (skipped for pmtiles sources — rendered via vector tiles)
    if (config.customApiUrl && config.sourceType !== 'pmtiles') {
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
