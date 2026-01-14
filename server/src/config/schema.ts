export default {
  mapStyles: {
    type: 'array',
    default: [
      {
        id: 'satellite',
        name: 'Satellite',
        url: 'https://api.maptiler.com/maps/satellite-v4/style.json?key=sOr6q24xbu24UhKuyK8a',
        isDefault: true,
      },
      {
        id: 'osm',
        name: 'OpenStreetMap',
        url: 'https://api.maptiler.com/maps/openstreetmap/style.json?key=sOr6q24xbu24UhKuyK8a',
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
