# POI Integration

Complete guide to integrating custom Points of Interest (POI) sources with the MapLibre Field plugin.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Custom POI API](#custom-poi-api)
- [Layer Control](#layer-control)
- [User Interaction](#user-interaction)
- [Performance Optimization](#performance-optimization)
- [Examples](#examples)

## Overview

The MapLibre Field plugin supports integration of custom POI data from external GeoJSON APIs. This allows you to:

- Display custom location markers on the map
- Let users select pre-defined locations with a single click
- Include custom POI data in search results
- Toggle multiple POI layers on/off
- Save complete POI metadata automatically

### Use Cases

- **Skateparks and Skateshops**: Show locations from your custom database
- **Store Locator**: Display all your business locations
- **Event Venues**: Pre-defined locations for events
- **Tourist Attractions**: Museums, monuments, viewpoints
- **Service Points**: ATMs, charging stations, wifi hotspots
- **Any Custom Location Database**: Hotels, restaurants, parks, etc.

## Configuration

### Basic POI Setup

Add POI configuration to your plugin settings in `config/plugins.ts`:

```typescript
export default {
  "maplibre-field": {
    enabled: true,
    config: {
      // ... other settings ...
      
      // POI Configuration
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
        {
          id: "skateshops",
          name: "Skateshops",
          apiUrl: "https://api.example.com/skateshops.geojson",
          enabled: false,
        },
      ],
    },
  },
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `poiDisplayEnabled` | `boolean` | `true` | Enable POI markers on map |
| `poiMinZoom` | `number` | `10` | Minimum zoom level to show POIs (prevents clutter) |
| `poiMaxDisplay` | `number` | `100` | Maximum POIs displayed at once (closest to center) |
| `poiSearchEnabled` | `boolean` | `true` | Include custom API results in search |
| `poiSnapRadius` | `number` | `5` | Snap radius in meters for double-click POI detection |
| `poiSources` | `POISource[]` | `[]` | Array of POI sources with layer control |

### POISource Interface

```typescript
interface POISource {
  id: string;         // Unique identifier for the layer
  name: string;       // Display name in layer control panel
  apiUrl: string;     // GeoJSON API endpoint URL
  enabled?: boolean;  // Initial layer visibility (default: true)
}
```

**Notes**:
- `id` must be unique across all POI sources
- `name` is shown in the layer control panel
- `apiUrl` must return a valid GeoJSON FeatureCollection
- `enabled` controls initial visibility (users can toggle anytime)

## Custom POI API

### Requirements

Your POI API must:

1. **Return GeoJSON FeatureCollection** format
2. **Use Point geometries** (no Polygons or Lines)
3. **Be publicly accessible** (no authentication required)
4. **Use correct coordinate order**: `[longitude, latitude]`
5. **Include `properties.name`** field (can be null, will use fallback)
6. **Enable CORS** headers for browser requests

### GeoJSON FeatureCollection Format

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "019ac1b6-5823-7808-9be6-62733b3d0a0a",
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [11.1448496, 46.052144]
      },
      "properties": {
        "name": "Skatepark Villa",
        "sport": "skateboard",
        "leisure": "pitch",
        "surface": "concrete",
        "osm_id": "node/12345"
      }
    },
    {
      "id": "019ac1b6-5823-7808-9be6-62733b3d0a0b",
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [9.196492, 45.480958]
      },
      "properties": {
        "name": "Ledge Milano District",
        "sport": "skateboard",
        "surface": "concrete"
      }
    }
  ]
}
```

### Required Fields

- `type: "FeatureCollection"` - Top-level type
- `features: []` - Array of Feature objects
- `features[].type: "Feature"` - Each feature must be type "Feature"
- `features[].geometry.type: "Point"` - Only Point geometries supported
- `features[].geometry.coordinates: [lng, lat]` - Longitude first, latitude second
- `features[].properties.name: string` - POI name (required, can be null)

### Optional Fields

- `features[].id` - Unique identifier (recommended)
- `features[].properties.*` - Any custom metadata you want to preserve

All properties are saved when a user selects the POI and can be accessed in your frontend.

### Example API Endpoints

**Static GeoJSON Files** (Simple, no backend required):

```typescript
poiSources: [
  {
    id: "skatespots",
    name: "Skatespots",
    apiUrl: "https://storage.example.com/skatespots.geojson",
    enabled: true,
  },
]
```

**Dynamic API Endpoints**:

```typescript
poiSources: [
  {
    id: "skatespots",
    name: "Skatespots",
    apiUrl: "https://api.example.com/v1/skatespots.geojson",
    enabled: true,
  },
]
```

**Using Strapi API** (from another Strapi collection):

```typescript
poiSources: [
  {
    id: "stores",
    name: "Our Stores",
    apiUrl: "https://your-strapi.com/api/stores?format=geojson",
    enabled: true,
  },
]
```

### CORS Configuration

Your API must include CORS headers to allow browser requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

For static files on S3/R2/Linode Object Storage, configure CORS in bucket settings.

## Layer Control

When you configure multiple `poiSources`, a layer control panel appears on the map.

### Features

**Toggle Layers On/Off**:
- Click the **eye icon** next to each layer name
- POI markers appear/disappear immediately
- Changes apply in real-time

**Independent Control**:
- Each POI source can be toggled separately
- Combine layers as needed (e.g., show both skatespots and shops)
- Hide unused layers to reduce visual clutter

**Dynamic Loading**:
- POIs are fetched only for visible layers
- When you move the map, POIs update automatically for new viewport
- Invisible layers don't make unnecessary API requests

**Persistent State**:
- Layer visibility is remembered during your session
- Each content entry starts with default visibility from config

### UI Location

The layer control panel appears in the **top-right corner** of the map (customizable in future versions).

## User Interaction

### How POIs Work

**1. Display on Map**:
- POIs appear as colored markers when zoomed in (`>= poiMinZoom`)
- Only up to `poiMaxDisplay` closest POIs shown (sorted by distance from center)
- Markers disappear when zoomed out (to prevent clutter)

**2. Search Integration**:
- When `poiSearchEnabled: true`, search box queries both Nominatim AND custom APIs
- Results from both sources appear in dropdown
- Custom POI results show: `POI Name`
- Nominatim results show: `Address Name`

**3. Click to Select**:
- Click any POI marker to select it
- Selected marker turns **orange** (#ff5200)
- Complete POI data is saved automatically
- Success notification shows: "POI Name (source: Source Layer)"

**4. Double-Click Snap**:
- Double-click near a POI (within `poiSnapRadius`, default 5m)
- Automatically selects the nearest POI
- Shows distance in notification: "POI Name (3m)"
- If no POI within radius, saves coordinates only

### What Gets Saved

When a user selects a POI, all data is preserved:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.196492, 45.480958]
  },
  "properties": {
    "name": "Ledge Milano District",
    "address": "Via Roma 1, 20121 Milano MI, Italy",
    "source": "skatespots",
    "sourceId": "019ac1b6-5823-7808-9be6-62733b3d0a0a",
    "sourceLayer": "Skatespots",
    "category": "skating_spot",
    "inputMethod": "poi_click",
    "metadata": {
      "sport": "skateboard",
      "surface": "concrete"
    }
  }
}
```

**Automatic Fields**:
- `address` - Reverse geocoded via Nominatim
- `source` - Your POI source ID (e.g., "skatespots")
- `sourceId` - Original ID from your API
- `sourceLayer` - Human-readable source name (e.g., "Skatespots")
- `category` - Inferred from properties (customizable)
- `inputMethod` - How it was selected ("poi_click", "search", "map_click")
- `metadata` - All original properties from your GeoJSON

## Performance Optimization

### Zoom-Based Visibility

POIs are hidden when zoomed out to prevent overcrowding:

```typescript
poiMinZoom: 10 // POIs only visible at zoom >= 10
```

**Recommended values**:
- Global/continental view: Don't show POIs (zoom < 10)
- City view: Show POIs (zoom 10-12)
- Neighborhood view: Show POIs (zoom 13-15)
- Street view: Show POIs (zoom 16+)

### Display Limits

Only the closest POIs to the map center are shown:

```typescript
poiMaxDisplay: 100 // Maximum 100 POIs at once
```

**Recommended values**:
- Low density areas (parks, hiking): 50-100
- Medium density (cities): 100-200
- High density (downtown): 200-500 (be careful, can slow down rendering)

### Viewport-Based Loading

POIs are fetched based on the current map bounds:

1. User moves/zooms the map
2. Plugin calculates new viewport bounds
3. Queries POI APIs for features within bounds
4. Only closest `poiMaxDisplay` POIs rendered

**Benefits**:
- Works efficiently with large datasets (10,000+ POIs)
- No need to load all POIs at once
- Smooth performance even with multiple layers

### Caching

API responses are cached client-side for 15 minutes:

- Reduces API calls when panning/zooming in same area
- Improves performance and reduces bandwidth
- Automatically refreshes after 15 minutes

### Best Practices

**For Small Datasets** (< 1,000 POIs):
- Serve all POIs in single GeoJSON file
- Use static file hosting (S3, R2, CDN)
- Let plugin handle filtering client-side

**For Large Datasets** (> 5,000 POIs):
- Implement server-side filtering by bounding box
- Return only POIs within requested viewport
- Use spatial database (PostGIS) for efficient queries

**For Very Large Datasets** (> 50,000 POIs):
- Use vector tiles instead of GeoJSON
- Consider clustering POIs at low zoom levels
- Implement progressive loading

## Examples

### Example 1: Static GeoJSON Files

**Simplest approach** - host static GeoJSON files:

```typescript
// config/plugins.ts
poiSources: [
  {
    id: "skatespots",
    name: "Skatespots",
    apiUrl: "https://cdn.example.com/skatespots.geojson",
    enabled: true,
  },
]
```

**skatespots.geojson**:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [9.19, 45.46]
      },
      "properties": {
        "name": "Skatepark Centrale",
        "surface": "concrete"
      }
    }
  ]
}
```

### Example 2: Strapi Collection as POI Source

Use another Strapi collection as POI source:

**1. Create a custom API route** in your Strapi project:

```typescript
// src/api/skatespot/routes/geojson.ts
export default {
  routes: [
    {
      method: 'GET',
      path: '/skatespots/geojson',
      handler: 'skatespot.findGeoJSON',
    },
  ],
};
```

**2. Create controller**:

```typescript
// src/api/skatespot/controllers/skatespot.ts
export default {
  async findGeoJSON(ctx) {
    const spots = await strapi.documents('api::skatespot.skatespot').findMany();
    
    const geojson = {
      type: 'FeatureCollection',
      features: spots.map(spot => ({
        type: 'Feature',
        id: spot.documentId,
        geometry: {
          type: 'Point',
          coordinates: [spot.longitude, spot.latitude],
        },
        properties: {
          name: spot.name,
          surface: spot.surface,
          difficulty: spot.difficulty,
        },
      })),
    };
    
    ctx.body = geojson;
  },
};
```

**3. Configure POI source**:

```typescript
poiSources: [
  {
    id: "skatespots",
    name: "Skatespots",
    apiUrl: "https://your-strapi.com/api/skatespots/geojson",
    enabled: true,
  },
]
```

### Example 3: PostGIS Database with Spatial Query

For large datasets, use PostGIS to filter by bounding box:

**API Endpoint** (Node.js + PostGIS):

```typescript
// /api/skatespots/geojson?bbox=west,south,east,north
app.get('/api/skatespots/geojson', async (req, res) => {
  const { bbox } = req.query;
  const [west, south, east, north] = bbox.split(',').map(Number);
  
  const result = await db.query(`
    SELECT 
      id,
      name,
      surface,
      ST_AsGeoJSON(location) as geometry
    FROM skatespots
    WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
    LIMIT 500
  `, [west, south, east, north]);
  
  const geojson = {
    type: 'FeatureCollection',
    features: result.rows.map(row => ({
      type: 'Feature',
      id: row.id,
      geometry: JSON.parse(row.geometry),
      properties: {
        name: row.name,
        surface: row.surface,
      },
    })),
  };
  
  res.json(geojson);
});
```

**Note**: Current plugin version doesn't send bbox parameter. This would require extending the plugin to send `?bbox=` query param. Future enhancement.

### Example 4: Multiple POI Sources with Layer Control

```typescript
poiSources: [
  {
    id: "skateparks",
    name: "Skateparks",
    apiUrl: "https://api.example.com/skateparks.geojson",
    enabled: true,
  },
  {
    id: "skateshops",
    name: "Skate Shops",
    apiUrl: "https://api.example.com/skateshops.geojson",
    enabled: true,
  },
  {
    id: "events",
    name: "Skate Events",
    apiUrl: "https://api.example.com/events.geojson",
    enabled: false, // Hidden by default
  },
]
```

Users can toggle each layer independently using the layer control panel.

## Troubleshooting

### POIs Don't Appear

**Check zoom level**:
- Zoom in to at least `poiMinZoom` (default: 10)
- POIs are hidden at low zoom to prevent clutter

**Check layer visibility**:
- Open layer control panel
- Verify layer eye icon is "open" (visible)
- Toggle off/on to force refresh

**Check API response**:
- Open browser DevTools → Network tab
- Look for requests to your `apiUrl`
- Verify response is valid GeoJSON
- Check for CORS errors in Console

### POIs Appear in Wrong Location

**Coordinate order**:
- Must be `[longitude, latitude]` not `[latitude, longitude]`
- Longitude: -180 to 180 (X axis, east-west)
- Latitude: -90 to 90 (Y axis, north-south)

### Search Doesn't Return POIs

**Check configuration**:
- Verify `poiSearchEnabled: true`
- Check that POI has `properties.name` field
- Try searching for exact POI name

**Check API data**:
- Verify GeoJSON has valid `name` property
- Name cannot be empty string or null
- Search is case-insensitive

### Double-Click Doesn't Snap to POI

**Check zoom level**:
- POIs must be visible (zoom >= `poiMinZoom`)
- POI markers must be rendered on map

**Check snap radius**:
- Default is 5 meters
- Increase `poiSnapRadius` if needed
- Try clicking directly on POI marker instead

**Check POI layer**:
- Verify layer is enabled in layer control
- POI must be within viewport bounds
