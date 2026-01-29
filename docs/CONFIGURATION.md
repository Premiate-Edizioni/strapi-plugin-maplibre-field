# Configuration Guide

Complete configuration reference for the MapLibre Field plugin.

## Table of Contents

- [Plugin Configuration](#plugin-configuration)
- [Map Styles](#map-styles)
- [Map Attributions](#map-attributions)
- [Geocoding Configuration](#geocoding-configuration)
- [POI Configuration](#poi-configuration)
- [Security Middleware](#security-middleware)

## Plugin Configuration

All plugin configuration is done in `config/plugins.ts` (or `.js` for JavaScript projects).

### Basic Configuration

```typescript
// config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      // Map style configuration
      mapStyles: [
        {
          id: "ofm",
          name: "OpenFreeMap",
          url: "https://tiles.openfreemap.org/styles/liberty",
          isDefault: true,
        },
      ],
      
      // Default map position
      defaultCenter: [9.19, 45.46], // [longitude, latitude] - Milano, Italy
      defaultZoom: 13,
      
      // Geocoding
      geocodingProvider: "nominatim",
      nominatimUrl: "https://nominatim.openstreetmap.org",

      // POI configuration (optional)
      poiDisplayEnabled: true,
      poiMinZoom: 10,
      poiMaxDisplay: 100,
      poiSearchEnabled: true,
      poiSnapRadius: 5,
      poiSources: [],
    },
  },
};
```

### Configuration Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mapStyles` | `MapStyle[]` | Demo tiles | Array of map style configurations |
| `defaultCenter` | `[number, number]` | `[0, 0]` | Initial map center [longitude, latitude] |
| `defaultZoom` | `number` | `4.5` | Initial zoom level (0-20) |
| `geocodingProvider` | `string` | `'nominatim'` | Geocoding service provider |
| `nominatimUrl` | `string` | `'https://nominatim.openstreetmap.org'` | Nominatim API endpoint |
| `poiDisplayEnabled` | `boolean` | `true` | Display POI markers on map |
| `poiMinZoom` | `number` | `10` | Minimum zoom to show POI markers |
| `poiMaxDisplay` | `number` | `100` | Maximum POIs displayed at once |
| `poiSearchEnabled` | `boolean` | `true` | Include custom API in search |
| `poiSnapRadius` | `number` | `5` | Snap radius in meters for POI detection |
| `poiSources` | `POISource[]` | `[]` | Array of custom POI sources |

### MapStyle Interface

```typescript
interface MapStyle {
  id: string;           // Unique identifier
  name: string;         // Display name in basemap switcher
  url: string;          // URL to MapLibre style JSON
  isDefault?: boolean;  // Set as default style (optional)
}
```

## Map Styles

The plugin uses **MapLibre GL JS** and supports any style following the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/).

### MapLibre Demo Tiles (Free)

Public demo tiles - no API key required:

```typescript
mapStyles: [
  {
    id: "demo",
    name: "Demo",
    url: "https://demotiles.maplibre.org/style.json",
    isDefault: true,
  },
]
```

**Note**: Demo tiles are for testing only. For production, use a commercial provider or self-hosted solution.

### MapTiler (Commercial)

Multiple professional styles with global coverage:

```typescript
// In config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "streets",
          name: "Streets",
          url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${env('MAPTILER_API_KEY')}`,
          isDefault: true,
        },
        {
          id: "satellite",
          name: "Satellite",
          url: `https://api.maptiler.com/maps/satellite-v4/style.json?key=${env('MAPTILER_API_KEY')}`,
        },
        {
          id: "outdoor",
          name: "Outdoor",
          url: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${env('MAPTILER_API_KEY')}`,
        },
      ],
    },
  },
});
```

```bash
# In .env file
MAPTILER_API_KEY=your_actual_api_key_here
```

**Resources**:
- [MapTiler](https://www.maptiler.com/) - Sign up for free tier
- [MapTiler Styles](https://cloud.maptiler.com/maps/) - Browse available styles

### Stadia Maps (Commercial)

OpenStreetMap-based styles:

```typescript
// In config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "alidade",
          name: "Alidade Smooth",
          url: `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${env('STADIA_API_KEY')}`,
          isDefault: true,
        },
        {
          id: "osm-bright",
          name: "OSM Bright",
          url: `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${env('STADIA_API_KEY')}`,
        },
      ],
    },
  },
});
```

```bash
# In .env file
STADIA_API_KEY=your_actual_api_key_here
```

**Resources**:
- [Stadia Maps](https://stadiamaps.com/) - Sign up for free tier
- [Stadia Styles](https://docs.stadiamaps.com/themes/) - Available styles

### PMTiles (Self-hosted)

[PMTiles](https://docs.protomaps.com/pmtiles/) is a cloud-native, single-file format for storing map tiles. Host complete map tile archives on any static file server or object storage (S3, Cloudflare R2, etc.) without running a tile server.

**Built-in `pmtiles://` Protocol Support**

The plugin has native support for the `pmtiles://` protocol:

```typescript
// In config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "pmtiles-basemap",
          name: "Self-hosted Basemap",
          url: "https://your-server.com/styles/pmtiles-style.json",
          isDefault: true,
        },
      ],
    },
  },
};
```

**Style JSON Example**

Your style JSON file should reference PMTiles sources using the `pmtiles://` protocol:

```json
{
  "version": 8,
  "name": "PMTiles Basemap",
  "sources": {
    "protomaps": {
      "type": "vector",
      "url": "pmtiles://https://your-server.com/tiles/basemap.pmtiles"
    }
  },
  "layers": [
    {
      "id": "water",
      "type": "fill",
      "source": "protomaps",
      "source-layer": "water",
      "paint": {
        "fill-color": "#a0c4ff"
      }
    }
  ]
}
```

**Benefits**:

✅ **No tile server required** - Serve from S3, R2, GitHub Pages, any static host  
✅ **Single file** - One `.pmtiles` file contains all zoom levels  
✅ **Cost-effective** - Only storage and bandwidth costs  
✅ **HTTP range requests** - Downloads only needed tiles  
✅ **Offline-friendly** - Download entire file for offline use  

**Resources**:

- [Protomaps Documentation](https://docs.protomaps.com/)
- [PMTiles Specification](https://github.com/protomaps/PMTiles)
- [Protomaps Basemaps](https://docs.protomaps.com/basemaps/) - Pre-built OSM basemaps
- [go-pmtiles](https://github.com/protomaps/go-pmtiles) - CLI tool to create PMTiles

### Custom Styles

Create your own map style using [Maputnik](https://maputnik.github.io/), a visual style editor for MapLibre/Mapbox styles.

**Steps**:

1. Open [Maputnik Editor](https://maputnik.github.io/editor/)
2. Start from a template or create from scratch
3. Customize colors, fonts, layers
4. Export as JSON
5. Host the JSON file on your server
6. Add to `mapStyles` array:

```typescript
mapStyles: [
  {
    id: "custom",
    name: "My Custom Style",
    url: "https://your-domain.com/styles/custom-style.json",
    isDefault: true,
  },
]
```

### Multiple Styles

You can configure multiple styles - users can switch between them using the basemap switcher:

```typescript
mapStyles: [
  {
    id: "streets",
    name: "Streets",
    url: "https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY",
    isDefault: true, // Map opens with this style
  },
  {
    id: "satellite",
    name: "Satellite",
    url: "https://api.maptiler.com/maps/satellite-v4/style.json?key=YOUR_KEY",
  },
  {
    id: "outdoor",
    name: "Outdoor",
    url: "https://api.maptiler.com/maps/outdoor-v2/style.json?key=YOUR_KEY",
  },
]
```

The map will open with the first style in the array, or the one marked with `isDefault: true`.

### Environment Variables for API Keys

**Always use Strapi's `env()` function** to keep API keys secure and out of version control:

```typescript
// config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "streets",
          name: "Streets",
          url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${env('MAPTILER_API_KEY')}`,
          isDefault: true,
        },
      ],
    },
  },
});
```

```bash
# .env file
MAPTILER_API_KEY=your_secret_key_here
```

**Important**:
- Use template literals (backticks) when interpolating variables
- API keys for map tiles are client-safe but should still use domain restrictions
- Set all environment variables in your production deployment environment

## Map Attributions

The plugin uses MapLibre's native `AttributionControl` which **automatically extracts and displays attributions from map styles**.

### How It Works

Attributions are automatically read from:

1. **Map style metadata** - Top-level `metadata.attribution` field in the style JSON
2. **Source attributions** - Each source's `attribution` field (tile providers, data sources, etc.)

**No configuration required** - attributions from OpenStreetMap, MapTiler, OpenFreeMap, or any other tile provider are displayed automatically if present in the style JSON.

## Geocoding Configuration

The plugin uses **Nominatim** for geocoding (converting addresses to coordinates and vice versa).

### Using Public Nominatim (Default)

```typescript
geocodingProvider: 'nominatim',
nominatimUrl: 'https://nominatim.openstreetmap.org',
```

**Important**: Public Nominatim has usage limits. Review their [Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).

### Using Self-Hosted Nominatim

For production environments with high traffic, host your own Nominatim instance:

```typescript
nominatimUrl: 'https://your-nominatim-server.org',
```

**Resources**:
- [Nominatim Documentation](https://nominatim.org/release-docs/latest/)
- [Running Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/)
- [Docker Image](https://github.com/mediagis/nominatim-docker)

### Alternative Geocoding Providers

Currently, the plugin is optimized for Nominatim. Support for other providers (MapTiler Geocoding, Photon, etc.) can be added by extending the geocoder component.

## POI Configuration

Points of Interest (POI) allow integration of custom location data from GeoJSON APIs.

### Basic POI Setup

```typescript
poiDisplayEnabled: true,
poiMinZoom: 10,
poiMaxDisplay: 100,
poiSearchEnabled: true,
poiSnapRadius: 5,
poiSources: [
  {
    id: "skatespots",
    name: "Skatespots",
    apiUrl: "https://api.example.com/skatespots.geojson",
    enabled: true,
  },
],
```

### POI Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `poiDisplayEnabled` | `boolean` | `true` | Display POI markers on map |
| `poiMinZoom` | `number` | `10` | Minimum zoom to show POIs (prevents clutter) |
| `poiMaxDisplay` | `number` | `100` | Maximum POIs displayed (closest to center shown) |
| `poiSearchEnabled` | `boolean` | `true` | Include custom API in search results |
| `poiSnapRadius` | `number` | `5` | Snap radius in meters for double-click POI detection |
| `poiSources` | `POISource[]` | `[]` | Array of POI sources with layer control |

### POISource Interface

```typescript
interface POISource {
  id: string;         // Unique identifier for the layer
  name: string;       // Display name in layer control
  apiUrl: string;     // GeoJSON API endpoint URL
  enabled?: boolean;  // Initial layer visibility (default: true)
}
```

### Example POI Configuration

```typescript
// Working example with static GeoJSON files
poiSources: [
  {
    id: "skatespots",
    name: "My Skatespots",
    apiUrl: "https://fotta-maps.it-mil-1.linodeobjects.com/samples/skatespots.geojson",
    enabled: true,
  },
  {
    id: "skateshops",
    name: "My Skateshops",
    apiUrl: "https://fotta-maps.it-mil-1.linodeobjects.com/samples/skateshops.geojson",
    enabled: false, // Initially hidden
  },
]
```

**See [POI Integration Guide](POI.md) for complete setup instructions and API requirements.**

## Security Middleware

MapLibre GL requires specific Content Security Policy (CSP) directives to function properly.

### Required CSP Configuration

Open `config/middlewares.ts` and update the security middleware:

```typescript
// config/middlewares.ts
export default [
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:"],
          "media-src": ["'self'", "data:", "blob:"],
          "worker-src": ["blob:"], // Required for MapLibre workers
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  "strapi::cors",
  "strapi::poweredBy",
  "strapi::logger",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
```

### Why These Directives?

- `worker-src: ["blob:"]` - MapLibre uses Web Workers for performance
- `img-src: ["data:", "blob:"]` - Map tiles and markers use data URIs
- `connect-src: ["https:"]` - Allows fetching tiles from external servers

**Without these directives, the map will not display or function correctly.**

## Complete Configuration Example

Putting it all together - a production-ready configuration:

```typescript
// config/plugins.ts
module.exports = ({ env }) => ({
  "maplibre-field": {
    enabled: true,
    config: {
      // Multiple map styles
      mapStyles: [
        {
          id: "streets",
          name: "Streets",
          url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${env('MAPTILER_API_KEY')}`,
          isDefault: true,
        },
        {
          id: "satellite",
          name: "Satellite",
          url: `https://api.maptiler.com/maps/satellite-v4/style.json?key=${env('MAPTILER_API_KEY')}`,
        },
        {
          id: "pmtiles",
          name: "Self-hosted",
          url: "https://cdn.example.com/styles/basemap.json",
        },
      ],
      
      // Default position (Milano, Italy)
      defaultCenter: [9.19, 45.46],
      defaultZoom: 13,
      
      // Self-hosted Nominatim for production
      geocodingProvider: "nominatim",
      nominatimUrl: env('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
      
      // POI configuration
      poiDisplayEnabled: true,
      poiMinZoom: 10,
      poiMaxDisplay: 100,
      poiSearchEnabled: true,
      poiSnapRadius: 5,
      poiSources: [
        {
          id: "skatespots",
          name: "My Skatespots",
          apiUrl: env('SKATESPOTS_API_URL'),
          enabled: true,
        },
        {
          id: "skateshops",
          name: "My Skateshops",
          apiUrl: env('SKATESHOPS_API_URL'),
          enabled: false,
        },
      ],
    },
  },
});
```

```bash
# .env file with working POIs examples
MAPTILER_API_KEY=your_maptiler_key
NOMINATIM_URL=https://nominatim.example.com
SKATESPOTS_API_URL=https://fotta-maps.it-mil-1.linodeobjects.com/samples/skatespots.geojson
SKATESHOPS_API_URL=https://fotta-maps.it-mil-1.linodeobjects.com/samples/skateshops.geojson
```
