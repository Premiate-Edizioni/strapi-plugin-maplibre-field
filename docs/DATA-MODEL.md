# Data Model

Technical reference for the GeoJSON Feature structure used by the MapLibre Field plugin.

## Table of Contents

- [Overview](#overview)
- [GeoJSON Feature Structure](#geojson-feature-structure)
- [Properties Reference](#properties-reference)
- [Examples by Input Method](#examples-by-input-method)
- [Usage in Code](#usage-in-code)
- [Validation](#validation)
- [Best Practices](#best-practices)

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
    addressDetails?: {    // Administrative levels, one field each
      city?: string;
      county?: string;
      state?: string;
      postcode?: string;
      country?: string;
      country_code?: string;
      admin?: { [level: string]: string }; // "level4", "level6", …
      language?: string;
    };
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
- Map double-click / marker drag: Not included, unless it snaps to a POI (basemap or custom)

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

**Description**: Postal address for the location

**Source**:
- Nominatim search: Composed by the plugin from the result
- POI click: Reverse geocoded via Nominatim
- Map double-click / marker drag, landing on a basemap POI: Reverse geocoded via Nominatim
- Map double-click / marker drag, away from any POI: Not included
- Custom POI sources: The source's own `properties.address`, verbatim

A double-click or marker drop only produces an address when it lands within `poiSnapRadius` of a
POI — see [USAGE.md](USAGE.md#3-double-clicking-on-the-map) for why that threshold exists.
Basemap POIs are covered without any `poiSources` configuration.

**Examples**:
```json
"address": "Via Enrico Noë 24, 20133 Milano, Lombardia, Italia"
"address": "Buckingham Gate, SW1A 1AA Greater London, England, United Kingdom"
"address": "5th Avenue 350, 10118 New York, United States"
```

**How it is built**

Nominatim performs no postal formatting of its own: the `display_name` it returns concatenates
every administrative level it holds for the place — quarter, district, county, region — in the same
order for every country. The plugin therefore queries `format=geocodejson`, whose address keys are
normalised across countries, and composes the string itself from a whitelist of **postal fields
only**:

```text
<street> <housenumber>, <postcode> <city>, <region>, <country>
```

Missing fields are skipped along with their separator, and `<region>` is dropped when it merely
repeats the city (city-states such as Berlin, city-provinces such as New York).

**Notes**:
- The field order is the same for every country — it is **not** localised per postal convention.
  A US address reads `5th Avenue 350`, not `350 5th Avenue`. Consumers needing locale-correct
  rendering should format their own string; the coordinates and `name` are the stable inputs.
- The language of the place names follows the admin panel locale — see
  [CONFIGURATION.md](CONFIGURATION.md#geocoding-language).
- Empty if reverse geocoding fails or returns no postal field.

---

### `addressDetails` (object, optional)

**Description**: The administrative levels of the location, one field each, for grouping and
filtering — which `address`, a single string, does not allow.

**Fields** (keys are Nominatim's GeocodeJSON keys, unchanged):

| Field | Meaning | Example |
| --- | --- | --- |
| `city` | City, town or village | `"Perugia"` |
| `county` | Province | `"Perugia"` |
| `state` | Region | `"Umbria"` |
| `postcode` | Postcode | `"06124"` |
| `country` | Country | `"Italia"` |
| `country_code` | ISO 3166-1 alpha-2, lowercase | `"it"` |
| `admin` | The boundaries containing the place, keyed by OSM [`admin_level`](https://wiki.openstreetmap.org/wiki/Key:admin_level) | `{ "level4": "Umbria", "level6": "Perugia", "level8": "Perugia" }` |
| `language` | The language the names were requested in | `"it"` |

Only the fields Nominatim filled in are present. Unlike `address`, nothing is dropped for
repeating another level: a province named like its city is still listed under `county`.

`city`, `county`, `state`, `postcode` and `country` are [GeocodeJSON](https://github.com/geocoders/geocodejson-spec)
fields, as is `admin`. `country_code` is a Nominatim extension to it (Photon calls it
`countrycode`), and `language` is the plugin's own.

**Which to use**: `city`, `county` and `state` are the geocoder's reading of the hierarchy and are
enough for most uses. `admin` is the hierarchy as OpenStreetMap records it, and the only place the
levels below the city appear (`level10` is a *municipio* in Rome or Milan). What each level means
depends on the country — in Italy `level4` is the region, `level6` the province, `level8` the
comune; the table on the OSM wiki covers the rest.

**Source**:
- Nominatim search, POI click, map double-click / marker drag: from the same Nominatim answer that
  gives the address
- Map double-click / marker drag, away from any POI: from the nearest place Nominatim found. Too far
  for its street to be the point's, so no `address` is saved, but almost always in the same city.
  No `postcode` either: in a city with several, the nearest place may lie in the next area
- Custom POI sources: one reverse lookup at the POI's point
- Locations saved before this field existed: not included

**Notes**:
- Names follow the saving editor's language, so the same city can be stored as `"Milano"` and
  `"Milan"`. Treat them as labels: group by `country_code`, which does not depend on the language,
  or normalise names on your side using `language`.
- Absent if the Nominatim request fails; the location is saved anyway.

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

Set when a POI was picked — clicked, or snapped onto by a double-click or marker drop. A location
chosen from the **search** results has no `sourceId`, because the plugin keeps only the name and the
composed address from a geocoding response.

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
- Nominatim (a snapped basemap POI): the OSM value, falling back to the OSM key — `bus_stop`, `hotel`, `amenity`
- Custom POI: the source feature's own `type` property
- Search results: not included

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
- `"marker_drag"` - Dragged the main marker to a new position

**Examples**:
```json
"inputMethod": "search"
"inputMethod": "poi_click"
"inputMethod": "map_click"
"inputMethod": "marker_drag"
```

**Notes**:
- Useful for analytics or understanding user behavior
- Always included when location has been selected

---

### `metadata` (object, optional)

**Description**: Additional custom data from the source

**Source**:
- Nominatim (a snapped basemap POI): OSM identifiers (`osm_id`, `osm_type`, `place_id`, `addresstype`, `class`, `category`)
- Custom POI: All properties from GeoJSON feature (except name)
- Search results: not included

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
    "address": "Piazza Velasca, 20122 Milano, Lombardia, Italia",
    "source": "nominatim",
    "inputMethod": "search"
  }
}
```

A search result carries these four properties and no others. `sourceId`, `category` and `metadata`
are not set: the plugin reads the GeocodeJSON response for the name and the postal fields it
composes `address` from, and keeps nothing else. A result picked from one of your own POI layers
does carry `sourceId`, `sourceLayer` and `category` — see Example 2.

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

**Note**: When snapping to POI, `inputMethod` is still `"poi_click"` even though the user double-clicked or dragged the marker.

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
    "inputMethod": "map_click",
    "addressDetails": {
      "city": "Milano",
      "state": "Lombardia",
      "country": "Italia",
      "country_code": "it",
      "admin": {
        "level4": "Lombardia",
        "level6": "Milano",
        "level8": "Milano",
        "level10": "Municipio 1"
      },
      "language": "it"
    }
  }
}
```

**Note**: No name, address, or metadata: no place lies close enough to be the one picked. The
administrative levels are kept, since the point is in the same city as the nearest place.

---

## Usage in Code

**REST API**:

```bash
GET /api/articles?populate=location
```

Strapi v5 responses are flat — no `data.attributes` wrapping:

```json
{
  "data": [
    {
      "id": 1,
      "documentId": "abc123",
      "title": "Milano Guide",
      "location": {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [9.1901, 45.4601] },
        "properties": { "name": "Piazza Velasca", "address": "..." }
      }
    }
  ]
}
```

### TypeScript/JavaScript Examples

**Extract coordinates**:

```typescript
const location = article.location;
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

**Display on a map**:

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

Spatial queries (e.g. "articles within N meters") are not built into the plugin — it stores plain
GeoJSON in a JSON column. Implementing them requires your own database-level solution (e.g.
PostgreSQL with the PostGIS extension) on top of the stored `geometry.coordinates`.

## Validation

The plugin itself only checks, on load, that the stored value parses as JSON and has a
`geometry.coordinates` — it does not enforce a formal schema, so nothing stops a lifecycle hook,
import script, or direct database write from saving a malformed value. If you need to validate
incoming data (e.g. in your own lifecycle hook), check for the required shape yourself:

```typescript
function isValidLocation(location: any): boolean {
  if (location?.type !== 'Feature') return false;
  if (location?.geometry?.type !== 'Point') return false;

  const [lng, lat] = location.geometry.coordinates || [];
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (lng < -180 || lng > 180) return false;
  if (lat < -90 || lat > 90) return false;

  return true;
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

## Best Practices

### For Developers

**Preserve unknown properties when updating**: properties are sparse by design (see Overview), so
spread the existing object rather than reconstructing it — a naive rebuild silently drops fields
like `metadata` or `sourceId` that your code doesn't know about:

```typescript
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
