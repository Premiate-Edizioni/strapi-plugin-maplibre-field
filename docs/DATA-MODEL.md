# Data Model

Technical reference for the GeoJSON Feature structure used by the MapLibre Field plugin.

## Table of Contents

- [Overview](#overview)
- [GeoJSON Feature Structure](#geojson-feature-structure)
- [Properties Reference](#properties-reference)
- [Examples by Input Method](#examples-by-input-method)
- [Usage in Code](#usage-in-code)
- [Validation](#validation)

## Overview

The MapLibre Field stores location data as a **GeoJSON Feature** object following [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946#section-3.2).

**Key principles**:
- Only includes properties when available (no null or empty values)
- Always uses Point geometry (no Polygons or LineStrings)
- Coordinates are always `[longitude, latitude]` (X, Y order)
- All properties are optional except `geometry.coordinates`
- Properties vary based on how the location was selected

## GeoJSON Feature Structure

### TypeScript Interface

```typescript
interface LocationFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    name?: string;        // POI name or location name
    address?: string;     // Full formatted address
    source?: string;      // Data source identifier
    sourceId?: string;    // Original ID from source
    sourceLayer?: string; // Human-readable source name
    category?: string;    // POI type/category
    inputMethod?: string; // How location was selected
    metadata?: object;    // Custom data from source
  };
}
```

### Required Fields

Only two fields are always required:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.1901, 45.4601]
  }
}
```

All other fields in `properties` are optional and only included when available.

## Properties Reference

### `name` (string, optional)

**Description**: Short name or title for the location

**Source**:
- Nominatim search: Place name from search result
- POI click: `properties.name` from GeoJSON API
- Map double-click: Not included (unless snapped to POI)

**Examples**:
```json
"name": "Piazza Velasca"
"name": "Skatepark Milano"
"name": "Eiffel Tower"
```

**Notes**:
- Can be null if source doesn't provide a name
- Used in UI notifications and readonly fields
- Not the full address (use `address` for that)

---

### `address` (string, optional)

**Description**: Full formatted address for the location

**Source**:
- Nominatim search: Formatted address from result
- POI click: Reverse geocoded via Nominatim
- Map double-click (POI snap): Reverse geocoded via Nominatim
- Map double-click (empty area): Not included

**Examples**:
```json
"address": "Piazza Velasca, Municipio 1, Milano, Lombardia, 20122, Italia"
"address": "5 Avenue Anatole France, 75007 Paris, France"
"address": "Via Roma 1, 20121 Milano MI, Italy"
```

**Notes**:
- Language depends on the region (from OSM/Nominatim)
- Format varies by country
- May include postal code, region, country
- Empty if reverse geocoding fails

---

### `source` (string, optional)

**Description**: Identifier of the data source

**Possible values**:
- `"nominatim"` - Location from Nominatim geocoding
- Custom source ID - POI from custom API (e.g., `"skatespots"`, `"fotta-skateparks"`)

**Examples**:
```json
"source": "nominatim"
"source": "skatespots"
"source": "fotta-skateparks"
```

**Notes**:
- Corresponds to `poiSources[].id` from plugin config
- Useful for filtering or grouping locations by source
- Not included for coordinate-only selections

---

### `sourceId` (string, optional)

**Description**: Original unique identifier from the source

**Format**:
- Nominatim: `"nominatim-{place_id}"` (e.g., `"nominatim-68428992"`)
- Custom POI: Feature ID from GeoJSON (e.g., `"019ac1b6-5823-7808-9be6-62733b3d0a0a"`)

**Examples**:
```json
"sourceId": "nominatim-68428992"
"sourceId": "019ac1b6-5823-7808-9be6-62733b3d0a0a"
"sourceId": "skatepark-123"
```

**Notes**:
- Allows linking back to original data source
- Can be used to fetch updated data from source
- Format depends on source API

---

### `sourceLayer` (string, optional)

**Description**: Human-readable name of the source layer

**Source**:
- Corresponds to `poiSources[].name` from plugin config
- Only included for custom POI sources

**Examples**:
```json
"sourceLayer": "Fotta Skatespots"
"sourceLayer": "Skateshops"
"sourceLayer": "Tourist Attractions"
```

**Notes**:
- Useful for displaying source in UI
- Not included for Nominatim results
- Matches layer name in layer control panel

---

### `category` (string, optional)

**Description**: Type or category of the POI

**Source**:
- Nominatim: `addresstype` or POI type from OSM
- Custom POI: Inferred from properties (customizable)

**Examples**:
```json
"category": "bus_stop"
"category": "skating_spot"
"category": "restaurant"
"category": "museum"
"category": "police"
```

**Notes**:
- Based on OpenStreetMap tags for Nominatim
- Can be any custom value from your POI API
- Used for filtering or styling markers

---

### `inputMethod` (string, optional)

**Description**: How the location was selected by the user

**Possible values**:
- `"search"` - Selected from search box results
- `"poi_click"` - Clicked on POI marker
- `"map_click"` - Double-clicked on map

**Examples**:
```json
"inputMethod": "search"
"inputMethod": "poi_click"
"inputMethod": "map_click"
```

**Notes**:
- Useful for analytics or understanding user behavior
- Always included when location has been selected

---

### `metadata` (object, optional)

**Description**: Additional custom data from the source

**Source**:
- Nominatim: OSM tags and metadata (osm_id, osm_type, place_id, etc.)
- Custom POI: All properties from GeoJSON feature (except name)

**Examples**:

**Nominatim metadata**:
```json
"metadata": {
  "osm_id": 4843517235,
  "osm_type": "node",
  "place_id": 68428992,
  "addresstype": "highway"
}
```

**Custom POI metadata**:
```json
"metadata": {
  "sport": "skateboard",
  "surface": "concrete",
  "lighting": "yes",
  "opening_hours": "24/7"
}
```

**Notes**:
- Preserves all original data from source
- Structure varies by source
- Can include any valid JSON data
- Use for custom filtering, display, or processing

## Examples by Input Method

### Example 1: Search Box (Nominatim)

**User action**: Searched for "Piazza Velasca" and selected result

**Saved data**:
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.1901019, 45.460068]
  },
  "properties": {
    "name": "Piazza Velasca",
    "address": "Piazza Velasca, Cerchia dei Navigli, Municipio 1, Milano, Lombardia, 20122, Italia",
    "source": "nominatim",
    "sourceId": "nominatim-68428992",
    "category": "bus_stop",
    "inputMethod": "search",
    "metadata": {
      "osm_id": 4843517235,
      "osm_type": "node",
      "place_id": 68428992,
      "addresstype": "highway",
      "boundingbox": ["45.459568", "45.460568", "9.1896019", "9.1906019"]
    }
  }
}
```

---

### Example 2: POI Click (Custom Source)

**User action**: Clicked on a POI marker from custom "skatespots" layer

**Saved data**:
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
    "sourceLayer": "Fotta Skatespots",
    "category": "skating_spot",
    "inputMethod": "poi_click",
    "metadata": {
      "sport": "skateboard",
      "surface": "concrete",
      "difficulty": "intermediate",
      "created_at": "2024-01-15T10:30:00Z"
    }
  }
}
```

---

### Example 3: Map Double-Click (Snapped to POI)

**User action**: Double-clicked near a POI (within 5m snap radius)

**Saved data**:
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [11.1448496, 46.052144]
  },
  "properties": {
    "name": "Skatepark Villa",
    "address": "Via Example 10, 39100 Bolzano BZ, Italy",
    "source": "skatespots",
    "sourceId": "019ac1b6-5823-7808-9be6-62733b3d0a0b",
    "sourceLayer": "Fotta Skatespots",
    "category": "skating_spot",
    "inputMethod": "poi_click",
    "metadata": {
      "sport": "skateboard",
      "leisure": "pitch",
      "surface": "concrete"
    }
  }
}
```

**Note**: When snapping to POI, `inputMethod` is still `"poi_click"` even though user double-clicked.

---

### Example 4: Map Double-Click (Empty Area)

**User action**: Double-clicked on empty map area (no POI within snap radius)

**Saved data**:
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [9.190252, 45.459891]
  },
  "properties": {
    "inputMethod": "map_click"
  }
}
```

**Note**: Only coordinates and input method are saved. No name, address, or metadata.

---

## Usage in Code

### Accessing Location Data

**REST API**:

```bash
GET /api/articles?populate=location
```

```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "title": "Milano Guide",
        "location": {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [9.1901, 45.4601]
          },
          "properties": {
            "name": "Piazza Velasca",
            "address": "..."
          }
        }
      }
    }
  ]
}
```

**GraphQL**:

```graphql
query {
  articles {
    data {
      id
      attributes {
        title
        location
      }
    }
  }
}
```

### TypeScript/JavaScript Examples

**Extract coordinates**:

```typescript
const location = article.attributes.location;
const [longitude, latitude] = location.geometry.coordinates;

console.log(`Lat: ${latitude}, Lng: ${longitude}`);
// Output: Lat: 45.4601, Lng: 9.1901
```

**Check if POI or coordinates-only**:

```typescript
const hasPOI = location.properties.name !== undefined;
const hasAddress = location.properties.address !== undefined;

if (hasPOI) {
  console.log(`POI: ${location.properties.name}`);
} else {
  console.log('Coordinates only');
}
```

**Filter by source**:

```typescript
const isSkatespots = location.properties.source === 'skatespots';
const isNominatim = location.properties.source === 'nominatim';

if (isSkatespots) {
  // Custom styling for skatespots
  markerColor = 'red';
}
```

**Access custom metadata**:

```typescript
if (location.properties.metadata) {
  const surface = location.properties.metadata.surface;
  const difficulty = location.properties.metadata.difficulty;
  
  console.log(`Surface: ${surface}, Difficulty: ${difficulty}`);
}
```

**Display on a map** (Leaflet example):

```typescript
import L from 'leaflet';

const map = L.map('map').setView(
  location.geometry.coordinates.reverse(), // Leaflet uses [lat, lng]
  15
);

L.marker(location.geometry.coordinates.reverse())
  .bindPopup(location.properties.name || 'Location')
  .addTo(map);
```

**Display on a map** (MapLibre GL example):

```typescript
import maplibregl from 'maplibre-gl';

const map = new maplibregl.Map({
  container: 'map',
  center: location.geometry.coordinates, // MapLibre uses [lng, lat]
  zoom: 15,
});

new maplibregl.Marker()
  .setLngLat(location.geometry.coordinates)
  .setPopup(
    new maplibregl.Popup().setText(location.properties.name || 'Location')
  )
  .addTo(map);
```

### Database Queries

**Find articles near a location** (with Strapi + PostGIS):

```typescript
// This would require custom Strapi controller with PostGIS
const nearbyArticles = await strapi.db.query('api::article.article').findMany({
  where: {
    // Custom SQL query using PostGIS
    $raw: `
      ST_DWithin(
        ST_GeomFromGeoJSON(location->>'geometry'),
        ST_Point(9.1901, 45.4601),
        1000
      )
    `
  }
});
```

**Note**: Spatial queries require PostgreSQL with PostGIS extension.

## Validation

### JSON Schema

The plugin validates saved data against this JSON schema:

```json
{
  "type": "object",
  "required": ["type", "geometry"],
  "properties": {
    "type": {
      "type": "string",
      "enum": ["Feature"]
    },
    "geometry": {
      "type": "object",
      "required": ["type", "coordinates"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["Point"]
        },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 2,
          "maxItems": 2
        }
      }
    },
    "properties": {
      "type": "object"
    }
  }
}
```

### Coordinate Validation

**Longitude** (X axis):
- Range: -180 to 180
- Example: 9.1901 (Milano is at ~9°E)

**Latitude** (Y axis):
- Range: -90 to 90
- Example: 45.4601 (Milano is at ~45°N)

**Common mistake**: Swapping latitude and longitude

```typescript
// WRONG - Latitude first (won't display correctly on map)
"coordinates": [45.4601, 9.1901]

// CORRECT - Longitude first (GeoJSON standard)
"coordinates": [9.1901, 45.4601]
```

### Checking Data Validity

```typescript
function isValidLocation(location: any): boolean {
  // Check basic structure
  if (location?.type !== 'Feature') return false;
  if (location?.geometry?.type !== 'Point') return false;
  
  // Check coordinates
  const [lng, lat] = location.geometry.coordinates || [];
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (lng < -180 || lng > 180) return false;
  if (lat < -90 || lat > 90) return false;
  
  return true;
}
```

## Best Practices

### For Developers

**1. Always check coordinates exist**:

```typescript
const coords = location?.geometry?.coordinates;
if (!coords || coords.length !== 2) {
  console.error('Invalid location data');
  return;
}
```

**2. Use optional chaining for properties**:

```typescript
const name = location?.properties?.name ?? 'Unknown location';
const address = location?.properties?.address ?? 'No address';
```

**3. Respect coordinate order** (longitude, latitude):

```typescript
const [lng, lat] = location.geometry.coordinates;
// Not: const [lat, lng] = ...
```

**4. Type-safe access with TypeScript**:

```typescript
interface LocationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, any>;
}

const location: LocationFeature = article.attributes.location;
```

**5. Preserve original data**:

```typescript
// When updating, preserve metadata
const updatedLocation = {
  ...location,
  properties: {
    ...location.properties,
    customField: 'newValue',
  },
};
```

### For Content Editors

**1. Verify coordinates after selection**:
- Check readonly fields show correct latitude/longitude
- Verify marker is in expected location on map

**2. Use appropriate selection method**:
- Search: For known addresses
- POI click: For pre-defined locations
- Map click: For exact coordinates

**3. Check address field**:
- Ensure address makes sense for the location
- Re-search if address is wrong or missing
