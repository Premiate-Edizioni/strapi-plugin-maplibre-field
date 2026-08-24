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
| `useFullscreenPseudo` | `boolean` | `true` | Fullscreen mode for the map control (see below) |

#### `useFullscreenPseudo`

Controls how the map's fullscreen button expands the map:

- `true` (default) - CSS-based fullscreen. The map fills the browser viewport without leaving the page. Generally smoother, and the recommended setting on mobile.
- `false` - Native [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API). The map takes over the whole screen, including outside the browser window.

```typescript
"maplibre-field": {
  enabled: true,
  config: {
    mapStyles: [/* ... */],
    useFullscreenPseudo: false, // opt into the native Fullscreen API
  },
},
```

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

### Geocoding Language

There is nothing to configure: every Nominatim request carries the editor's **admin panel locale**
as `accept-language`, so search results and reverse-geocoded addresses come back in the language the
editor is already working in. An editor with the panel set to German sees `Mailand, Italien`, one
set to Italian sees `Milano, Italia`, for the very same point.

Two consequences worth knowing:

- The stored `properties.address` is in **whichever language the editor who saved it was using**.
  It is a human-readable label, not a stable key — the coordinates are the stable value. If you need
  one consistent language across a whole collection, render the address in your front end rather
  than reading the stored string.
- Nominatim falls back to the local name when it has no translation for a place, so parts of an
  address may stay in the local language regardless of the locale requested.

The field order is the same for every language and every country — the plugin does not reorder
addresses per postal convention. See [DATA-MODEL.md](DATA-MODEL.md#address-string-optional).

### Response Format

The plugin queries Nominatim with `format=geocodejson` rather than `jsonv2` or `geojson`. Only
GeocodeJSON normalises the address keys across countries (`street`, `housenumber`, `city`), where the
other formats return the raw OSM tags (`road`, `house_number`, and the `city|town|village` variance).
The same field names are emitted by [Photon](https://github.com/komoot/photon) and Addok, so a
self-hosted alternative can be swapped in without changing how responses are read.

A self-hosted Nominatim must therefore have the GeocodeJSON output format available — it is built in
and enabled by default.

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
  id: string;                    // Unique identifier for the layer
  name: string;                  // Display name in layer control
  apiUrl: string;                // GeoJSON API endpoint URL or PMTiles file URL
  type?: 'geojson' | 'pmtiles'; // Source type (default: 'geojson')
  sourceLayer?: string;          // Vector layer name inside the PMTiles file (required for type: 'pmtiles')
  color?: string;                // Marker/circle color (CSS color, e.g. '#cc0000')
  enabled?: boolean;             // Initial layer visibility (default: true)
}
```

**Source types**:
- `'geojson'` (default) — fetches a GeoJSON FeatureCollection from `apiUrl`. Works with static files, REST APIs, or any URL returning GeoJSON.
- `'pmtiles'` — loads a PMTiles vector tile archive from `apiUrl`. Tiles are rendered natively by MapLibre without an API request per viewport. Requires `sourceLayer` to identify which layer inside the archive to display.

### Example POI Configuration

```typescript
// Working example with mixed GeoJSON and PMTiles sources
poiSources: [
  // GeoJSON source: fetched via HTTP, filtered and cached client-side
  {
    id: "skatespots",
    name: "My Skatespots",
    apiUrl: "https://fotta-maps.it-mil-1.linodeobjects.com/samples/skatespots.geojson",
    color: "#cc0000",
    enabled: true,
  },
  {
    id: "skateshops",
    name: "My Skateshops",
    apiUrl: "https://fotta-maps.it-mil-1.linodeobjects.com/samples/skateshops.geojson",
    color: "#0066cc",
    enabled: false, // Initially hidden
  },
  // PMTiles source: served as vector tiles, efficient for large datasets
  {
    id: "skateparks",
    name: "Skateparks",
    apiUrl: "https://cdn.example.com/pmtiles/skateparks-world.pmtiles",
    type: "pmtiles",
    sourceLayer: "skateparks", // layer name inside the .pmtiles file
    color: "#1dbff0",
    enabled: true,
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
          "worker-src": ["'self'", "blob:"], // Required for MapLibre workers
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

- `worker-src: ["'self'", "blob:"]` - MapLibre does its tile parsing in Web Workers. `'self'` is required because the plugin serves the maplibre-gl worker from your own Strapi instance (`/maplibre-field/worker/...`); `blob:` covers the worker maplibre-gl builds at runtime in some setups. Listing only `blob:` will block the map on maplibre-gl v6.
- `img-src: ["data:", "blob:"]` - Map tiles and markers use data URIs
- `connect-src: ["https:"]` - Allows fetching tiles from external servers

**Without these directives, the map will not display or function correctly.**

### The Worker Endpoint

maplibre-gl v6 no longer inlines its Web Worker, so it has to be loaded from a URL. Rather than pull it from a third-party CDN, the plugin serves it from your own instance:

```text
GET /maplibre-field/worker/maplibre-gl-worker.mjs
GET /maplibre-field/worker/maplibre-gl-shared.mjs
```

The files are read from the `maplibre-gl` package your app has installed, so worker and map are always the same version. Two things to know if you audit your Strapi surface or run it behind a reverse proxy:

- **The route is unauthenticated.** The browser's `Worker` loader cannot attach admin credentials, so it cannot require a session. It serves only the two public maplibre-gl files listed above and rejects any other filename.
- **It must stay reachable from the admin panel.** If a proxy or firewall only exposes `/admin` and `/api`, add `/maplibre-field` too, or the map will fail to start.

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
          color: "#cc0000",
          enabled: true,
        },
        {
          id: "skateshops",
          name: "My Skateshops",
          apiUrl: env('SKATESHOPS_API_URL'),
          color: "#0066cc",
          enabled: false,
        },
        // PMTiles source for large datasets — no per-request API calls
        {
          id: "skateparks",
          name: "Skateparks",
          apiUrl: env('SKATEPARKS_PMTILES_URL'),
          type: "pmtiles",
          sourceLayer: "skateparks",
          color: "#1dbff0",
          enabled: true,
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
SKATEPARKS_PMTILES_URL=https://cdn.example.com/pmtiles/skateparks-world.pmtiles
```
