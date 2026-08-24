/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  calculateDistance,
  createLocationFeature,
  filterByDistance,
  findNearestPOI,
  formatAddress,
  geoJSONFeatureToPOI,
  queryCustomAPI,
  queryNominatim,
  queryPOIsForViewport,
  searchNearbyPOIsForSnap,
  type GeoJSONFeature,
  type POI,
  type POIServiceConfig,
} from '../../../admin/src/services/poi-service';

const NOMINATIM_URL = 'https://nominatim.test';
const CUSTOM_API_URL = 'https://api.test/pois';

const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => data,
});

/** Routes each request by URL, so a test can assert which endpoints were actually hit. */
const stubFetch = (byUrl: Record<string, unknown>) => {
  const fetchMock = vi.fn(async (url: string) => {
    const match = Object.keys(byUrl).find((prefix) => url.startsWith(prefix));
    if (match === undefined) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return jsonResponse(byUrl[match]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const pointFeature = (
  coordinates: [number, number],
  properties: Record<string, unknown> = {}
): GeoJSONFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties,
});

const featureCollection = (features: GeoJSONFeature[]) => ({
  type: 'FeatureCollection',
  features,
});

const config = (overrides: Partial<POIServiceConfig> = {}): POIServiceConfig => ({
  nominatimUrl: NOMINATIM_URL,
  radius: 100,
  categories: [],
  ...overrides,
});

beforeEach(() => {
  // These services report failures by logging and degrading, which would otherwise flood the run.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('calculateDistance', () => {
  test('is zero for identical coordinates', () => {
    expect(calculateDistance([9.19, 45.46], [9.19, 45.46])).toBe(0);
  });

  test('measures one degree of latitude as ~111.19 km', () => {
    // A degree of latitude is constant on a sphere, so this pins the Haversine radius.
    expect(calculateDistance([0, 0], [0, 1])).toBeCloseTo(111194.9, 0);
  });

  test('is symmetric', () => {
    const milano: [number, number] = [9.19, 45.46];
    const roma: [number, number] = [12.5, 41.9];
    expect(calculateDistance(milano, roma)).toBeCloseTo(calculateDistance(roma, milano), 6);
  });
});

describe('createLocationFeature', () => {
  test('builds an RFC 7946 Point feature at the given coordinates', () => {
    expect(createLocationFeature([9.19, 45.46], { name: 'Piazza Velasca' })).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.19, 45.46] },
      properties: { name: 'Piazza Velasca' },
    });
  });

  test('drops null, undefined and empty-string properties', () => {
    const feature = createLocationFeature([9.19, 45.46], {
      name: 'Piazza Velasca',
      address: '',
      category: undefined,
      source: null as unknown as string,
    });

    expect(feature.properties).toEqual({ name: 'Piazza Velasca' });
  });
});

describe('geoJSONFeatureToPOI', () => {
  test('rejects non-Point geometries', () => {
    const polygon = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: {},
    } as unknown as GeoJSONFeature;

    expect(geoJSONFeatureToPOI(polygon)).toBeNull();
  });

  test('carries name, address and source metadata across', () => {
    const feature = {
      ...pointFeature([9.19, 45.46], { name: 'Skate Park', address: 'Via Roma 1' }),
    };
    feature.id = 'sp-1';

    const poi = geoJSONFeatureToPOI(feature, undefined, 'Skatespots', 'layer-1');

    expect(poi).toMatchObject({
      id: 'sp-1',
      name: 'Skate Park',
      address: 'Via Roma 1',
      source: 'custom',
      mapName: 'Skatespots',
      layerId: 'layer-1',
    });
  });

  test('falls back to placeholders when name and address are missing', () => {
    const poi = geoJSONFeatureToPOI(pointFeature([9.19, 45.46], { name: null }));

    expect(poi).toMatchObject({ name: 'Unnamed Location', address: '' });
    expect(poi!.id).toMatch(/^custom-/);
  });

  test('derives the category from type, then sport, then leisure', () => {
    expect(geoJSONFeatureToPOI(pointFeature([9, 45], { sport: 'skateboard' }))!.type).toBe(
      'skateboard'
    );
    expect(geoJSONFeatureToPOI(pointFeature([9, 45], { leisure: 'pitch' }))!.type).toBe('pitch');
    expect(geoJSONFeatureToPOI(pointFeature([9, 45], {}))!.type).toBe('poi');
  });

  test('adds a distance only when reference coordinates are given', () => {
    expect(geoJSONFeatureToPOI(pointFeature([9.19, 45.46]))!.distance).toBeUndefined();
    expect(geoJSONFeatureToPOI(pointFeature([9.19, 45.46]), [9.19, 45.46])!.distance).toBe(0);
  });
});

describe('filterByDistance', () => {
  test('keeps only features within the radius', () => {
    const near = pointFeature([9.19, 45.461]); // ~111 m away
    const far = pointFeature([9.19, 45.56]); // ~11 km away

    const result = filterByDistance([near, far], [9.19, 45.46], 500);

    expect(result).toEqual([near]);
  });

  test('discards features that are not Points', () => {
    const polygon = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: {},
    } as unknown as GeoJSONFeature;

    expect(filterByDistance([polygon], [9.19, 45.46], 100_000)).toEqual([]);
  });
});

describe('findNearestPOI', () => {
  const poi = (id: string, coordinates: [number, number], distance?: number): POI => ({
    id,
    name: id,
    type: 'poi',
    coordinates,
    address: '',
    distance,
    source: 'custom',
  });

  test('returns null for an empty list', () => {
    expect(findNearestPOI([9.19, 45.46], [])).toBeNull();
  });

  test('picks the closest POI and stamps its distance', () => {
    const far = poi('far', [9.19, 45.56]);
    const near = poi('near', [9.19, 45.461]);

    const nearest = findNearestPOI([9.19, 45.46], [far, near]);

    expect(nearest!.id).toBe('near');
    expect(nearest!.distance).toBeCloseTo(111.2, 0);
  });

  test('trusts a distance already on the POI over recomputing it', () => {
    // Viewport queries pre-compute distances; findNearestPOI must not silently override them.
    const preComputed = poi('preComputed', [9.19, 45.56], 1);
    const actuallyNearer = poi('actuallyNearer', [9.19, 45.461]);

    expect(findNearestPOI([9.19, 45.46], [preComputed, actuallyNearer])!.id).toBe('preComputed');
  });

  test('returns a copy rather than mutating the input POI', () => {
    const original = poi('a', [9.19, 45.461]);

    const nearest = findNearestPOI([9.19, 45.46], [original]);

    expect(nearest).not.toBe(original);
    expect(original.distance).toBeUndefined();
  });
});

describe('queryCustomAPI', () => {
  test('returns every feature when no search query is given', async () => {
    stubFetch({
      [CUSTOM_API_URL]: featureCollection([
        pointFeature([9, 45], { name: 'Skate Park' }),
        pointFeature([9, 45], { name: 'Bus Stop' }),
      ]),
    });

    expect(await queryCustomAPI(CUSTOM_API_URL)).toHaveLength(2);
  });

  test('filters by name, case-insensitively', async () => {
    stubFetch({
      [CUSTOM_API_URL]: featureCollection([
        pointFeature([9, 45], { name: 'Skate Park' }),
        pointFeature([9, 45], { name: 'Bus Stop' }),
        pointFeature([9, 45], { name: null }),
      ]),
    });

    const result = await queryCustomAPI(CUSTOM_API_URL, 'SKATE');

    expect(result.map((f) => f.properties.name)).toEqual(['Skate Park']);
  });

  test('degrades to an empty list on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }))
    );

    expect(await queryCustomAPI(CUSTOM_API_URL)).toEqual([]);
  });

  test('degrades to an empty list when the payload is not a FeatureCollection', async () => {
    stubFetch({ [CUSTOM_API_URL]: { type: 'Feature' } });

    expect(await queryCustomAPI(CUSTOM_API_URL)).toEqual([]);
  });
});

describe('formatAddress', () => {
  // Every fixture below is a verbatim `properties.geocoding` object returned by
  // nominatim.openstreetmap.org, trimmed only of members this function ignores.

  test('keeps the postal fields and drops the administrative hierarchy', () => {
    // Nominatim's own label for this place is
    // "21 House of Stories - Milano Città Studi, 24, Via Enrico Noë, Buenos Aires - Venezia,
    //  Municipio 3, Milano, <municipality>, Milano, Lombardia, 20133, Italia"
    expect(
      formatAddress({
        type: 'house',
        name: '21 House of Stories - Milano Città Studi',
        housenumber: '24',
        street: 'Via Enrico Noë',
        locality: 'Buenos Aires - Venezia',
        district: 'Municipio 3',
        postcode: '20133',
        city: 'Milano',
        county: 'Milano',
        state: 'Lombardia',
        country: 'Italia',
        country_code: 'it',
      })
    ).toBe('Via Enrico Noë 24, 20133 Milano, Lombardia, Italia');
  });

  test('falls back to the name on results that are themselves a street', () => {
    // Nominatim leaves `street` null when the result *is* the street.
    expect(
      formatAddress({
        type: 'street',
        name: 'Piazza Velasca',
        housenumber: null,
        street: null,
        postcode: '20122',
        city: 'Milano',
        state: 'Lombardia',
        country: 'Italia',
      })
    ).toBe('Piazza Velasca, 20122 Milano, Lombardia, Italia');
  });

  test('omits the region when it merely repeats the city', () => {
    expect(
      formatAddress({
        type: 'house',
        name: 'WBAI-FM (New York)',
        housenumber: '350',
        street: '5th Avenue',
        district: 'Manhattan',
        postcode: '10118',
        city: 'New York',
        county: 'New York County',
        state: 'New York',
        country: 'United States',
      })
    ).toBe('5th Avenue 350, 10118 New York, United States');
  });

  test('handles a result with no house number', () => {
    expect(
      formatAddress({
        type: 'house',
        name: 'Buckingham Palace',
        street: 'Buckingham Gate',
        district: 'Victoria',
        postcode: 'SW1A 1AA',
        city: 'Greater London',
        state: 'England',
        country: 'United Kingdom',
      })
    ).toBe('Buckingham Gate, SW1A 1AA Greater London, England, United Kingdom');
  });

  test('returns an empty string rather than stray separators when nothing is usable', () => {
    expect(formatAddress(null)).toBe('');
    expect(formatAddress({})).toBe('');
    expect(formatAddress({ street: '  ', city: null, country: '' })).toBe('');
  });
});

describe('queryNominatim', () => {
  const reverseResult = (
    overrides: Record<string, unknown> = {},
    coordinates: [number, number] = [9.1901, 45.4601]
  ) => ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: {
          geocoding: {
            place_id: 42,
            osm_type: 'node',
            osm_id: 7,
            osm_key: 'place',
            osm_value: 'square',
            type: 'house',
            name: 'Piazza Velasca',
            street: 'Piazza Velasca',
            postcode: '20122',
            city: 'Milano',
            state: 'Lombardia',
            country: 'Italia',
            ...overrides,
          },
        },
      },
    ],
  });

  test('asks for POI-level detail at the given coordinates', async () => {
    const fetchMock = stubFetch({ [NOMINATIM_URL]: reverseResult() });

    await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL);

    // zoom=18 is building/POI level; anything lower snaps to city or country.
    // geocodejson normalises the address keys across countries; the other formats return raw OSM tags.
    expect(fetchMock).toHaveBeenCalledWith(
      `${NOMINATIM_URL}/reverse?format=geocodejson&lat=45.4601&lon=9.1901&zoom=18&addressdetails=1`
    );
  });

  test('forwards the admin language so place names come back localised', async () => {
    const fetchMock = stubFetch({ [NOMINATIM_URL]: reverseResult() });

    await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL, 'de');

    expect(fetchMock.mock.calls[0][0]).toContain('accept-language=de');
  });

  test('sends no custom headers, which would force a CORS preflight on every call', async () => {
    // A `User-Agent` here is dropped by Chromium and is not CORS-safelisted elsewhere, so setting
    // one turns each request into OPTIONS + GET against a service capped at 1 req/s. The browser's
    // `Referer` already satisfies Nominatim's identification requirement.
    const fetchMock = stubFetch({ [NOMINATIM_URL]: reverseResult() });

    await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL);

    expect(fetchMock.mock.calls[0]).toHaveLength(1);
  });

  test('maps a reverse-geocoding hit onto a POI', async () => {
    stubFetch({ [NOMINATIM_URL]: reverseResult() });

    const [poi] = await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL);

    expect(poi).toMatchObject({
      id: 'nominatim-42',
      name: 'Piazza Velasca',
      type: 'square',
      coordinates: [9.1901, 45.4601],
      address: 'Piazza Velasca, 20122 Milano, Lombardia, Italia',
      source: 'nominatim',
    });
  });

  test('drops a hit that lies outside the requested radius', async () => {
    // Nominatim answers with the nearest match at any distance, so the radius is enforced here.
    stubFetch({ [NOMINATIM_URL]: reverseResult({}, [9.1901, 45.6]) });

    expect(await queryNominatim(45.4601, 9.1901, 100, NOMINATIM_URL)).toEqual([]);
  });

  test('falls back to the formatted address when the place has no name', async () => {
    stubFetch({ [NOMINATIM_URL]: reverseResult({ name: null }) });

    const [poi] = await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL);

    expect(poi.name).toBe('Piazza Velasca, 20122 Milano, Lombardia, Italia');
  });

  test('degrades to an empty list when the response carries no feature', async () => {
    stubFetch({ [NOMINATIM_URL]: { type: 'FeatureCollection', features: [] } });

    expect(await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL)).toEqual([]);
  });

  test('degrades to an empty list when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    expect(await queryNominatim(45.4601, 9.1901, 1000, NOMINATIM_URL)).toEqual([]);
  });
});

describe('searchNearbyPOIsForSnap', () => {
  test('combines Nominatim and custom GeoJSON results', async () => {
    stubFetch({
      [NOMINATIM_URL]: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [9.1901, 45.4601] },
            properties: { geocoding: { place_id: 1, name: 'Piazza Velasca' } },
          },
        ],
      },
      [CUSTOM_API_URL]: featureCollection([
        pointFeature([9.1901, 45.4601], { name: 'Skate Park' }),
        pointFeature([9.5, 45.4601], { name: 'Too Far' }),
      ]),
    });

    const results = await searchNearbyPOIsForSnap(
      45.4601,
      9.1901,
      config({ customApiUrl: CUSTOM_API_URL, radius: 500 })
    );

    expect(results.map((poi) => poi.source)).toEqual(['nominatim', 'custom']);
    expect(results.map((poi) => poi.name)).toEqual(['Piazza Velasca', 'Skate Park']);
  });

  test('never fetches a pmtiles source, which is queried through the rendered tiles instead', async () => {
    const fetchMock = stubFetch({
      [NOMINATIM_URL]: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [9.1901, 45.4601] },
            properties: { geocoding: { place_id: 1, name: 'Piazza Velasca' } },
          },
        ],
      },
      [CUSTOM_API_URL]: featureCollection([]),
    });

    await searchNearbyPOIsForSnap(
      45.4601,
      9.1901,
      config({ customApiUrl: CUSTOM_API_URL, sourceType: 'pmtiles' })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(NOMINATIM_URL);
  });
});

describe('queryPOIsForViewport', () => {
  const bounds = { north: 46, south: 45, east: 10, west: 9 };
  const center: [number, number] = [9.19, 45.46];

  test('excludes POIs outside the viewport bounds', async () => {
    stubFetch({
      [CUSTOM_API_URL]: featureCollection([
        pointFeature([9.2, 45.46], { name: 'Inside' }),
        pointFeature([12.5, 45.46], { name: 'East of bounds' }),
        pointFeature([9.2, 44.5], { name: 'South of bounds' }),
      ]),
    });

    const results = await queryPOIsForViewport(
      bounds,
      center,
      10,
      config({ customApiUrl: CUSTOM_API_URL })
    );

    expect(results.map((poi) => poi.name)).toEqual(['Inside']);
  });

  test('returns the closest POIs to the centre first, capped at maxDisplay', async () => {
    stubFetch({
      [CUSTOM_API_URL]: featureCollection([
        pointFeature([9.5, 45.46], { name: 'Far' }),
        pointFeature([9.2, 45.46], { name: 'Near' }),
        pointFeature([9.3, 45.46], { name: 'Middle' }),
      ]),
    });

    const results = await queryPOIsForViewport(
      bounds,
      center,
      2,
      config({ customApiUrl: CUSTOM_API_URL })
    );

    expect(results.map((poi) => poi.name)).toEqual(['Near', 'Middle']);
  });

  test('does not fetch pmtiles sources, which render straight from the vector tiles', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const results = await queryPOIsForViewport(
      bounds,
      center,
      10,
      config({ customApiUrl: CUSTOM_API_URL, sourceType: 'pmtiles' })
    );

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
