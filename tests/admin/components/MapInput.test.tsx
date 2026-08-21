import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MapInput from '../../../admin/src/components/MapInput';
import { findNearestPOI } from '../../../admin/src/services/poi-service';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@strapi/design-system';

// vi.mock factories run before the module body, so anything they close over has to be hoisted too.
const { mockPluginConfig, mockMapInstance } = vi.hoisted(() => ({
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
    toggleNotification: vi.fn(),
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
    }));
    return <div data-testid="mock-map">{children}</div>;
  }),
  FullscreenControl: () => <div>FullscreenControl</div>,
  GeolocateControl: () => <div>GeolocateControl</div>,
  Marker: ({ draggable, onClick, onDragEnd }: any) => (
    <div
      data-testid="main-marker"
      data-draggable={draggable ? 'true' : 'false'}
      onClick={onClick}
      // `dragEnd` has no DOM equivalent; use blur as a distinct trigger so the
      // test can fire the marker's drag path without going through onClick.
      onBlur={() => onDragEnd?.({ lngLat: { lng: 9.19, lat: 45.4642 } })}
    >
      Marker
    </div>
  ),
  NavigationControl: () => <div>NavigationControl</div>,
  Source: ({ children }: any) => <div>{children}</div>,
  Layer: () => null,
}));

// Mock SearchBox component
vi.mock('../../../admin/src/components/MapInput/SearchBox', () => ({
  __esModule: true,
  default: () => <div>SearchBox</div>,
}));

// Mock other MapInput components
vi.mock('../../../admin/src/components/MapInput/basemap-control', () => ({
  __esModule: true,
  default: () => <div>BasemapControl</div>,
}));

vi.mock('../../../admin/src/components/MapInput/layer-control', () => ({
  __esModule: true,
  default: () => <div>LayerControl</div>,
}));

// Mock POI service
vi.mock('../../../admin/src/services/poi-service', () => ({
  __esModule: true,
  createLocationFeature: vi.fn((coords: [number, number], properties: Record<string, any> = {}) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: Object.fromEntries(
      Object.entries(properties).filter(([, v]) => v != null && v !== '')
    ),
  })),
  queryPOIsForViewport: vi.fn(() => Promise.resolve([])),
  searchNearbyPOIsForSnap: vi.fn(() => []),
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
  getVersion: vi.fn(() => '6.0.0'),
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
  });

  test('renders without crashing', () => {
    render(<MockMapInput {...defaultProps} />);
    expect(screen.getByText('Map')).toBeInTheDocument();
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
    // When no address is defined and coordinates are not [0, 0], the field should be empty
    expect(screen.getByDisplayValue('')).toBeInTheDocument();
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

  test('shows Address label and no Full Address field when value has no sourceId', () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: { name: 'Via Roma, Milano' },
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.queryByText('Full Address')).not.toBeInTheDocument();
    expect(screen.queryByText('POI Name')).not.toBeInTheDocument();
  });

  test('shows POI Name and Full Address fields when value has sourceId', () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: {
        name: 'Skatespot Centro',
        sourceId: 'SM-skatespots:123',
        address: 'Via Roma 1, Milano',
      },
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    expect(screen.getByText('POI Name')).toBeInTheDocument();
    expect(screen.getByText('Full Address')).toBeInTheDocument();
    expect(screen.queryByText('Address')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Skatespot Centro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Via Roma 1, Milano')).toBeInTheDocument();
  });

  test('does not show Full Address field when POI has no address property', () => {
    const value = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [9.195, 45.464] },
      properties: {
        name: 'Skatespot Centro',
        sourceId: 'SM-skatespots:123',
      },
    });

    render(<MockMapInput {...defaultProps} value={value} />);
    expect(screen.getByText('POI Name')).toBeInTheDocument();
    expect(screen.queryByText('Full Address')).not.toBeInTheDocument();
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
});
