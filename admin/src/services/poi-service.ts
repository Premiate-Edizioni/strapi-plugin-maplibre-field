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
  /** City, region, country and other administrative levels, one field each */
  addressDetails?: AddressDetails;
  /** How the location was created: "search" | "poi_click" | "map_click" | "marker_drag" */
  inputMethod?: 'search' | 'poi_click' | 'map_click' | 'marker_drag';
  /** Original metadata preserved from the source */
  metadata?: Record<string, unknown>;
}

/**
 * The administrative levels of a location, kept as separate fields so they can be grouped and
 * filtered on, which the one-line `address` cannot be. Keys are GeocodeJSON's, unchanged.
 *
 * Names are labels in the language they were requested in, not stable keys: the same city can be
 * stored as "Milano" by one editor and "Milan" by another. `country_code` is the only field that
 * does not depend on it.
 */
export interface AddressDetails {
  city?: string;
  /** Province in Italy and much of Europe */
  county?: string;
  /** Region */
  state?: string;
  postcode?: string;
  country?: string;
  /**
   * ISO 3166-1 alpha-2, lowercase: "it". A Nominatim extension, not part of GeocodeJSON (Photon
   * calls it `countrycode`)
   */
  country_code?: string;
  /**
   * The administrative boundaries containing the place, keyed by OSM `admin_level`: in Italy
   * `level4` is the region, `level6` the province, `level8` the comune. What each level means
   * differs by country.
   *
   * @see https://wiki.openstreetmap.org/wiki/Key:admin_level
   */
  admin?: Record<string, string>;
  /** The `accept-language` the names were requested in */
  language?: string;
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
 * Round [lng, lat] to 7 decimals (about 1 cm), the precision OpenStreetMap stores. A point placed
 * on the map comes from a pixel and carries ~15 decimals of floating-point noise.
 */
export function roundCoordinates([lng, lat]: [number, number]): [number, number] {
  return [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
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
  addressDetails?: AddressDetails;
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
  /** Administrative boundaries keyed by OSM `admin_level`: `{ level4: "Lombardia", … }` */
  admin?: Record<string, unknown> | null;
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
 * Whether two administrative levels name the same place, so that printing both would repeat it.
 * Containment rather than equality: a province is often the city plus a qualifier ("New York" /
 * "New York County", "Roma" / "Città Metropolitana di Roma Capitale").
 */
const repeats = (a: string, b: string): boolean => {
  if (!a || !b) {
    return false;
  }
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x.includes(y) || y.includes(x);
};

/**
 * The city of a GeocodeJSON result.
 *
 * GeocodeJSON's `type` names the level the result *is*, and on that level Nominatim leaves the
 * matching field null and carries the value in `name`: a city result has no `city`. Without the
 * fallback a search for "Rivoli" would have no comune at all.
 */
const cityOf = (geocoding: NominatimGeocoding): string =>
  clean(geocoding.city) ||
  clean(geocoding.locality) ||
  (geocoding.type === 'city' || geocoding.type === 'locality' ? clean(geocoding.name) : '');

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

  // A street result has no `street` and carries it in `name`, as a city result does its city (see
  // cityOf). Without the fallback the address loses the very thing it is about.
  const street =
    clean(geocoding.street) || (geocoding.type === 'street' ? clean(geocoding.name) : '');
  const housenumber = clean(geocoding.housenumber);
  const postcode = clean(geocoding.postcode);
  const city = cityOf(geocoding);
  const country = clean(geocoding.country);

  // `state` repeats the city for city-states and city-provinces (e.g. New York, Berlin).
  const state = clean(geocoding.state);
  const region = state.toLowerCase() === city.toLowerCase() ? '' : state;

  // `county` is the province, part of the postal address in Italy and much of Europe. It repeats
  // the city in the metropolitan areas that are both (Milano, Roma, New York County), where one of
  // the two names contains the other — that is what the containment test below catches.
  const county = clean(geocoding.county);
  const province = repeats(county, city) || repeats(county, region) ? '' : county;

  return [
    [street, housenumber].filter(Boolean).join(' '),
    [postcode, city].filter(Boolean).join(' '),
    province,
    region,
    country,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Pick the administrative levels of a Nominatim GeocodeJSON object, one field each.
 *
 * Unlike {@link formatAddress} this drops nothing that repeats: a province named like its city is
 * still the province, and a consumer grouping by `county` needs it there.
 *
 * @param geocoding The `properties.geocoding` object, or null/undefined
 * @param language The `accept-language` the request was made with, recorded alongside the names
 * @returns The fields Nominatim filled in, or undefined when it filled in none
 */
export function extractAddressDetails(
  geocoding: NominatimGeocoding | null | undefined,
  language?: string
): AddressDetails | undefined {
  if (!geocoding) {
    return undefined;
  }

  const fields: AddressDetails = {
    city: cityOf(geocoding),
    county: clean(geocoding.county),
    state: clean(geocoding.state),
    postcode: clean(geocoding.postcode),
    country: clean(geocoding.country),
    country_code: clean(geocoding.country_code).toLowerCase(),
  };
  const details = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== '')
  ) as AddressDetails;

  const admin = Object.fromEntries(
    Object.entries(geocoding.admin ?? {})
      .filter(([level]) => /^level\d+$/.test(level))
      .map(([level, value]) => [level, clean(value)])
      .filter(([, value]) => value !== '')
  );
  if (Object.keys(admin).length > 0) {
    details.admin = admin;
  }

  if (Object.keys(details).length === 0) {
    return undefined;
  }

  return language ? { ...details, language } : details;
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
 * The name is left out when the address already carries it, so a city ("10098 Rivoli, Torino,
 * Piemonte, Italia") or a street is never stated twice.
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
 * The address of a custom POI, from its source's properties.
 *
 * A source's own `address` string wins. Otherwise a source built from OpenStreetMap carries the
 * address as OSM tags, composed here with the same rules as a Nominatim address. `addr:place`
 * stands in for the street on addresses that have none, as OSM uses it. `addr:country` is left
 * out: in OSM it is an ISO code ("IT"), not a name.
 *
 * @see https://wiki.openstreetmap.org/wiki/Key:addr:*
 * @param properties The source feature's properties, or null/undefined
 * @returns The address, or an empty string when the source has none
 */
export function sourceAddress(properties: Record<string, unknown> | null | undefined): string {
  if (!properties) {
    return '';
  }

  const address = clean(properties.address);
  if (address) {
    return address;
  }

  return formatAddress({
    street: clean(properties['addr:street']) || clean(properties['addr:place']),
    housenumber: clean(properties['addr:housenumber']),
    postcode: clean(properties['addr:postcode']),
    city: clean(properties['addr:city']),
    county: clean(properties['addr:province']),
    state: clean(properties['addr:state']),
  });
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

/** The answer of {@link queryNominatim} */
export interface NominatimReverseResult {
  /** The place Nominatim found, when it lies within the radius */
  pois: POI[];
  /**
   * The administrative levels at the point, whether or not a place was within the radius: the
   * nearest place may be too far away for its street to be the point's, but it is almost always in
   * the same city. Without a place within the radius there is no postcode either.
   */
  addressDetails?: AddressDetails;
}

/**
 * Query POIs near coordinates from Nominatim
 * Uses /reverse endpoint with high zoom level to get specific POIs
 * @param lat Latitude
 * @param lng Longitude
 * @param radius Search radius in meters
 * @param nominatimUrl Nominatim API base URL
 * @param language Optional `accept-language` value; Nominatim localises place names accordingly
 * @returns The POI within the radius, if any, and the administrative levels at the point
 */
export async function queryNominatim(
  lat: number,
  lng: number,
  radius: number,
  nominatimUrl: string,
  language?: string
): Promise<NominatimReverseResult> {
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
      return { pois: [] };
    }

    const addressDetails = extractAddressDetails(geocoding, language);
    const [lon, latitude] = feature.geometry.coordinates;
    const coordinates: [number, number] = [Number(lon), Number(latitude)];
    const distance = calculateDistance([lng, lat], coordinates);

    // Only return the place if within radius. Its postcode goes with it: in a city with several,
    // the nearest place may lie in the next postcode area.
    if (distance > radius) {
      const context = { ...addressDetails };
      delete context.postcode;
      const hasLevels = Object.keys(context).some((key) => key !== 'language');
      return hasLevels ? { pois: [], addressDetails: context } : { pois: [] };
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
      addressDetails,
    };

    return { pois: [poi], addressDetails };
  } catch (error) {
    console.error('Nominatim query error:', error);
    return { pois: [] };
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
    address: sourceAddress(properties),
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
