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

const nominatimHit = (displayName: string, lon: string, lat: string) => ({
  display_name: displayName,
  lon,
  lat,
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
      const fetchMock = stubFetch({ [NOMINATIM_URL]: [] });

      await performSearch('piazza velasca', config());

      expect(fetchMock).toHaveBeenCalledWith(
        `${NOMINATIM_URL}/search?q=piazza%20velasca&format=json&addressdetails=1&limit=5`
      );
    });

    test('sends no custom headers, which would force a CORS preflight on every keystroke', async () => {
      // See the note in poi-service.ts: a `User-Agent` is dropped by Chromium, and elsewhere costs
      // an extra OPTIONS round-trip per search against a service capped at 1 req/s.
      const fetchMock = stubFetch({ [NOMINATIM_URL]: [] });

      await performSearch('piazza velasca', config());

      expect(fetchMock.mock.calls[0]).toHaveLength(1);
    });

    test('maps a hit onto a LocationFeature marked as searched', async () => {
      stubFetch({
        [NOMINATIM_URL]: [nominatimHit('Piazza Velasca, Milano, Italia', '9.1901', '45.4601')],
      });

      const results = await performSearch('piazza velasca', config());

      expect(results).toEqual([
        {
          id: 'nominatim-0',
          place_name: 'Piazza Velasca, Milano, Italia',
          feature: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [9.1901, 45.4601] },
            properties: {
              name: 'Piazza Velasca, Milano, Italia',
              address: 'Piazza Velasca, Milano, Italia',
              source: 'nominatim',
              inputMethod: 'search',
            },
          },
          source: 'nominatim',
        },
      ]);
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
        [NOMINATIM_URL]: [nominatimHit('Piazza Velasca, Milano, Italia', '9.1901', '45.4601')],
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
      const fetchMock = stubFetch({ [NOMINATIM_URL]: [] });

      await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [geojsonSource({ enabled: false })] })
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain(NOMINATIM_URL);
    });

    test('ignores POI sources entirely when POI search is off', async () => {
      const fetchMock = stubFetch({ [NOMINATIM_URL]: [] });

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
          return jsonResponse([nominatimHit('Piazza Velasca', '9.1901', '45.4601')]);
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
      const fetchMock = stubFetch({ [NOMINATIM_URL]: [] });
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
      stubFetch({ [NOMINATIM_URL]: [] });

      const results = await performSearch(
        'velasca',
        config({ poiSearchEnabled: true, poiSources: [pmtilesSource] })
      );

      expect(results).toEqual([]);
    });
  });
});
