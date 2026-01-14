export interface MapStyle {
  id: string;
  name: string;
  url: string;
  isDefault?: boolean;
}

export interface POISource {
  id: string;
  name: string;
  apiUrl: string;
  enabled?: boolean;
  color?: string; // Hex color for dropdown dots and map markers
}

export interface MapLibreConfig {
  mapStyles: MapStyle[];
  defaultZoom?: number;
  defaultCenter?: [number, number];
  geocodingProvider?: 'nominatim';
  nominatimUrl?: string;

  // Multiple POI sources configuration
  poiSources?: POISource[];

  poiDisplayEnabled?: boolean;
  poiMinZoom?: number;
  poiMaxDisplay?: number;
  poiSearchEnabled?: boolean;
  poiSnapRadius?: number; // Snap radius in meters for double-click POI detection (default: 5m)
}
