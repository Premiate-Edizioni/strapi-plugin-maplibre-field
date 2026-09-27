import { describe, expect, test, vi } from 'vitest';
import {
  buildColorMatchExpression,
  buildPoiFeatureCollection,
  syncPoiLayers,
  type PoiLayersState,
} from '../../../admin/src/components/MapInput/poi-layers';

/** Just enough of a style to hold sources and layers, the way MapLibre's does. */
const createFakeMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Map<string, unknown>();
  return {
    sources,
    layers,
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    setPaintProperty: vi.fn(),
    /** What `setStyle` does to everything the new style did not declare. */
    wipeStyle() {
      sources.clear();
      layers.clear();
    },
  };
};

const poi = {
  id: 'poi-1',
  name: 'Skatespot Centro',
  type: 'skating_spot',
  coordinates: [9.19, 45.46] as [number, number],
  address: '',
  source: 'custom' as const,
  layerId: 'spots',
};

const pmtilesSource = {
  id: 'parks',
  name: 'Parks',
  apiUrl: 'https://tiles.test/parks.pmtiles',
  type: 'pmtiles' as const,
  sourceLayer: 'parks',
};

const state = (overrides: Partial<PoiLayersState> = {}): PoiLayersState => ({
  geojson: buildPoiFeatureCollection([poi], null),
  colorExpression: '#cc0000',
  pmtiles: [],
  pmtilesMinZoom: 10,
  ...overrides,
});

describe('buildColorMatchExpression', () => {
  test('colours each POI by its layer, with a fallback', () => {
    expect(
      buildColorMatchExpression([
        { id: 'spots', name: 'Spots', enabled: true, color: '#cc0000' },
        { id: 'plain', name: 'Plain', enabled: true },
      ])
    ).toEqual(['match', ['get', 'layerId'], 'spots', '#cc0000', '#999999']);
  });

  test('is a plain colour when no layer has one — a match with no branches is invalid', () => {
    expect(buildColorMatchExpression([{ id: 'plain', name: 'Plain', enabled: true }])).toBe(
      '#999999'
    );
  });
});

describe('syncPoiLayers', () => {
  test('adds the GeoJSON source and its layers, then only updates the data', () => {
    const map = createFakeMap();

    syncPoiLayers(map as never, state());
    expect([...map.sources.keys()]).toEqual(['poi-markers']);
    expect([...map.layers.keys()]).toEqual(['poi-circles', 'poi-labels']);

    const next = buildPoiFeatureCollection([poi], poi);
    syncPoiLayers(map as never, state({ geojson: next }));
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.sources.get('poi-markers')!.setData).toHaveBeenCalledWith(next);
  });

  test('removes the GeoJSON layers when there is nothing to draw', () => {
    const map = createFakeMap();
    syncPoiLayers(map as never, state());

    syncPoiLayers(map as never, state({ geojson: null }));
    expect(map.sources.size).toBe(0);
    expect(map.layers.size).toBe(0);
  });

  test('draws everything again after a style swap has wiped it', () => {
    const map = createFakeMap();
    const withParks = state({ pmtiles: [{ source: pmtilesSource, enabled: true }] });
    syncPoiLayers(map as never, withParks);
    const before = [...map.layers.keys()];

    map.wipeStyle();
    syncPoiLayers(map as never, withParks);
    expect([...map.layers.keys()]).toEqual(before);
  });

  test('adds a PMTiles source when switched on and takes it off when switched off', () => {
    const map = createFakeMap();

    syncPoiLayers(map as never, state({ pmtiles: [{ source: pmtilesSource, enabled: true }] }));
    expect(map.addSource).toHaveBeenCalledWith('pmtiles-source-parks', {
      type: 'vector',
      url: 'pmtiles://https://tiles.test/parks.pmtiles',
    });
    expect(map.layers.get('pmtiles-circle-parks')).toMatchObject({
      'source-layer': 'parks',
      minzoom: 10,
    });

    syncPoiLayers(map as never, state({ pmtiles: [{ source: pmtilesSource, enabled: false }] }));
    expect(map.sources.has('pmtiles-source-parks')).toBe(false);
    expect(map.layers.has('pmtiles-circle-parks')).toBe(false);
    expect(map.layers.has('pmtiles-label-parks')).toBe(false);
  });
});
