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

Copy it into your front end: the plugin package is a Strapi plugin and is not meant to be installed
in one.

```typescript
interface LocationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: LocationProperties;
}

interface LocationProperties {
  name?: string;
  address?: string;
  addressDetails?: AddressDetails;
  source?: string;
  sourceId?: string;
  sourceLayer?: string;
  category?: string;
  inputMethod?: 'search' | 'poi_click' | 'map_click' | 'marker_drag';
  metadata?: Record<string, unknown>;
}

interface AddressDetails {
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  admin?: Record<string, string>; // { level4: 'Lombardia', level8: 'Milano', … }
  language?: string;
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

**Example**: `"Piazza Velasca"`

A POI without a name is saved with a placeholder: `"Unnamed Location"` (GeoJSON source),
`"Unknown"` (PMTiles source) or `"Unknown Location"` (basemap POI).

---

### `address` (string, optional)

**Description**: Postal address for the location

**Source**:
- Nominatim search, or a double-click / marker drop within `poiSnapRadius` of a basemap POI:
  composed by the plugin from the Nominatim result (see below)
- Custom POI sources: the source's own `properties.address`, verbatim; absent if it has none
- Double-click / marker drop away from any POI: not included — see
  [USAGE.md](USAGE.md#3-double-clicking-on-the-map) for why the threshold exists

**Examples**: `"Via Enrico Noë 24, 20133 Milano, Lombardia, Italia"`,
`"5th Avenue 350, 10118 New York, United States"`

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
- Absent if Nominatim fails or returns no postal field.

---

### `addressDetails` (object, optional)

**Description**: The administrative levels of the location, one field each, for grouping and
filtering — which `address`, a single string, does not allow.

**Fields**:

| Field | Meaning | Example |
| --- | --- | --- |
| `city` | City, town or village | `"Perugia"` |
| `county` | Province | `"Perugia"` |
| `state` | Region | `"Umbria"` |
| `postcode` | Postcode — only when Nominatim's own place is within `poiSnapRadius` (see below) | `"06124"` |
| `country` | Country | `"Italia"` |
| `country_code` | ISO 3166-1 alpha-2, lowercase | `"it"` |
| `admin` | The boundaries containing the place, keyed by OSM [`admin_level`](https://wiki.openstreetmap.org/wiki/Key:admin_level) | `{ "level4": "Umbria", "level6": "Perugia", "level8": "Perugia" }` |
| `language` | The language the names were requested in | `"it"` |

Only the fields Nominatim filled in are present. Unlike `address`, nothing is dropped for
repeating another level: a province named like its city is still listed under `county`.

The keys are [GeocodeJSON](https://github.com/geocoders/geocodejson-spec)'s, except
`country_code` (a Nominatim extension; Photon calls it `countrycode`) and `language` (the
plugin's own).

**Which to use**: `city`, `county` and `state` are enough for most uses. `admin` is the hierarchy as
OpenStreetMap records it, and the only place levels below the city appear (`level10` is a
*municipio* in Rome or Milan). Its levels mean different things in each country — in Italy
`level4` is the region, `level6` the province, `level8` the comune.

**Source**:
- Nominatim search, or a snap onto a basemap POI: the same Nominatim result that gives `address`
- Double-click / marker drop away from any POI: the nearest place Nominatim found. Almost always in
  the same city, but too far for its street or postcode to be the point's, so neither is kept
- Custom POI sources: a Nominatim lookup at the POI's point, likewise without `postcode`
- Locations saved before this field existed, or when Nominatim fails: not included

So `postcode` is present only when the place it belongs to is the place that was picked.

**Names are labels, not keys**: they follow the saving editor's language, so the same city can be
stored as `"Milano"` and `"Milan"`. Group by `country_code` when you need a key that does not
depend on it.

---

### `source` (string, optional)

**Description**: Identifier of the data source

**Values**: `"nominatim"`, or the `poiSources[].id` of a custom source (e.g. `"skatespots"`).
Not included for a double-click or marker drop away from any POI.

---

### `sourceId` (string, optional)

**Description**: Original unique identifier from the source

**Format**:
- Nominatim: `"nominatim-{place_id}"` (e.g., `"nominatim-68428992"`)
- Custom POI: Feature ID from GeoJSON (e.g., `"019ac1b6-5823-7808-9be6-62733b3d0a0a"`)

Set when a POI was picked — clicked, or snapped onto by a double-click or marker drop — and links
back to the original record. A Nominatim **search** result has none.

---

### `sourceLayer` (string, optional)

**Description**: Human-readable name of the source layer

The `poiSources[].name` from the plugin config, as shown in the layer control (e.g.
`"Skatespots"`). Custom POI sources only.

---

### `category` (string, optional)

**Description**: Type or category of the POI

**Source**:
- Nominatim (a snapped basemap POI): the OSM value, falling back to the OSM key — `bus_stop`, `hotel`
- Custom POI: the feature's `type`, else `sport`, else `leisure`, else `"poi"`
- Nominatim search results: not included

---

### `inputMethod` (string, optional)

**Description**: How the location was selected by the user

**Values**:
- `"search"` - picked from the search results
- `"poi_click"` - a POI was picked: clicked, or snapped onto by a double-click or marker drop
- `"map_click"` - double-clicked on the map, away from any POI
- `"marker_drag"` - dragged the pin, away from any POI

Always present once a location has been picked.

---

### `metadata` (object, optional)

**Description**: Additional custom data from the source

**Source**:
- Nominatim (a snapped basemap POI): OSM identifiers (`osm_id`, `osm_type`, `place_id`, `addresstype`, `class`, `category`)
- Custom POI: every property of the source feature, `name` included, as the source sent it
- Search results: not included

**Example** (custom POI): `{ "sport": "skateboard", "surface": "concrete" }`

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
    "addressDetails": {
      "city": "Milano",
      "county": "Milano",
      "state": "Lombardia",
      "postcode": "20122",
      "country": "Italia",
      "country_code": "it",
      "admin": { "level4": "Lombardia", "level6": "Milano", "level8": "Milano" },
      "language": "it"
    },
    "source": "nominatim",
    "inputMethod": "search"
  }
}
```

No `sourceId`, `category` or `metadata`. A result picked from one of your own POI layers carries
those of Example 2.

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
    "sourceLayer": "Skatespots",
    "category": "skateboard",
    "inputMethod": "poi_click",
    "addressDetails": {
      "city": "Milano",
      "county": "Milano",
      "state": "Lombardia",
      "country": "Italia",
      "country_code": "it",
      "admin": { "level4": "Lombardia", "level6": "Milano", "level8": "Milano", "level10": "Municipio 9" },
      "language": "it"
    },
    "metadata": {
      "name": "Ledge Milano District",
      "address": "Via Roma 1, 20121 Milano MI, Italy",
      "sport": "skateboard",
      "surface": "concrete"
    }
  }
}
```

`addressDetails` has no `postcode`: it comes from Nominatim, not from the source.

---

### Example 3: Map Double-Click (Snapped to POI)

**User action**: Double-clicked near a POI (within 5m snap radius)

**Saved data**: the POI's, exactly as in Example 2 — with the POI's coordinates, not the clicked
point's, and `inputMethod: "poi_click"` even though the user double-clicked or dragged the pin.

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

### Filtering by Place

Strapi's `$jsonSupersetOf` operator matches entries whose stored value *contains* the JSON you
pass, so any part of the feature can be filtered on — `addressDetails` included:

```bash
GET /api/articles?filters[location][$jsonSupersetOf]={"properties":{"addressDetails":{"city":"Milano"}}}
```

For a map field inside a component, add the component to the path:
`filters[location][map][$jsonSupersetOf]=…`, repeatable components included.

Build the value with `JSON.stringify` and let the URL API encode it:

```typescript
const params = new URLSearchParams({
  'filters[location][$jsonSupersetOf]': JSON.stringify({
    properties: { addressDetails: { country_code: 'it', admin: { level8: 'Milano' } } },
  }),
});
const response = await fetch(`${STRAPI_URL}/api/articles?${params}`);
```

**Notes**:
- **The value must be a JSON string.** Strapi's bracket syntax
  (`…[$jsonSupersetOf][properties][addressDetails][city]=Milano`) is **ignored without an error**:
  the filter drops out and every entry comes back.
- Malformed JSON answers `500 Internal Server Error`, not `400`.
- Values match exactly, case included. There is no "contains" on a name, and names follow the
  saving editor's language (see [`addressDetails`](#addressdetails-object-optional)): filter on
  `country_code` when you need a key that does not depend on it.
- Drafts need `status=draft`, as with any other filter.
- The operator is translated by knex to `@>` on PostgreSQL. Checked on Strapi 5.59 with
  PostgreSQL; other databases are untested.
- The column has no JSON index. For large collections, a GIN index on it is a database-level
  addition of your own.
- Locations saved before `addressDetails` existed have none, so they never match a filter on it.

### TypeScript/JavaScript Examples

**Extract coordinates**:

```typescript
const location = article.location;
const [longitude, latitude] = location.geometry.coordinates;

console.log(`Lat: ${latitude}, Lng: ${longitude}`);
// Output: Lat: 45.4601, Lng: 9.1901
```

**Picked place, or just a point**:

```typescript
const isPlace = location.properties.name !== undefined; // a point away from any POI has no name
```

**Group by city**:

```typescript
const byCity = Object.groupBy(
  articles,
  (article) => article.location?.properties.addressDetails?.city ?? 'Unknown'
);
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

**Common mistake**: swapping latitude and longitude.

```typescript
// WRONG - Latitude first (won't display correctly on map)
"coordinates": [45.4601, 9.1901]

// CORRECT - Longitude first (GeoJSON standard)
"coordinates": [9.1901, 45.4601]
```

## Best Practices

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
