export default {
  mapStyles: {
    type: 'array',
    default: [
      {
        id: 'ofm',
        name: 'OpenFreeMap',
        url: 'https://tiles.openfreemap.org/styles/liberty',
        isDefault: true,
      },
    ],
  },
  defaultZoom: {
    type: 'number',
    default: 4.5,
  },
  defaultCenter: {
    type: 'array',
    default: [0, 0],
  },
  geocodingProvider: {
    type: 'string',
    default: 'nominatim',
  },
  nominatimUrl: {
    type: 'string',
    default: 'https://nominatim.openstreetmap.org',
  },
  poiDisplayEnabled: {
    type: 'boolean',
    default: true,
    description: 'Display POI markers on map',
  },
  poiMinZoom: {
    type: 'number',
    default: 10,
    description: 'Minimum zoom level to display POI markers',
  },
  poiMaxDisplay: {
    type: 'number',
    default: 100,
    description: 'Maximum number of POIs to display on map',
  },
  poiSearchEnabled: {
    type: 'boolean',
    default: true,
    description: 'Include custom API results in search field',
  },
  poiSnapRadius: {
    type: 'number',
    default: 5,
    description: 'Snap radius in meters for double-click POI detection (default: 5m)',
  },
};
