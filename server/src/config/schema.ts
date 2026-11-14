import type { MapLibreConfig } from '../types/config';

/**
 * Default values, merged under the app's config by Strapi at boot with lodash's `defaultsDeep`.
 *
 * They must be plain values: Strapi does not read a `{ type, default }` schema, it merges this
 * object as-is, so a schema here ends up as the option's value.
 *
 * `mapStyles` and `defaultCenter` are left out on purpose. `defaultsDeep` merges arrays index by
 * index, so a default array would leak into the app's: its first style would inherit
 * `isDefault: true` from ours. When they are not configured, the admin falls back to OpenFreeMap
 * and `[0, 0]` (see `DEFAULT_CONFIG` in admin/src/hooks/usePluginConfig.ts).
 */
const defaults: Omit<MapLibreConfig, 'mapStyles' | 'defaultCenter'> = {
  defaultZoom: 4.5,
  geocodingProvider: 'nominatim',
  nominatimUrl: 'https://nominatim.openstreetmap.org',
  // Display POI markers on the map
  poiDisplayEnabled: true,
  // Minimum zoom level at which POI markers are displayed
  poiMinZoom: 10,
  // Maximum number of POIs displayed on the map
  poiMaxDisplay: 100,
  // Include custom POI results in the search field
  poiSearchEnabled: true,
  // Radius in metres within which a picked point snaps to a POI
  poiSnapRadius: 5,
  // CSS-based fullscreen (faster on some devices) instead of the native Fullscreen API
  useFullscreenPseudo: true,
};

export default defaults;
