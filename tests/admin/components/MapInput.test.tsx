import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MapInput from '../../../admin/src/components/MapInput';
import { findNearestPOI } from '../../../admin/src/services/poi-service';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@strapi/design-system';

// vi.mock factories run before the module body, so anything they close over has to be hoisted too.
const {
  mockPluginConfig,
  mockMapInstance,
  mockSearchBoxProps,
  mockToggleNotification,
  mockUseControl,
} = vi.hoisted(() => ({
  mockSearchBoxProps: vi.fn(),
  mockToggleNotification: vi.fn(),
  mockUseControl: vi.fn(),
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
    setStyle: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    getContainer: vi.fn(() => document.createElement('div')),
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

// Mock react-map-gl with ref forwarding
vi.mock('react-map-gl/maplibre', () => ({
  __esModule: true,
  default: React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      getMap: () => mockMapInstance,
      // MapRef proxies the map's camera methods; handleSearchResult calls flyTo through it.
      flyTo: mockMapInstance.flyTo,
    }));
    return <div data-testid="mock-map">{children}</div>;
  }),
  // MapInput builds its own FullscreenControl on top of useControl (see index.tsx)
  useControl: mockUseControl,
  GeolocateControl: () => <div>GeolocateControl</div>,
  Marker: ({ draggable, onDragEnd }: any) => (
    <div
      data-testid="main-marker"
      data-draggable={draggable ? 'true' : 'false'}
      // `dragEnd` has no DOM equivalent; blur stands in for it so the test can
      // fire the marker's drag path.
      onBlur={() => onDragEnd?.({ lngLat: { lng: 9.19, lat: 45.4642 } })}
    >
      Marker
    </div>
  ),
  NavigationControl: () => <div>NavigationControl</div>,
  Source: ({ children }: any) => <div>{children}</div>,
  Layer: () => null,
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

// Mock maplibre-gl
vi.mock('maplibre-gl', () => ({
  addProtocol: vi.fn(),
  removeProtocol: vi.fn(),
  setWorkerUrl: vi.fn(),
}));

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

  test('displays map component', () => {
    render(<MockMapInput {...defaultProps} />);
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
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

  test('map controls are built in a fixed order, with the configured fullscreen mode', () => {
    // MapLibre appends controls in addControl order, so this order is the on-screen stack order:
    // fullscreen (acts on the container) above zoom/compass/geolocate (act on the view).
    const built: string[] = [];
    // `new` is used on these, so they have to be constructible — no arrow functions.
    const record = (name: string) =>
      function () {
        built.push(name);
        return { _setupUI: () => {}, _container: document.createElement('div') };
      };
    const mapLib = {
      FullscreenControl: vi.fn(record('fullscreen')),
      NavigationControl: vi.fn(record('navigation')),
      GeolocateControl: vi.fn(record('geolocate')),
    };
    mockUseControl.mockClear();

    render(<MockMapInput {...defaultProps} />);

    // useControl is mocked, so it records one call per control per render; the real hook memoizes.
    // The first render's three calls are the ones that define the stack order.
    for (const [onCreate] of mockUseControl.mock.calls.slice(0, 3)) {
      onCreate({ mapLib });
    }

    expect(built).toEqual(['fullscreen', 'navigation', 'geolocate']);
    // react-map-gl's own FullscreenControl silently drops `pseudo`; ours must not.
    expect(mapLib.FullscreenControl).toHaveBeenCalledWith({ pseudo: true });
    // Without tracking, the geolocate button only re-centres and the user can never switch the
    // location overlay back off.
    expect(mapLib.GeolocateControl).toHaveBeenCalledWith({ trackUserLocation: true });
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
    fireEvent.blur(screen.getByTestId('main-marker'));

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
    expect(screen.getByTestId('main-marker')).toHaveAttribute('data-draggable', 'true');
  });

  test('dragging the main marker updates coordinates when no POI is nearby', async () => {
    // findNearestPOI is mocked to return null, i.e. nothing within snap radius
    render(<MockMapInput {...defaultProps} />);

    // The mocked Marker fires onDragEnd with [9.19, 45.4642] on blur
    fireEvent.blur(screen.getByTestId('main-marker'));

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

    fireEvent.blur(screen.getByTestId('main-marker'));

    await waitFor(() => expect(mockOnChange).toHaveBeenCalledTimes(1));

    const feature = JSON.parse(mockOnChange.mock.calls[0][0].target.value);
    // Snapped to the POI's coordinates, not the raw drop point
    expect(feature.geometry.coordinates).toEqual([9.2, 45.47]);
    expect(feature.properties.name).toBe('Skatespot Centro');
    expect(feature.properties.inputMethod).toBe('poi_click');
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

    fireEvent.blur(screen.getByTestId('main-marker'));

    await waitFor(() => expect(mockToggleNotification).toHaveBeenCalledTimes(1));
    expect(mockToggleNotification).toHaveBeenCalledWith({
      type: 'success',
      message: 'Selected Skatespot Centro from Skatespots (3m away)',
    });
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
