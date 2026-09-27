import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MapInput from '../../../admin/src/components/MapInput';
import { findNearestPOI, queryPOIsForViewport } from '../../../admin/src/services/poi-service';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@strapi/design-system';
import * as maplibregl from 'maplibre-gl';

// vi.mock factories run before the module body, so anything they close over has to be hoisted too.
const {
  mockPluginConfig,
  mockMapInstance,
  mockMarkers,
  mockSearchBoxProps,
  mockToggleNotification,
} = vi.hoisted(() => ({
  mockSearchBoxProps: vi.fn(),
  mockToggleNotification: vi.fn(),
  // Every Marker the component creates, newest last
  mockMarkers: [] as {
    options: { draggable?: boolean; color?: string };
    lngLat: { lng: number; lat: number };
    handlers: Record<string, () => void>;
  }[],
  // Stable config object: a new reference on every render would retrigger the map effects.
  mockPluginConfig: {
    mapStyles: [
      {
        id: 'test',
        name: 'Test Style',
        url: 'https://test-map-style.com/style.json',
        isDefault: true,
      },
    ],
    defaultZoom: 5,
    defaultCenter: [10, 45] as [number, number],
    geocodingProvider: 'nominatim',
    nominatimUrl: 'https://nominatim.test.com',
    poiDisplayEnabled: undefined as boolean | undefined,
    poiSearchEnabled: undefined as boolean | undefined,
    poiSources: undefined as
      { id: string; name: string; apiUrl: string; enabled?: boolean }[] | undefined,
  },
  // Map instance with all the methods MapInput calls
  mockMapInstance: {
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      // Fire 'load' event immediately for tests
      if (event === 'load') {
        setTimeout(callback, 0);
      }
    }),
    getZoom: vi.fn(() => 5),
    loaded: vi.fn(() => true),
    querySourceFeatures: vi.fn(() => []),
    getBounds: vi.fn(() => ({
      getNorth: () => 46,
      getSouth: () => 44,
      getEast: () => 11,
      getWest: () => 9,
    })),
    getCenter: vi.fn(() => ({ lng: 10, lat: 45 })),
    getLayer: vi.fn(() => null), // POI layer doesn't exist in tests
    queryRenderedFeatures: vi.fn(() => []),
    getCanvas: vi.fn(() => ({ style: {} })),
    project: vi.fn(() => ({ x: 0, y: 0 })),
    setStyle: vi.fn(),
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    hasControl: vi.fn(() => true),
    getSource: vi.fn(() => undefined),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    remove: vi.fn(),
  },
}));

// Mock useStrapiApp and useNotification hooks
vi.mock('@strapi/strapi/admin', () => ({
  useStrapiApp: () => ({
    plugins: {
      'maplibre-field': {
        config: mockPluginConfig,
      },
    },
  }),
  useNotification: () => ({
    toggleNotification: mockToggleNotification,
  }),
}));

// Mock usePluginConfig hook with stable reference
vi.mock('../../../admin/src/hooks/usePluginConfig', () => ({
  usePluginConfig: () => mockPluginConfig,
}));

// Mock SearchBox component, capturing the props it receives (e.g. poiSources)
vi.mock('../../../admin/src/components/MapInput/SearchBox', () => ({
  __esModule: true,
  default: (props: any) => {
    mockSearchBoxProps(props);
    return <div>SearchBox</div>;
  },
}));

// Mock other MapInput components
vi.mock('../../../admin/src/components/MapInput/basemap-control', () => ({
  __esModule: true,
  default: () => <div>BasemapControl</div>,
}));

// Mock LayerControl with a button per layer so tests can simulate the on-map toggle
vi.mock('../../../admin/src/components/MapInput/layer-control', () => ({
  __esModule: true,
  default: ({ layers, onLayerToggle }: any) => (
    <div>
      LayerControl
      {layers.map((layer: any) => (
        <button key={layer.id} onClick={() => onLayerToggle(layer.id, !layer.enabled)}>
          toggle-{layer.id}
        </button>
      ))}
    </div>
  ),
}));

// Mock POI service
vi.mock('../../../admin/src/services/poi-service', () => ({
  __esModule: true,
  createLocationFeature: vi.fn(
    (coords: [number, number], properties: Record<string, any> = {}) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: Object.fromEntries(
        Object.entries(properties).filter(([, v]) => v != null && v !== '')
      ),
    })
  ),
  queryPOIsForViewport: vi.fn(() => Promise.resolve([])),
  searchNearbyCustomPOIs: vi.fn(() => []),
  queryNominatim: vi.fn(() => Promise.resolve([])),
  findNearestPOI: vi.fn(() => null),
  calculateDistance: vi.fn(() => 0),
}));

// Mock pmtiles
// MapInput calls `new Protocol()`, so the mock has to be constructible.
vi.mock('pmtiles', () => ({
  Protocol: class {
    tile = vi.fn();
  },
}));

// Mock maplibre-gl. Everything MapInput constructs has to be constructible — no arrow functions.
vi.mock('maplibre-gl', () => {
  function Marker(this: any, options: { draggable?: boolean; color?: string }) {
    const record = { options, lngLat: { lng: 0, lat: 0 }, handlers: {} as Record<string, any> };
    mockMarkers.push(record);
    this.setLngLat = (lngLat: [number, number]) => {
      record.lngLat = { lng: lngLat[0], lat: lngLat[1] };
      return this;
    };
    this.getLngLat = () => record.lngLat;
    this.addTo = () => this;
    this.on = (event: string, handler: () => void) => {
      record.handlers[event] = handler;
      return this;
    };
    this.remove = vi.fn();
  }
  const control = () =>
    vi.fn(function (this: any, options: unknown) {
      this.options = options;
    });

  return {
    addProtocol: vi.fn(),
    removeProtocol: vi.fn(),
    setWorkerUrl: vi.fn(),
    Map: vi.fn(function () {
      return mockMapInstance;
    }),
    Marker,
    FullscreenControl: control(),
    NavigationControl: control(),
    GeolocateControl: control(),
  };
});

/** What MapLibre does at the end of a pin drag: move the marker, then fire `dragend`. */
const dragMarkerTo = (lng: number, lat: number) => {
  const marker = mockMarkers[mockMarkers.length - 1];
  act(() => {
    marker.lngLat = { lng, lat };
    marker.handlers.dragend();
  });
};

const MockMapInput = (props: any) => (
  <DesignSystemProvider locale="en">
    <IntlProvider locale="en" messages={{}}>
      <MapInput {...props} />
    </IntlProvider>
  </DesignSystemProvider>
);

describe('MapInput Component', () => {
  const mockOnChange = vi.fn();
  const defaultProps = {
    intlLabel: { id: 'test.label', defaultMessage: 'Map' },
    name: 'testMap',
    onChange: mockOnChange,
    value: null,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
    mockToggleNotification.mockClear();
  });

  test('renders without crashing', () => {
    render(<MockMapInput {...defaultProps} />);
    expect(screen.getByText('Map')).toBeInTheDocument();
  });

  test('the field label comes from Field.Label, not a hand-styled Typography', () => {
    render(<MockMapInput {...defaultProps} />);
    // Field.Label renders a <label>; a Typography copying its variant/colour/weight renders a <span>.
    expect(screen.getByText('Map').tagName).toBe('LABEL');
  });

  test('creates a MapLibre map in its own container, on the configured view', () => {
    vi.mocked(maplibregl.Map).mockClear();
    render(<MockMapInput {...defaultProps} />);

    expect(maplibregl.Map).toHaveBeenCalledTimes(1);
    const [options] = vi.mocked(maplibregl.Map).mock.calls[0] as any[];
    expect(options.container).toBeInstanceOf(HTMLDivElement);
    expect(options.style).toBe('https://test-map-style.com/style.json');
    expect(options.center).toEqual([10, 45]);
    expect(options.zoom).toBe(5);
  });

  test('displays initial coordinates when value is null', () => {
    render(<MockMapInput {...defaultProps} />);
    // With our mocked config, defaultCenter is [10, 45]
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    // With no location picked yet, Name and Address are both there but empty
    expect(screen.getAllByDisplayValue('')).toHaveLength(2);
  });

  test('displays coordinates from value prop', () => {
    // Use proper GeoJSON Feature format with properties.name or properties.address
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: { name: 'Milano, Italia' },
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    expect(screen.getByDisplayValue('9.195')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45.464')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Milano, Italia')).toBeInTheDocument();
  });

  test('shows the same Name and Address fields whether or not the value is a POI', () => {
    const plain = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: { address: 'Via Roma, Milano' },
    });
    const poi = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: {
        name: 'Skatespot Centro',
        sourceId: 'SM-skatespots:123',
        address: 'Via Roma 1, Milano',
      },
    });

    const { rerender } = render(<MockMapInput {...defaultProps} value={plain} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();

    rerender(<MockMapInput {...defaultProps} value={poi} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  test('the Address field holds the address and the Name field the short name', () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [7.5176764, 45.0697151] },
      properties: { name: 'Rivoli', address: '10098 Rivoli, Piemonte, Italia' },
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    expect(screen.getByDisplayValue('Rivoli')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10098 Rivoli, Piemonte, Italia')).toBeInTheDocument();
  });

  test('names [0, 0] "Null Island" instead of giving it an address', () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {},
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    // The joke belongs in Name — it is a place name, not a postal address.
    expect(screen.getByDisplayValue('Null Island')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toHaveValue('');
  });

  test('keeps the Address field when the value has no address', () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: {
        name: 'Skatespot Centro',
        sourceId: 'SM-skatespots:123',
      },
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Skatespot Centro')).toBeInTheDocument();
  });

  test('map controls are added in a fixed order, with the configured fullscreen mode', () => {
    // MapLibre appends controls in addControl order, so this order is the on-screen stack order:
    // fullscreen (acts on the container) above zoom/compass/geolocate (act on the view).
    mockMapInstance.addControl.mockClear();

    render(<MockMapInput {...defaultProps} />);

    const added = mockMapInstance.addControl.mock.calls.map(([control]) => control);
    const lastInstance = (ctor: unknown) => {
      const { instances } = vi.mocked(ctor as () => unknown).mock;
      return instances[instances.length - 1];
    };
    expect(added.slice(0, 3)).toEqual([
      lastInstance(maplibregl.FullscreenControl),
      lastInstance(maplibregl.NavigationControl),
      lastInstance(maplibregl.GeolocateControl),
    ]);
    expect(maplibregl.FullscreenControl).toHaveBeenLastCalledWith({ pseudo: true });
    // Without tracking, the geolocate button only re-centres and the user can never switch the
    // location overlay back off.
    expect(maplibregl.GeolocateControl).toHaveBeenLastCalledWith({ trackUserLocation: true });
  });

  test('placing a point recentres the map without changing the zoom', async () => {
    // The recentre only applies to a field that already holds a value (isDefaultViewState).
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: { address: 'Via Roma, Milano' },
    });
    mockMapInstance.easeTo.mockClear();

    render(<MockMapInput {...defaultProps} value={value} />);
    dragMarkerTo(9.19, 45.4642);

    await waitFor(() => expect(mockMapInstance.easeTo).toHaveBeenCalled());
    // The zoom is the user's working context — choosing a point must not throw them back out.
    for (const [options] of mockMapInstance.easeTo.mock.calls) {
      expect(options).not.toHaveProperty('zoom');
    }
  });

  test('a search result flies the camera, and nothing cancels the flight', async () => {
    mockMapInstance.flyTo.mockClear();
    mockMapInstance.easeTo.mockClear();

    render(<MockMapInput {...defaultProps} />);
    const { onSelectResult } =
      mockSearchBoxProps.mock.calls[mockSearchBoxProps.mock.calls.length - 1][0];

    onSelectResult({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.19, 45.46] },
      properties: { name: 'Duomo', address: 'Piazza del Duomo, Milano' },
    });

    await waitFor(() => expect(mockMapInstance.flyTo).toHaveBeenCalledTimes(1));
    // An easeTo here would cut the flight short a frame after it starts.
    expect(mockMapInstance.easeTo).not.toHaveBeenCalled();
  });

  test('the geolocate accuracy circle is made click-through', () => {
    // Without this the circle — often kilometres wide on desktop — covers the location pin and
    // swallows the mousedown that starts a drag.
    const injected = document.getElementById('maplibre-field-overrides');
    expect(injected?.textContent).toContain(
      '.maplibregl-user-location-accuracy-circle{pointer-events:none}'
    );
  });

  test('main marker is draggable', () => {
    render(<MockMapInput {...defaultProps} />);
    expect(mockMarkers[mockMarkers.length - 1].options.draggable).toBe(true);
  });

  test('dragging the main marker updates coordinates when no POI is nearby', async () => {
    // findNearestPOI is mocked to return null, i.e. nothing within snap radius
    render(<MockMapInput {...defaultProps} />);

    dragMarkerTo(9.19, 45.4642);

    await waitFor(() => expect(mockOnChange).toHaveBeenCalledTimes(1));

    const { name, value, type } = mockOnChange.mock.calls[0][0].target;
    expect(name).toBe('testMap');
    expect(type).toBe('json');

    const feature = JSON.parse(value);
    expect(feature.geometry.coordinates).toEqual([9.19, 45.4642]);
    expect(feature.properties.inputMethod).toBe('marker_drag');

    // Coordinate fields reflect the dragged position
    expect(screen.getByDisplayValue('9.19')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45.4642')).toBeInTheDocument();
  });

  test('dragging the main marker snaps to a nearby POI', async () => {
    // A POI sits within the snap radius of the drop point
    vi.mocked(findNearestPOI).mockReturnValueOnce({
      id: 'poi-1',
      name: 'Skatespot Centro',
      type: 'skating_spot',
      coordinates: [9.2, 45.47],
      address: 'Via Roma 1, Milano',
      distance: 3,
    } as any);

    render(<MockMapInput {...defaultProps} />);

    dragMarkerTo(9.19, 45.4642);

    await waitFor(() => expect(mockOnChange).toHaveBeenCalledTimes(1));

    const feature = JSON.parse(mockOnChange.mock.calls[0][0].target.value);
    // Snapped to the POI's coordinates, not the raw drop point
    expect(feature.geometry.coordinates).toEqual([9.2, 45.47]);
    expect(feature.properties.name).toBe('Skatespot Centro');
    expect(feature.properties.inputMethod).toBe('poi_click');
  });

  test('a drag that snaps back onto the saved point puts the pin back on it', async () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.2, 45.47] },
      properties: { name: 'Skatespot Centro' },
    });
    // The snap lands exactly where the field already is, so no coordinate changes
    vi.mocked(findNearestPOI).mockReturnValueOnce({
      id: 'poi-1',
      name: 'Skatespot Centro',
      type: 'skating_spot',
      coordinates: [9.2, 45.47],
      distance: 3,
    } as any);

    render(<MockMapInput {...defaultProps} value={value} />);
    const marker = mockMarkers[mockMarkers.length - 1];
    dragMarkerTo(9.20003, 45.47002);

    await waitFor(() => expect(mockOnChange).toHaveBeenCalledTimes(1));
    expect(marker.lngLat).toEqual({ lng: 9.2, lat: 45.47 });
  });

  test('a snapped POI raises one localized notification, not two', async () => {
    vi.mocked(findNearestPOI).mockReturnValueOnce({
      id: 'poi-1',
      name: 'Skatespot Centro',
      type: 'skating_spot',
      coordinates: [9.2, 45.47],
      mapName: 'Skatespots',
      distance: 3,
    } as any);

    render(<MockMapInput {...defaultProps} />);

    dragMarkerTo(9.19, 45.4642);

    await waitFor(() => expect(mockToggleNotification).toHaveBeenCalledTimes(1));
    expect(mockToggleNotification).toHaveBeenCalledWith({
      type: 'success',
      message: 'Selected Skatespot Centro from Skatespots (3m away)',
    });
  });

  test('loads the POIs for the opening view without waiting for a load event', async () => {
    const original = {
      poiDisplayEnabled: mockPluginConfig.poiDisplayEnabled,
      poiSources: mockPluginConfig.poiSources,
    };
    mockPluginConfig.poiDisplayEnabled = true;
    mockPluginConfig.poiSources = [
      { id: 'spots', name: 'Skatespots', apiUrl: 'https://poi.test/spots.geojson' },
    ];
    // 'load' may already be over by the time the field subscribes, and then never fires again.
    mockMapInstance.once.mockImplementation(() => {});
    mockMapInstance.getZoom.mockReturnValue(12);
    vi.mocked(queryPOIsForViewport).mockClear();

    try {
      render(<MockMapInput {...defaultProps} />);
      await waitFor(() => expect(queryPOIsForViewport).toHaveBeenCalled());
    } finally {
      Object.assign(mockPluginConfig, original);
      mockMapInstance.getZoom.mockReturnValue(5);
    }
  });

  test('a pan during a POI fetch loads the new view, and the stale answer is dropped', async () => {
    const original = {
      poiDisplayEnabled: mockPluginConfig.poiDisplayEnabled,
      poiSources: mockPluginConfig.poiSources,
    };
    mockPluginConfig.poiDisplayEnabled = true;
    mockPluginConfig.poiSources = [
      { id: 'spots', name: 'Skatespots', apiUrl: 'https://poi.test/spots.geojson' },
    ];
    mockMapInstance.getZoom.mockReturnValue(12);
    mockMapInstance.on.mockClear();
    mockMapInstance.addSource.mockClear();

    const poiNamed = (name: string) => ({
      id: name,
      name,
      type: 'poi',
      coordinates: [9, 45],
      address: '',
      source: 'custom',
      layerId: 'spots',
    });
    let answerFirst: (pois: unknown[]) => void = () => {};
    vi.mocked(queryPOIsForViewport)
      .mockClear()
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve as never)))
      .mockImplementationOnce(() => Promise.resolve([poiNamed('New view')] as never));

    const handler = (event: string) =>
      mockMapInstance.on.mock.calls.find(([name]) => name === event)![1] as () => void;
    const drawnNames = () =>
      mockMapInstance.addSource.mock.calls
        .filter(([id]) => id === 'poi-markers')
        .map(([, spec]) => (spec as any).data.features.map((f: any) => f.properties.name));

    try {
      render(<MockMapInput {...defaultProps} />);
      act(() => handler('style.load')());
      await waitFor(() => expect(queryPOIsForViewport).toHaveBeenCalledTimes(1));

      // The user pans while the first request is still out
      act(() => handler('moveend')());
      await waitFor(() => expect(queryPOIsForViewport).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(drawnNames().slice(-1)).toEqual([['New view']]));

      // The first request answers last, for a view the map has already left
      await act(async () => answerFirst([poiNamed('Old view')]));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(drawnNames().flat()).not.toContain('Old view');
    } finally {
      Object.assign(mockPluginConfig, original);
      mockMapInstance.getZoom.mockReturnValue(5);
    }
  });

  test('clicking a PMTiles POI selects it', () => {
    const original = {
      poiDisplayEnabled: mockPluginConfig.poiDisplayEnabled,
      poiSources: mockPluginConfig.poiSources,
    };
    mockPluginConfig.poiDisplayEnabled = true;
    mockPluginConfig.poiSources = [
      {
        id: 'parks',
        name: 'Parks',
        apiUrl: 'https://tiles.test/parks.pmtiles',
        type: 'pmtiles',
        sourceLayer: 'parks',
      } as any,
    ];
    mockMapInstance.getLayer.mockImplementation(((id: string) =>
      id === 'pmtiles-circle-parks' ? {} : null) as any);
    mockMapInstance.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: 7,
        layer: { id: 'pmtiles-circle-parks' },
        geometry: { coordinates: [9.18, 45.47] },
        properties: { name: 'Parco Sempione', address: 'Milano' },
      },
    ] as any);
    mockMapInstance.on.mockClear();

    try {
      render(<MockMapInput {...defaultProps} />);
      const [, onClick] = mockMapInstance.on.mock.calls.find(([event]) => event === 'click')!;
      act(() => (onClick as (evt: unknown) => void)({ point: { x: 0, y: 0 } }));

      const feature = JSON.parse(mockOnChange.mock.calls[0][0].target.value);
      expect(feature.geometry.coordinates).toEqual([9.18, 45.47]);
      expect(feature.properties).toMatchObject({ name: 'Parco Sempione', source: 'parks' });
    } finally {
      Object.assign(mockPluginConfig, original);
      mockMapInstance.getLayer.mockImplementation(() => null);
    }
  });

  describe('search sees the live layer-control toggle, not just the config default', () => {
    const originalPoiSources = mockPluginConfig.poiSources;
    const originalPoiDisplayEnabled = mockPluginConfig.poiDisplayEnabled;
    const originalPoiSearchEnabled = mockPluginConfig.poiSearchEnabled;

    beforeEach(() => {
      mockSearchBoxProps.mockClear();
      mockPluginConfig.poiDisplayEnabled = true;
      mockPluginConfig.poiSearchEnabled = true;
      // Disabled by default in config...
      mockPluginConfig.poiSources = [
        {
          id: 'skatespots',
          name: 'Skatespots',
          apiUrl: 'https://poi.test/skatespots.geojson',
          enabled: false,
        },
      ];
    });

    afterEach(() => {
      mockPluginConfig.poiSources = originalPoiSources;
      mockPluginConfig.poiDisplayEnabled = originalPoiDisplayEnabled;
      mockPluginConfig.poiSearchEnabled = originalPoiSearchEnabled;
    });

    test('a source turned on in the layer panel becomes searchable, even if disabled by default', () => {
      render(<MockMapInput {...defaultProps} />);

      const lastSearchBoxCall = () =>
        mockSearchBoxProps.mock.calls[mockSearchBoxProps.mock.calls.length - 1][0];

      // Config default: SearchBox should not see it as enabled yet
      const initialSources = lastSearchBoxCall().poiSources;
      expect(initialSources.find((s: any) => s.id === 'skatespots').enabled).toBe(false);

      // User turns the layer on via the on-map layer-control panel
      fireEvent.click(screen.getByText('toggle-skatespots'));

      const updatedSources = lastSearchBoxCall().poiSources;
      expect(updatedSources.find((s: any) => s.id === 'skatespots').enabled).toBe(true);
    });
  });
});
