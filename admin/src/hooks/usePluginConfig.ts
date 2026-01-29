import { useState, useEffect } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import type { MapLibreConfig } from '../../../server/src/types/config';

// Default configuration - fallback if API fails
const DEFAULT_CONFIG: MapLibreConfig = {
  mapStyles: [
    {
      id: 'default',
      name: 'Default',
      url: 'https://tiles.openfreemap.org/styles/liberty',
      isDefault: true,
    },
  ],
  defaultZoom: 4.5,
  defaultCenter: [0, 0], // Null Island - fallback if not configured
  geocodingProvider: 'nominatim',
  nominatimUrl: 'https://nominatim.openstreetmap.org',
};

export const usePluginConfig = (): MapLibreConfig => {
  const [config, setConfig] = useState<MapLibreConfig>(DEFAULT_CONFIG);
  const { get } = useFetchClient();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await get('/maplibre-field/config');
        if (response.data) {
          setConfig({ ...DEFAULT_CONFIG, ...response.data });
        }
      } catch {
        // Silently use default config on error
      }
    };

    fetchConfig();
  }, [get]);

  return config;
};
