# Configuration Guide

Complete configuration reference for the MapLibre Field plugin.

## Table of Contents

- [Plugin Configuration](#plugin-configuration)
- [Map Styles](#map-styles)
- [Map Attributions](#map-attributions)
- [Geocoding Configuration](#geocoding-configuration)
- [POI Configuration](#poi-configuration)
- [Security Middleware](#security-middleware)
- [Complete Configuration Example](#complete-configuration-example)

## Plugin Configuration

All plugin configuration is done in `config/plugins.ts` (or `.js` for JavaScript projects).

```typescript
// config/plugins.ts
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      mapStyles: [
        {
          id: "ofm",
          name: "OpenFreeMap",
          url: "https://tiles.openfreemap.org/styles/liberty",
          isDefault: true,
        },
      ],
      defaultCenter: [9.19, 45.46], // [longitude, latitude] - Milano, Italy
      defaultZoom: 13,
      geocodingProvider: "nominatim",
      nominatimUrl: "https://nominatim.openstreetmap.org",
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
| `mapStyles` | `MapStyle[]` | OpenFreeMap Liberty | Array of map style configurations |
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
| `useFullscreenPseudo` | `boolean` | `true` | CSS-based fullscreen instead of the native Fullscreen API (see below) |

#### `useFullscreenPseudo`

- `true` (default) — CSS-based fullscreen. The map fills the browser viewport without leaving the page. Generally smoother, and the recommended setting on mobile.
- `false` — Native [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API). Some browser/GPU combinations (Firefox on Linux in particular) lose the WebGL context across the transition and leave the map full-screen but frozen — if that happens, keep the default.

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

### OpenFreeMap (free, built-in default)

This is what you get with no `mapStyles` at all — a complete street-level basemap built from
OpenStreetMap data, with no API key and no account. Configure it explicitly only when you want to
name it in the basemap switcher alongside other styles. [OpenFreeMap](https://openfreemap.org/) is
donation-funded; read its own page before relying on it for a high-traffic production instance.

### MapLibre Demo Tiles (free, not usable for this plugin)

MapLibre's own demo style (`https://demotiles.maplibre.org/style.json`) shows countries and borders
only — **no streets, no place names at city scale**. It exists to prove a map renders at all; since
picking a location means recognising a street or a building, use OpenFreeMap instead.

### Commercial providers (MapTiler, Stadia Maps, …)

Any provider that serves a MapLibre-compatible style JSON works the same way — put its URL in
`mapStyles` and its API key in an environment variable via Strapi's `env()`:

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
        {
          id: "satellite",
          name: "Satellite",
          url: `https://api.maptiler.com/maps/satellite-v4/style.json?key=${env('MAPTILER_API_KEY')}`,
        },
      ],
    },
  },
});
```

Listing more than one entry in `mapStyles` (as above) gives the editor a basemap switcher; the map
opens on the one marked `isDefault: true`, or the first entry otherwise. Map tile API keys are
client-visible by design — restrict them by domain on the provider's dashboard rather than treating
them as secret.

**Providers**: [MapTiler](https://www.maptiler.com/) · [Stadia Maps](https://stadiamaps.com/)

### PMTiles (self-hosted)

[PMTiles](https://docs.protomaps.com/pmtiles/) packs a whole tile archive into a single file you can
serve from any static host or object storage (S3, Cloudflare R2, …) — no tile server needed. The
plugin registers the `pmtiles://` protocol globally, so a style JSON can reference it directly:

```json
{
  "version": 8,
  "sources": {
    "protomaps": {
      "type": "vector",
      "url": "pmtiles://https://your-server.com/tiles/basemap.pmtiles"
    }
  },
  "layers": [
    { "id": "water", "type": "fill", "source": "protomaps", "source-layer": "water", "paint": { "fill-color": "#a0c4ff" } }
  ]
}
```

Point `mapStyles` at that style JSON's URL like any other provider. See
[Protomaps Basemaps](https://docs.protomaps.com/basemaps/) for pre-built OSM archives and
[go-pmtiles](https://github.com/protomaps/go-pmtiles) to build your own.

### Custom Styles

Build a style with [Maputnik](https://maputnik.github.io/editor/), export the JSON, host it
anywhere, and reference it the same way as any other `mapStyles` entry.

## Map Attributions

The plugin uses MapLibre's native `AttributionControl`, which automatically reads attributions from
a style's `metadata.attribution` field and from each source's own `attribution` field. No
configuration is needed — this works for OpenStreetMap, MapTiler, OpenFreeMap, or any other
provider that populates those fields.

## Geocoding Configuration

The plugin uses **Nominatim** for geocoding (converting addresses to coordinates and vice versa).

```typescript
geocodingProvider: 'nominatim',
nominatimUrl: 'https://nominatim.openstreetmap.org', // or your own instance
```

Public Nominatim has usage limits — review its
[Usage Policy](https://operations.osmfoundation.org/policies/nominatim/), and for production
traffic point `nominatimUrl` at a
[self-hosted instance](https://nominatim.org/release-docs/latest/admin/Installation/) (a
[Docker image](https://github.com/mediagis/nominatim-docker) is available) instead.

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
self-hosted alternative can be swapped in without changing how responses are read — it must support
GeocodeJSON output, which Nominatim has built in and enabled by default.

Support for providers other than Nominatim can be added by extending the geocoder service.

## POI Configuration

Points of Interest (POI) let you overlay custom location data — from a GeoJSON API or a PMTiles
archive — on top of the base map.

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

- `'geojson'` (default) — fetches a GeoJSON FeatureCollection from `apiUrl`. Works with static files, REST APIs, or any URL returning GeoJSON.
- `'pmtiles'` — loads a PMTiles vector tile archive from `apiUrl`, rendered natively by MapLibre without a request per viewport. Requires `sourceLayer`.

**See [POI Integration Guide](POI.md) for complete setup instructions and API requirements.**

## Security Middleware

MapLibre GL requires specific Content Security Policy (CSP) directives to function properly. Open
`config/middlewares.ts` and update the security middleware:

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

### Why these directives

- `worker-src: ["'self'", "blob:"]` — MapLibre does its tile parsing in Web Workers. `'self'` is required because the plugin serves the maplibre-gl worker from your own Strapi instance (`/maplibre-field/worker/...`); `blob:` covers the worker maplibre-gl builds at runtime in some setups. Listing only `blob:` will block the map on maplibre-gl v6.
- `img-src`/`media-src: ["data:", "blob:"]` — map tiles and markers use data URIs.
- `connect-src: ["https:"]` — allows fetching tiles from external servers.

Without these directives, the map will not display or function correctly.

### The worker endpoint

maplibre-gl v6 no longer inlines its Web Worker, so it has to be loaded from a URL. Rather than pull
it from a third-party CDN, the plugin serves it from your own instance:

```text
GET /maplibre-field/worker/maplibre-gl-worker.mjs
GET /maplibre-field/worker/maplibre-gl-shared.mjs
```

The files are read from the `maplibre-gl` package your app has installed, so worker and map are
always the same version. Two things to know if you audit your Strapi surface or run it behind a
reverse proxy:

- **The route is unauthenticated.** The browser's `Worker` loader cannot attach admin credentials, so it cannot require a session. It serves only the two public maplibre-gl files listed above and rejects any other filename.
- **It must stay reachable from the admin panel.** If a proxy or firewall only exposes `/admin` and `/api`, add `/maplibre-field` too, or the map will fail to start.

## Complete Configuration Example

A production-ready configuration putting everything above together:

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
        {
          id: "satellite",
          name: "Satellite",
          url: `https://api.maptiler.com/maps/satellite-v4/style.json?key=${env('MAPTILER_API_KEY')}`,
        },
      ],
      defaultCenter: [9.19, 45.46], // Milano, Italy
      defaultZoom: 13,
      geocodingProvider: "nominatim",
      nominatimUrl: env('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
      poiDisplayEnabled: true,
      poiMinZoom: 10,
      poiMaxDisplay: 100,
      poiSearchEnabled: true,
      poiSnapRadius: 5,
      poiSources: [
        {
          id: "skatespots",
          name: "Skatespots",
          apiUrl: env('SKATESPOTS_API_URL'),
          color: "#cc0000",
          enabled: true,
        },
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
# .env
MAPTILER_API_KEY=your_maptiler_key
NOMINATIM_URL=https://nominatim.example.com
SKATESPOTS_API_URL=https://api.example.com/skatespots.geojson
SKATEPARKS_PMTILES_URL=https://cdn.example.com/pmtiles/skateparks-world.pmtiles
```
