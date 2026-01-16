import schema from './schema';
import type { MapLibreConfig, MapStyle, POISource } from '../types/config';

/**
 * Validates the plugin configuration at boot time.
 * Throws an error if required fields are missing or invalid.
 */
function validator(config: MapLibreConfig): void {
  // Validate mapStyles
  if (!config.mapStyles || !Array.isArray(config.mapStyles)) {
    throw new Error('[maplibre-field] config.mapStyles must be an array');
  }

  if (config.mapStyles.length === 0) {
    throw new Error('[maplibre-field] config.mapStyles must contain at least one style');
  }

  config.mapStyles.forEach((style: MapStyle, index: number) => {
    if (!style.id || typeof style.id !== 'string') {
      throw new Error(`[maplibre-field] mapStyles[${index}].id must be a non-empty string`);
    }
    if (!style.name || typeof style.name !== 'string') {
      throw new Error(`[maplibre-field] mapStyles[${index}].name must be a non-empty string`);
    }
    if (!style.url || typeof style.url !== 'string') {
      throw new Error(`[maplibre-field] mapStyles[${index}].url must be a non-empty string`);
    }
  });

  // Validate defaultZoom
  if (config.defaultZoom !== undefined) {
    if (
      typeof config.defaultZoom !== 'number' ||
      config.defaultZoom < 0 ||
      config.defaultZoom > 24
    ) {
      throw new Error('[maplibre-field] config.defaultZoom must be a number between 0 and 24');
    }
  }

  // Validate defaultCenter
  if (config.defaultCenter !== undefined) {
    if (
      !Array.isArray(config.defaultCenter) ||
      config.defaultCenter.length !== 2 ||
      typeof config.defaultCenter[0] !== 'number' ||
      typeof config.defaultCenter[1] !== 'number'
    ) {
      throw new Error('[maplibre-field] config.defaultCenter must be [longitude, latitude]');
    }
    const [lng, lat] = config.defaultCenter;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new Error('[maplibre-field] config.defaultCenter coordinates out of range');
    }
  }

  // Validate poiSources if provided
  if (config.poiSources !== undefined) {
    if (!Array.isArray(config.poiSources)) {
      throw new Error('[maplibre-field] config.poiSources must be an array');
    }

    config.poiSources.forEach((source: POISource, index: number) => {
      if (!source.id || typeof source.id !== 'string') {
        throw new Error(`[maplibre-field] poiSources[${index}].id must be a non-empty string`);
      }
      if (!source.name || typeof source.name !== 'string') {
        throw new Error(`[maplibre-field] poiSources[${index}].name must be a non-empty string`);
      }
      if (!source.apiUrl || typeof source.apiUrl !== 'string') {
        throw new Error(`[maplibre-field] poiSources[${index}].apiUrl must be a non-empty string`);
      }
    });
  }

  // Validate numeric POI settings
  if (config.poiMinZoom !== undefined) {
    if (typeof config.poiMinZoom !== 'number' || config.poiMinZoom < 0 || config.poiMinZoom > 24) {
      throw new Error('[maplibre-field] config.poiMinZoom must be a number between 0 and 24');
    }
  }

  if (config.poiMaxDisplay !== undefined) {
    if (typeof config.poiMaxDisplay !== 'number' || config.poiMaxDisplay < 1) {
      throw new Error('[maplibre-field] config.poiMaxDisplay must be a positive number');
    }
  }

  if (config.poiSnapRadius !== undefined) {
    if (typeof config.poiSnapRadius !== 'number' || config.poiSnapRadius < 0) {
      throw new Error('[maplibre-field] config.poiSnapRadius must be a non-negative number');
    }
  }
}

export default {
  default: schema,
  validator,
};
