/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  performSearch,
  type POISource,
  type SearchConfig,
} from '../../../admin/src/services/geocoder-service';

const NOMINATIM_URL = 'https://nominatim.test';
const CUSTOM_API_URL = 'https://api.test/skatespots';

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

/** A Nominatim `format=geocodejson` response carrying the given features */
const nominatimResponse = (features: unknown[] = []) => ({
  type: 'FeatureCollection',
  features,
});

const nominatimHit = (geocoding: Record<string, unknown>, lon: number, lat: number) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { geocoding },
});

const geojsonSource = (overrides: Partial<POISource> = {}): POISource => ({
  id: 'skatespots',
  name: 'Skatespots',
  apiUrl: CUSTOM_API_URL,
  ...overrides,
});

const config = (overrides: Partial<SearchConfig> = {}): SearchConfig => ({
  nominatimUrl: NOMINATIM_URL,
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('performSearch', () => {
  describe('Nominatim results', () => {
    test('escapes the query and asks for at most five hits', async () => {
      const fetchMock = stubFetch({ [NOMINATIM_URL]: nominatimResponse() });

      await performSearch('piazza velasca', config());

      expect(fetchMock).toHaveBeenCalledWith(
        `${NOMINATIM_URL}/search?q=piazza+velasca&format=geocodejson&addressdetails=1&limit=5`
      );
    });

    test('forwards the admin language so place names come back localised', async () => {
      const fetchMock = stubFetch({ [NOMINATIM_URL]: nominatimResponse() });

      await performSearch('piazza velasca', config({ language: 'de' }));

      expect(fetchMock.mock.calls[0][0]).toContain('accept-language=de');
    });

    test('sends no custom headers, which would force a CORS preflight on every keystroke', async () => {
      // See the note in poi-service.ts: a `User-Agent` is dropped by Chromium, and elsewhere costs
      // an extra OPTIONS round-trip per search against a service capped at 1 req/s.
      const fetchMock = stubFetch({ [NOMINATIM_URL]: nominatimResponse() });

      await performSearch('piazza velasca', config());

      expect(fetchMock.mock.calls[0]).toHaveLength(1);
    });

    test('maps a hit onto a LocationFeature marked as searched', async () => {
      stubFetch({
        [NOMINATIM_URL]: nominatimResponse([
          nominatimHit(
            {
              type: 'street',
              name: 'Piazza Velasca',
              postcode: '20122',
              city: 'Milano',
              state: 'Lombardia',
              country: 'Italia',
            },
            9.1901,
            45.4601
          ),
        ]),
      });

      const results = await performSearch('piazza velasca', config());

      expect(results).toEqual([
        {
          id: 'nominatim-0',
          // The dropdown shows name + address; here the address already opens with the
          // name, because the result is the street itself.
          place_name: 'Piazza Velasca, 20122 Milano, Lombardia, Italia',
          feature: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [9.1901, 45.4601] },
            properties: {
              name: 'Piazza Velasca',
              address: 'Piazza Velasca, 20122 Milano, Lombardia, Italia',
              source: 'nominatim',
              inputMethod: 'search',
            },
          },
          source: 'nominatim',
        },
      ]);
    });

    test('keeps a named place identifiable in the dropdown', async () => {
      // A search for a comune returns type "city" with the comune in `name`: the dropdown has to
      // show it, or the entry reads as a bare postcode and region.
      stubFetch({
        [NOMINATIM_URL]: nominatimResponse([
          nominatimHit(
            {
              type: 'city',
              name: 'Rivoli',
              postcode: '10098',
              county: 'Torino',
              state: 'Piemonte',
              country: 'Italia',
            },
            7.5176764,
            45.0697151
          ),
        ]),
      });

      const [result] = await performSearch('rivoli', config());

      expect(result.place_name).toBe('10098 Rivoli, Torino, Piemonte, Italia');
      expect(result.feature.properties.name).toBe('Rivoli');
      expect(result.feature.properties.address).toBe('10098 Rivoli, Torino, Piemonte, Italia');
    });

    test('returns no Nominatim results when the request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('network down');
        })
      );

      expect(await performSearch('piazza velasca', config())).toEqual([]);
    });
  });

  describe('GeoJSON POI sources', () => {
    test('lists custom POIs before Nominatim addresses', async () => {
      // POIs are the more specific answer, so they have to stay at the top of the list.
      stubFetch({
        [CUSTOM_API_URL]: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [9.19, 45.46] },
              properties: {
                name: 'Velasca Skatespot',
                address: 'Via Velasca 1',
                type: 'skating_spot',
              },
            },
          ],
        },
        [NOMINATIM_URL]: nominatimResponse([
          nominatimHit(
            {
              type: 'street',
              name: 'Piazza Velasca',
              postcode: '20122',
              city: 'Milano',
              state: 'Lombardia',
              country: 'Italia',
            },
            9.1901,
            45.4601
          ),
        ]),
      });

      const results = await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [geojsonSource()] })
      );

      expect(results.map((result) => result.source)).toEqual(['custom', 'nominatim']);
      expect(results[0]).toMatchObject({
        id: 'poi-skatespots-0',
        place_name: 'Velasca Skatespot',
        feature: {
          properties: {
            name: 'Velasca Skatespot',
            address: 'Via Velasca 1',
            source: 'custom',
            sourceId: 'skatespots',
            sourceLayer: 'Skatespots',
            category: 'skating_spot',
            inputMethod: 'search',
          },
        },
      });
    });

    test('skips sources that are explicitly disabled', async () => {
      const fetchMock = stubFetch({ [NOMINATIM_URL]: nominatimResponse() });

      await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [geojsonSource({ enabled: false })] })
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain(NOMINATIM_URL);
    });

    test('ignores POI sources entirely when POI search is off', async () => {
      const fetchMock = stubFetch({ [NOMINATIM_URL]: nominatimResponse() });

      await performSearch('velasca', config({ poiSources: [geojsonSource()] }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain(NOMINATIM_URL);
    });

    test('still returns Nominatim results when a POI source is unreachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.startsWith(CUSTOM_API_URL)) {
            throw new Error('POI source down');
          }
          return jsonResponse(
            nominatimResponse([nominatimHit({ name: 'Piazza Velasca' }, 9.1901, 45.4601)])
          );
        })
      );

      const results = await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [geojsonSource()] })
      );

      expect(results.map((result) => result.source)).toEqual(['nominatim']);
    });
  });

  describe('PMTiles POI sources', () => {
    const pmtilesSource = geojsonSource({
      id: 'skatespots',
      type: 'pmtiles',
      sourceLayer: 'spots',
    });

    test('searches the tiles already rendered on the map instead of fetching', async () => {
      const fetchMock = stubFetch({ [NOMINATIM_URL]: nominatimResponse() });
      const queryMapFeatures = vi.fn(() => [
        {
          geometry: { type: 'Point', coordinates: [9.19, 45.46] },
          properties: { name: 'Velasca Skatespot', address: 'Via Velasca 1', type: 'skating_spot' },
        },
        {
          geometry: { type: 'Point', coordinates: [9.5, 45.5] },
          properties: { name: 'Somewhere Else' },
        },
      ]);

      const results = await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [pmtilesSource], queryMapFeatures })
      );

      expect(queryMapFeatures).toHaveBeenCalledWith('pmtiles-source-skatespots', 'spots');
      // Only Nominatim was fetched: the PMTiles source has no HTTP endpoint to search.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(results.map((result) => result.place_name)).toEqual(['Velasca Skatespot']);
      expect(results[0].feature.properties).toMatchObject({
        source: 'custom',
        sourceId: 'skatespots',
        sourceLayer: 'spots',
        category: 'skating_spot',
        inputMethod: 'search',
      });
    });

    test('yields no PMTiles results when the map cannot be queried', async () => {
      stubFetch({ [NOMINATIM_URL]: nominatimResponse() });

      const results = await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [pmtilesSource] })
      );

      expect(results).toEqual([]);
    });
  });
});
