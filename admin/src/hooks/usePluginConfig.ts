import { useState, useEffect } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import type { MapLibreConfig } from '../../../server/src/types/config';

// Fallback while the config loads, or if the request fails. Also the only source of the default
// mapStyles and defaultCenter, which the server leaves out (see server/src/config/schema.ts).
const DEFAULT_CONFIG: MapLibreConfig = {
  mapStyles: [
    {
      id: 'ofm',
      name: 'OpenFreeMap',
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
        const response = await get<Partial<MapLibreConfig>>('/maplibre-field/config');
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
