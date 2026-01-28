import React from 'react';
import { render, screen } from '@testing-library/react';
import MapInput from '../../../admin/src/components/MapInput';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@strapi/design-system';

// Mock useStrapiApp and useNotification hooks
jest.mock('@strapi/strapi/admin', () => ({
  useStrapiApp: () => ({
    plugins: {
      'maplibre-field': {
        config: {
          mapStyles: [
            {
              id: 'test',
              name: 'Test Style',
              url: 'https://test-map-style.com/style.json',
              isDefault: true,
            },
          ],
          defaultZoom: 5,
          defaultCenter: [10, 45],
          nominatimUrl: 'https://nominatim.test.com',
        },
      },
    },
  }),
  useNotification: () => ({
    toggleNotification: jest.fn(),
  }),
}));

// Stable mock config object (must be outside jest.mock to avoid re-creation)
const mockPluginConfig = {
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
};

// Mock usePluginConfig hook with stable reference
jest.mock('../../../admin/src/hooks/usePluginConfig', () => ({
  usePluginConfig: () => mockPluginConfig,
}));

// Mock map instance with all required methods
const mockMapInstance = {
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn((event: string, callback: () => void) => {
    // Fire 'load' event immediately for tests
    if (event === 'load') {
      setTimeout(callback, 0);
    }
  }),
  getZoom: jest.fn(() => 5),
  getBounds: jest.fn(() => ({
    getNorth: () => 46,
    getSouth: () => 44,
    getEast: () => 11,
    getWest: () => 9,
  })),
  getCenter: jest.fn(() => ({ lng: 10, lat: 45 })),
  getLayer: jest.fn(() => null), // POI layer doesn't exist in tests
  queryRenderedFeatures: jest.fn(() => []),
  getCanvas: jest.fn(() => ({ style: {} })),
  setStyle: jest.fn(),
  setCenter: jest.fn(),
  setZoom: jest.fn(),
  flyTo: jest.fn(),
  addControl: jest.fn(),
  removeControl: jest.fn(),
  getContainer: jest.fn(() => document.createElement('div')),
};

// Mock react-map-gl with ref forwarding
jest.mock('react-map-gl/maplibre', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(({ children }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        getMap: () => mockMapInstance,
      }));
      return <div data-testid="mock-map">{children}</div>;
    }),
    FullscreenControl: () => <div>FullscreenControl</div>,
    GeolocateControl: () => <div>GeolocateControl</div>,
    Marker: () => <div>Marker</div>,
    NavigationControl: () => <div>NavigationControl</div>,
    Source: ({ children }: any) => <div>{children}</div>,
    Layer: () => null,
  };
});

// Mock SearchBox component
jest.mock('../../../admin/src/components/MapInput/SearchBox', () => ({
  __esModule: true,
  default: () => <div>SearchBox</div>,
}));

// Mock other MapInput components
jest.mock('../../../admin/src/components/MapInput/basemap-control', () => ({
  __esModule: true,
  default: () => <div>BasemapControl</div>,
}));

jest.mock('../../../admin/src/components/MapInput/layer-control', () => ({
  __esModule: true,
  default: () => <div>LayerControl</div>,
}));

jest.mock('../../../admin/src/components/MapInput/credits-control', () => ({
  __esModule: true,
  default: () => <div>CreditsControl</div>,
}));

// Mock POI service
jest.mock('../../../admin/src/services/poi-service', () => ({
  __esModule: true,
  createLocationFeature: jest.fn((coords: [number, number], address?: string) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: { name: address || '', address: address || '' },
  })),
  queryPOIsForViewport: jest.fn(() => Promise.resolve([])),
  searchNearbyPOIsForSnap: jest.fn(() => []),
  findNearestPOI: jest.fn(() => null),
}));

// Mock pmtiles
jest.mock('pmtiles', () => ({
  Protocol: jest.fn(() => ({
    tile: jest.fn(),
  })),
}));

// Mock maplibre-gl
jest.mock('maplibre-gl', () => ({
  __esModule: true,
  default: {
    addProtocol: jest.fn(),
    removeProtocol: jest.fn(),
  },
}));

const MockMapInput = (props: any) => (
  <DesignSystemProvider locale="en">
    <IntlProvider locale="en" messages={{}}>
      <MapInput {...props} />
    </IntlProvider>
  </DesignSystemProvider>
);

describe('MapInput Component', () => {
  const mockOnChange = jest.fn();
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
});
