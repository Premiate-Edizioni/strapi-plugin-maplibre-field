import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { useNotification } from '@strapi/strapi/admin';
import SearchBox from './SearchBox';
import BasemapControlComponent from './basemap-control';
import LayerControl, { LayerConfig } from './layer-control';
import { Flex, Grid, Typography, Field } from '@strapi/design-system';
import Map, {
  Marker,
  Source,
  Layer,
  useControl,
  type MapLayerMouseEvent,
  type MapRef,
  type MarkerDragEvent,
} from 'react-map-gl/maplibre';
import getTranslation from '../../utils/getTrad';
import { Protocol } from 'pmtiles';
import * as maplibregl from 'maplibre-gl';
import { configureMaplibreWorker } from '../../utils/maplibreWorker';

import { usePluginConfig } from '../../hooks/usePluginConfig';
import {
  POI,
  LocationFeature,
  createLocationFeature,
  queryPOIsForViewport,
  queryNominatim,
  searchNearbyCustomPOIs,
  findNearestPOI,
  calculateDistance,
} from '../../services/poi-service';
import 'maplibre-gl/dist/maplibre-gl.css';

// Must run before the first map is created (see utils/maplibreWorker.ts).
configureMaplibreWorker();

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

/**
 * MapLibre sizes the geolocate accuracy circle to the reported accuracy —
 * `diameter = 2 * accuracy / metresPerPixel` (GeolocateControl._updateCircleRadiusIfNeeded).
 * Desktop browsers locate by Wi-Fi or IP, so accuracy is routinely kilometres and the circle covers
 * the whole viewport. It ships without `pointer-events: none`, so it then swallows the mousedown
 * meant for the location pin underneath and the pin can no longer be dragged. The circle is
 * decorative — nothing listens to it — so it has no business capturing the pointer.
 *
 * Injected rather than kept in a .css file: the plugin build extracts stylesheets to
 * dist/admin/*.css and emits no import for them, so a plain CSS import never reaches the browser.
 */
const OVERRIDES_STYLE_ID = 'maplibre-field-overrides';
if (typeof document !== 'undefined' && !document.getElementById(OVERRIDES_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = OVERRIDES_STYLE_ID;
  style.textContent = '.maplibregl-user-location-accuracy-circle{pointer-events:none}';
  document.head.appendChild(style);
}

interface MapFieldProps {
  intlLabel: {
    id: string;
    defaultMessage: string;
  };
  name: string;
  onChange: (event: { target: { name: string; value: string; type: string } }) => void;
  value: string | null;
}

/**
 * The read-only fields below the map always show the same slots in the same places: "Name" and
 * "Address" each hold one property and stay empty when the selected location has no value for it,
 * so neither the labels nor the layout change as the user picks different kinds of location.
 */
const placeName = (feature: LocationFeature): string => feature.properties.name || '';
const placeAddress = (feature: LocationFeature): string => feature.properties.address || '';

/**
 * "You picked this" notifications, one per combination of what we know about the pick. Full
 * sentences rather than a name joined to its layer by an arrow: an arrow is a symbol standing in
 * for a preposition, and prepositions differ per language.
 */
const SELECTION_MESSAGES = {
  'notification.selected': 'Selected {name}',
  'notification.selected-from-layer': 'Selected {name} from {layer}',
  'notification.snapped': 'Selected {name} ({distance}m away)',
  'notification.snapped-from-layer': 'Selected {name} from {layer} ({distance}m away)',
} as const;

/**
 * The map's top-right controls, in the order users expect them: the one that acts on the container
 * (fullscreen) above the ones that act on the view (zoom, compass, geolocate). Basemap and layer
 * controls add themselves later and land below, which is where controls that change *what* is shown
 * belong.
 *
 * They live in one component on purpose. MapLibre has no ordering API — `addControl` appends in call
 * order — so as long as each control is its own React component the stack order is decided by which
 * one happens to mount first. Declaring the three `useControl` calls together makes the order
 * explicit in the source instead of a side effect of mount timing.
 *
 * Fullscreen is built by hand rather than with react-map-gl's <FullscreenControl>, whose prop types
 * accept `pseudo` but which only ever constructs `new FullscreenControl({ container })` — the option
 * is silently dropped. That left `useFullscreenPseudo` dead and every map on the native Fullscreen
 * API, which on Firefox/Linux returns a full-screen but frozen, uninteractive map.
 */
const MapControls: React.FC<{ pseudo: boolean }> = ({ pseudo }) => {
  useControl(({ mapLib }) => new mapLib.FullscreenControl({ pseudo }), { position: 'top-right' });
  useControl(({ mapLib }) => new mapLib.NavigationControl({}), { position: 'top-right' });
  useControl(
    ({ mapLib }) => {
      // `trackUserLocation` makes the button a switch rather than a one-shot action, the way
      // openstreetmap.org's locate control behaves: pressing it again turns location off and takes
      // the dot and the accuracy circle off the map. Without it MapLibre only ever re-centres, and
      // the user has no way to dismiss the overlay short of reloading the page. It costs a
      // `watchPosition` while active — but only while the user has chosen to keep it on.
      const geolocate = new mapLib.GeolocateControl({ trackUserLocation: true });
      // Ported from react-map-gl's own GeolocateControl: StrictMode adds the control twice, and
      // its UI setup is async, so without this guard the button's contents are created twice.
      const control = geolocate as unknown as { _setupUI: () => void; _container: HTMLElement };
      const setupUI = control._setupUI;
      control._setupUI = () => {
        if (!control._container.hasChildNodes()) setupUI();
      };
      return geolocate;
    },
    { position: 'top-right' }
  );
  return null;
};

const selectionMessageId = (
  hasLayer: boolean,
  hasDistance: boolean
): keyof typeof SELECTION_MESSAGES => {
  if (hasDistance) return hasLayer ? 'notification.snapped-from-layer' : 'notification.snapped';
  return hasLayer ? 'notification.selected-from-layer' : 'notification.selected';
};

const MapField: React.FC<MapFieldProps> = ({ intlLabel, name, onChange, value }) => {
  const { formatMessage, locale } = useIntl();
  const { toggleNotification } = useNotification();
  const config = usePluginConfig();
  const mapRef = useRef<MapRef>(null);

  // Ensure intlLabel has the correct format for formatMessage
  const label = intlLabel || { id: 'maplibre-field.label', defaultMessage: 'Map' };

  // Safely parse JSON value with error handling
  let result: LocationFeature | null = null;
  if (value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      // Validate the parsed result has the expected GeoJSON Feature structure
      if (parsed && typeof parsed === 'object' && parsed.geometry?.coordinates) {
        result = parsed as LocationFeature;
      }
    } catch (error) {
      console.error('MapField: Invalid JSON value', error);
      // Don't crash, just use null which will trigger default values
    }
  }

  const isDefaultViewState = result == null;

  // Safely extract coordinates with validation
  let initialCoordinates: [number, number] = config.defaultCenter || [0, 0];
  if (result?.geometry?.coordinates && Array.isArray(result.geometry.coordinates)) {
    const [lng, lat] = result.geometry.coordinates;
    if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
      initialCoordinates = [lng, lat];
    }
  }

  // [0, 0] is Null Island: name the point rather than inventing an address it does not have
  const isNullIsland = initialCoordinates[0] === 0 && initialCoordinates[1] === 0;
  const initialName = (result && placeName(result)) || (isNullIsland ? 'Null Island' : '');

  // Set when the search has already flown the camera to the new point, so the recentring effect
  // below leaves that animation alone.
  const cameraMovedBySearchRef = useRef(false);

  const [longitude, setLongitude] = useState(initialCoordinates[0]);
  const [latitude, setLatitude] = useState(initialCoordinates[1]);
  const [locationName, setLocationName] = useState(initialName);
  const [address, setAddress] = useState(result ? placeAddress(result) : '');

  const [viewState, setViewState] = useState({
    longitude: initialCoordinates[0],
    latitude: initialCoordinates[1],
    zoom: isDefaultViewState ? config.defaultZoom || 4.5 : 15, // Use zoom 15 when coordinates are saved
  });

  // Initialize current style from config (prefer isDefault, fallback to first)
  const [currentStyleUrl, setCurrentStyleUrl] = useState(() => {
    if (config.mapStyles && config.mapStyles.length > 0) {
      // Use style marked as default, or fallback to first style
      const defaultStyle = config.mapStyles.find((s) => s.isDefault);
      return defaultStyle?.url || config.mapStyles[0].url;
    }
    // No fallback - if config is missing, MapLibre will fail with a clear error
    return '';
  });

  // POI state
  const [displayedPOIs, setDisplayedPOIs] = useState<POI[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [isUpdatingPOIs, setIsUpdatingPOIs] = useState(false);
  const updatePOITimerRef = useRef<NodeJS.Timeout | null>(null);
  const poiLayersRef = useRef<LayerConfig[]>([]);

  // Layer control state - initialize from config
  const [poiLayers, setPoiLayers] = useState<LayerConfig[]>(() => {
    if (!config.poiDisplayEnabled) return [];

    // New format: use poiSources array
    if (config.poiSources && config.poiSources.length > 0) {
      return config.poiSources.map((source) => ({
        id: source.id,
        name: source.name,
        enabled: source.enabled !== false, // Default to enabled if not specified
        color: source.color, // Pass the color from config
        sourceType: source.type,
      }));
    }

    return [];
  });

  // Keep ref in sync with state
  useEffect(() => {
    poiLayersRef.current = poiLayers;
  }, [poiLayers]);

  // Update zoom when config is loaded
  useEffect(() => {
    if (config.defaultZoom && isDefaultViewState) {
      setViewState((prev) => ({
        ...prev,
        zoom: config.defaultZoom ?? prev.zoom,
      }));
    }
  }, [config.defaultZoom, isDefaultViewState]);

  // Update coordinates and address when config.defaultCenter is loaded (only when no value is saved)
  useEffect(() => {
    if (config.defaultCenter && isDefaultViewState) {
      const [lng, lat] = config.defaultCenter;
      const isNullIsland = lng === 0 && lat === 0;
      setLongitude(lng);
      setLatitude(lat);
      setLocationName(isNullIsland ? 'Null Island' : '');
      setAddress('');
      setViewState((prev) => ({
        ...prev,
        longitude: lng,
        latitude: lat,
      }));
    }
  }, [config.defaultCenter, isDefaultViewState]);

  // Update map style when config is loaded
  useEffect(() => {
    if (config.mapStyles && config.mapStyles.length > 0) {
      // Use style marked as default, or fallback to first style
      const defaultStyle = config.mapStyles.find((s) => s.isDefault);
      const newStyleUrl = defaultStyle?.url || config.mapStyles[0].url;
      // Only update if the style URL has changed and is not empty
      if (newStyleUrl && newStyleUrl !== currentStyleUrl) {
        setCurrentStyleUrl(newStyleUrl);
      }
    }
  }, [config.mapStyles]);

  // Update layers when config changes
  useEffect(() => {
    if (!config.poiDisplayEnabled) {
      setPoiLayers([]);
      return;
    }

    // Use poiSources array
    if (config.poiSources && config.poiSources.length > 0) {
      setPoiLayers(
        config.poiSources.map((source) => ({
          id: source.id,
          name: source.name,
          enabled: source.enabled !== false,
          color: source.color, // Pass the color from config
          sourceType: source.type,
        }))
      );
      return;
    }

    setPoiLayers([]);
  }, [config.poiDisplayEnabled, config.poiSources]);

  const handleStyleChange = (newStyleUrl: string) => {
    if (!mapRef.current) return;

    const map = mapRef.current.getMap();
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    // Change style while preserving view state
    map.setStyle(newStyleUrl);

    // Wait for style to load, then restore view
    map.once('styledata', () => {
      map.setCenter(currentCenter);
      map.setZoom(currentZoom);
    });

    setCurrentStyleUrl(newStyleUrl);
  };

  // Handle layer toggle from layer control
  const handleLayerToggle = useCallback((layerId: string, enabled: boolean) => {
    setPoiLayers((prevLayers) =>
      prevLayers.map((layer) => (layer.id === layerId ? { ...layer, enabled } : layer))
    );
    // Note: updatePOIMarkers() will be triggered by the useEffect that watches poiLayers
  }, []);

  // Helper: collect active PMTiles circle layer IDs
  const getPMTilesLayerIds = (): string[] =>
    (config.poiSources || [])
      .filter(
        (s) => s.type === 'pmtiles' && poiLayersRef.current.find((l) => l.id === s.id)?.enabled
      )
      .map((s) => `pmtiles-circle-${s.id}`);

  // POI sources for SearchBox, with `enabled` reflecting the live layer-control toggle
  // rather than each source's static default from plugin config
  const searchablePoiSources = useMemo(
    () =>
      (config.poiSources || []).map((source) => ({
        ...source,
        enabled: poiLayers.find((layer) => layer.id === source.id)?.enabled ?? source.enabled,
      })),
    [config.poiSources, poiLayers]
  );

  // Callback passed to SearchBox so it can query features loaded in the map (for PMTiles sources)
  const queryMapFeatures = (sourceId: string, sourceLayer: string) => {
    if (!mapRef.current) return [];
    const map = mapRef.current.getMap();
    try {
      return map.querySourceFeatures(sourceId, { sourceLayer }) as {
        geometry: { type: string; coordinates: number[] };
        properties: Record<string, unknown> | null;
        id?: string | number;
      }[];
    } catch {
      return [];
    }
  };

  // Update POI markers based on map viewport (with debouncing)
  const updatePOIMarkers = async () => {
    // Clear any pending update
    if (updatePOITimerRef.current) {
      clearTimeout(updatePOITimerRef.current);
    }

    // Debounce updates to avoid overwhelming MapLibre
    updatePOITimerRef.current = setTimeout(async () => {
      // Use ref to get the most current layer state (not closure state)
      const currentPoiLayers = poiLayersRef.current;

      // Check if any layer is enabled (calculate inside the async function to get latest state)
      const hasEnabledLayers = currentPoiLayers.some((layer) => layer.enabled);

      if (!mapRef.current || !config.poiDisplayEnabled) {
        return;
      }

      // If no layers are enabled, clear POIs
      if (!hasEnabledLayers) {
        setDisplayedPOIs([]);
        return;
      }

      // Don't block on isUpdatingPOIs - instead, cancel and restart
      if (isUpdatingPOIs) {
        return;
      }

      const map = mapRef.current.getMap();
      const zoom = map.getZoom();

      // Hide POIs when zoomed out
      if (zoom < (config.poiMinZoom || 10)) {
        setDisplayedPOIs([]);
        return;
      }

      const bounds = map.getBounds();
      const center = map.getCenter();

      try {
        setIsUpdatingPOIs(true);

        // Get enabled layers from current state
        const enabledLayers = currentPoiLayers.filter((layer) => layer.enabled);

        // Collect POIs from all enabled sources
        const allPOIs: POI[] = [];

        for (const layer of enabledLayers) {
          // Find API URL for this layer
          let apiUrl: string | null = null;
          let mapName: string = layer.name;

          // New format: find in poiSources
          if (config.poiSources) {
            const source = config.poiSources.find((s) => s.id === layer.id);
            if (source) {
              apiUrl = source.apiUrl;
              mapName = source.name;
              // PMTiles sources are rendered natively as vector tile layers — skip HTTP fetch
              if (source.type === 'pmtiles') continue;
            }
          }

          if (apiUrl) {
            const pois = await queryPOIsForViewport(
              {
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest(),
              },
              [center.lng, center.lat],
              config.poiMaxDisplay || 100,
              {
                nominatimUrl: config.nominatimUrl || 'https://nominatim.openstreetmap.org',
                customApiUrl: apiUrl,
                mapName: mapName,
                layerId: layer.id,
                radius: 100,
                categories: [],
              }
            );

            allPOIs.push(...pois);
          }
        }

        // Use requestAnimationFrame to update during next render cycle
        requestAnimationFrame(() => {
          setDisplayedPOIs(allPOIs);
          setIsUpdatingPOIs(false);
        });
      } catch (error) {
        console.error('Failed to load POIs:', error);
        setIsUpdatingPOIs(false);
      }
    }, 300); // 300ms debounce delay
  };

  // Handle main marker drag - reposition the point directly on the map.
  // Snaps to a nearby POI just like double-clicking the map does.
  const handleMainMarkerDragEnd = async (evt: MarkerDragEvent) => {
    await setLocationWithPOISnap([evt.lngLat.lng, evt.lngLat.lat], 'marker_drag');
  };

  /**
   * `distance` is set when the POI was snapped to rather than clicked directly, so the notification
   * can say how far the picked point ended up from where the user actually pointed.
   */
  const handlePOIClick = async (poi: POI, distance?: number) => {
    setSelectedPOI(poi);

    // Use existing address from POI (NO additional reverse geocoding)
    const address = poi.address || '';

    // Update field values with POI data as GeoJSON Feature
    updateValues(
      createLocationFeature(poi.coordinates, {
        name: poi.name,
        address: address,
        source: poi.source === 'custom' ? poi.layerId : 'nominatim',
        sourceId: poi.id,
        sourceLayer: poi.mapName,
        category: poi.type,
        inputMethod: 'poi_click',
        metadata: poi.metadata,
      })
    );

    const messageId = selectionMessageId(Boolean(poi.mapName), distance !== undefined);
    toggleNotification({
      type: 'success',
      message: formatMessage(
        { id: getTranslation(messageId), defaultMessage: SELECTION_MESSAGES[messageId] },
        {
          name: poi.name,
          layer: poi.mapName,
          distance: distance === undefined ? undefined : Math.round(distance),
        }
      ),
    });
  };

  // Handle map click - check for POI marker clicks (GeoJSON and PMTiles layers)
  const handleMapClick = (evt: MapLayerMouseEvent) => {
    if (!mapRef.current) return;

    const map = mapRef.current.getMap();

    // Collect all queryable layers (GeoJSON + PMTiles)
    const pmtilesLayerIds = getPMTilesLayerIds().filter((id) => map.getLayer(id));
    const allQueryLayers = [
      ...(map.getLayer('poi-circles') ? ['poi-circles'] : []),
      ...pmtilesLayerIds,
    ];

    if (allQueryLayers.length === 0) return;

    const features = map.queryRenderedFeatures(evt.point, { layers: allQueryLayers });
    if (!features || features.length === 0) return;

    const feature = features[0];

    // Handle click on a PMTiles vector tile feature
    if (feature.layer?.id?.startsWith('pmtiles-circle-')) {
      const sourceId = feature.layer.id.replace('pmtiles-circle-', '');
      const sourceConfig = config.poiSources?.find((s) => s.id === sourceId);
      const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates;
      const poi: POI = {
        id: String(feature.id ?? `pmtiles-${Date.now()}`),
        name: String(feature.properties?.name ?? 'Unknown'),
        type: String(feature.properties?.type ?? 'poi'),
        coordinates: coords,
        address: String(feature.properties?.address ?? ''),
        source: 'custom',
        mapName: sourceConfig?.name,
        layerId: sourceId,
        metadata: feature.properties as Record<string, unknown>,
      };
      handlePOIClick(poi);
      return;
    }

    // Handle click on a GeoJSON POI marker
    const featureName = feature.properties?.name;
    let clickedPOI = displayedPOIs.find((p) => p.name === featureName);

    // Fallback: try to match by ID if name didn't work
    if (!clickedPOI) {
      clickedPOI = displayedPOIs.find((p) => p.id === feature.id);
    }

    // Fallback: try string comparison if numeric ID didn't match
    if (!clickedPOI && feature.id !== undefined) {
      clickedPOI = displayedPOIs.find((p) => p.id === String(feature.id));
    }

    if (clickedPOI) {
      handlePOIClick(clickedPOI);
    }
  };

  // Double-click handler - searches for nearby POI or saves coordinates only
  const handleMapDoubleClick = async (evt: MapLayerMouseEvent) => {
    evt.preventDefault();
    await setLocationWithPOISnap([evt.lngLat.lng, evt.lngLat.lat], 'map_click');
  };

  /**
   * Place the location at the given coordinates, snapping to the nearest POI
   * within the configured radius. Falls back to plain coordinates when no POI
   * is close enough. Shared by the double-click and marker-drag handlers so
   * both gestures behave identically.
   */
  const setLocationWithPOISnap = async (
    clickCoords: [number, number],
    inputMethod: 'map_click' | 'marker_drag'
  ) => {
    // Get snap radius from config (default: 5 meters)
    const snapRadius = typeof config.poiSnapRadius === 'number' ? config.poiSnapRadius : 5;

    // Try to find nearby POI within snap radius from all enabled sources
    try {
      const enabledLayers = poiLayers.filter((layer) => layer.enabled);
      const allNearbyPOIs: POI[] = [];

      // Nominatim covers the basemap's own POIs, so it is queried once per gesture — independently
      // of how many custom sources are configured, and also when none is.
      const basemapPOIs = await queryNominatim(
        clickCoords[1], // lat
        clickCoords[0], // lng
        snapRadius,
        config.nominatimUrl || 'https://nominatim.openstreetmap.org',
        locale
      );

      allNearbyPOIs.push(...basemapPOIs);

      // Search in all enabled sources
      for (const layer of enabledLayers) {
        let apiUrl: string | null = null;
        let mapName: string = layer.name;

        // Find in poiSources
        if (config.poiSources) {
          const source = config.poiSources.find((s) => s.id === layer.id);
          if (source) {
            apiUrl = source.apiUrl;
            mapName = source.name;
            // PMTiles sources: snap handled below via queryRenderedFeatures
            if (source.type === 'pmtiles') continue;
          }
        }

        if (apiUrl) {
          const pois = await searchNearbyCustomPOIs(
            clickCoords[1], // lat
            clickCoords[0], // lng
            {
              nominatimUrl: config.nominatimUrl || 'https://nominatim.openstreetmap.org',
              language: locale,
              customApiUrl: apiUrl,
              mapName: mapName,
              layerId: layer.id,
              radius: snapRadius,
              categories: [],
            }
          );

          allNearbyPOIs.push(...pois);
        }
      }

      // Snap on PMTiles sources via queryRenderedFeatures
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        const pmtilesLayerIds = getPMTilesLayerIds().filter((id) => map.getLayer(id));
        if (pmtilesLayerIds.length > 0) {
          const pixelPoint = map.project({ lng: clickCoords[0], lat: clickCoords[1] });
          const pixelRadius = 20;
          const bbox: [[number, number], [number, number]] = [
            [pixelPoint.x - pixelRadius, pixelPoint.y - pixelRadius],
            [pixelPoint.x + pixelRadius, pixelPoint.y + pixelRadius],
          ];
          const rendered = map.queryRenderedFeatures(bbox, { layers: pmtilesLayerIds });
          for (const f of rendered) {
            const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
            const dist = calculateDistance(clickCoords, coords);
            if (dist <= snapRadius) {
              const sourceId = f.layer.id.replace('pmtiles-circle-', '');
              const sourceConfig = config.poiSources?.find((s) => s.id === sourceId);
              allNearbyPOIs.push({
                id: String(f.id ?? `pmtiles-snap-${Date.now()}`),
                name: String(f.properties?.name ?? 'Unknown'),
                type: String(f.properties?.type ?? 'poi'),
                coordinates: coords,
                address: String(f.properties?.address ?? ''),
                source: 'custom',
                mapName: sourceConfig?.name,
                layerId: sourceId,
                metadata: f.properties as Record<string, unknown>,
                distance: dist,
              });
            }
          }
        }
      }

      // Find the nearest POI
      const nearestPOI = findNearestPOI(clickCoords, allNearbyPOIs);

      if (nearestPOI && nearestPOI.distance !== undefined && nearestPOI.distance <= snapRadius) {
        // Found a POI within snap radius - handlePOIClick does the processing and the notification
        await handlePOIClick(nearestPOI, nearestPOI.distance);
      } else {
        // No POI found nearby - save coordinates only as minimal GeoJSON Feature
        updateValues(
          createLocationFeature(clickCoords, {
            inputMethod,
          })
        );

        toggleNotification({
          type: 'info',
          message: formatMessage({
            id: getTranslation('coordinates-saved'),
            defaultMessage: 'Coordinates set',
          }),
        });
      }
    } catch (error) {
      console.error('Failed to search nearby POIs:', error);

      // Fallback: save coordinates only as minimal GeoJSON Feature
      updateValues(
        createLocationFeature(clickCoords, {
          inputMethod,
        })
      );

      toggleNotification({
        type: 'info',
        message: formatMessage({
          id: getTranslation('coordinates-saved'),
          defaultMessage: 'Coordinates set',
        }),
      });
    }
  };

  const updateValues = (feature: LocationFeature) => {
    if (!feature) return;
    const value = JSON.stringify(feature);
    setLocationName(placeName(feature));
    setAddress(placeAddress(feature));
    setLongitude(feature.geometry.coordinates[0]);
    setLatitude(feature.geometry.coordinates[1]);
    onChange({ target: { name, value, type: 'json' } });
  };

  // Handle search result selection from SearchBox
  const handleSearchResult = (feature: LocationFeature) => {
    // Update map position
    if (feature.geometry?.coordinates) {
      // The flyTo below is the camera move for this change; tell the recentring effect to stand
      // down, or its easeTo would cancel the flight a frame later and the arc would be lost.
      cameraMovedBySearchRef.current = true;
      const [lng, lat] = feature.geometry.coordinates;
      mapRef.current?.flyTo({
        // Zoom 15, not 16: flyTo derives both the duration and the height of its arc from the
        // length of the flight path, and the extra level made the camera climb higher and take
        // noticeably longer. 15 is also what the map opens at for a saved value.
        center: [lng, lat],
        zoom: 15,
        essential: true,
      });
    }

    // Update form values - this will call onChange ONCE
    updateValues(feature);

    // Show notification
    toggleNotification({
      type: 'success',
      message: formatMessage(
        {
          id: getTranslation('notification.selected'),
          defaultMessage: SELECTION_MESSAGES['notification.selected'],
        },
        { name: placeName(feature) || placeAddress(feature) }
      ),
    });
  };

  // Keep the picked point centred when it moves — but never touch the zoom. This used to fly to a
  // hardcoded zoom 15, which threw the user back out whenever they placed a point while zoomed in,
  // and silently undid the search's own flyTo to 16. The zoom is the user's working context;
  // choosing a point is not a request to change it.
  useEffect(() => {
    if (cameraMovedBySearchRef.current) {
      cameraMovedBySearchRef.current = false;
      return;
    }
    if (!isDefaultViewState && mapRef.current) {
      const map = mapRef.current.getMap();
      map?.easeTo({ center: [longitude, latitude] });
    }
  }, [longitude, latitude, isDefaultViewState]);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => {
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  // Load POIs when map moves or zooms
  useEffect(() => {
    if (!mapRef.current || !config.poiDisplayEnabled) return;

    const map = mapRef.current.getMap();

    const handleMapUpdate = () => {
      updatePOIMarkers();
    };

    // Load POIs on initial load
    map.once('load', handleMapUpdate);

    // Reload POIs when map moves or zooms
    map.on('moveend', handleMapUpdate);
    map.on('zoomend', handleMapUpdate);

    return () => {
      map.off('moveend', handleMapUpdate);
      map.off('zoomend', handleMapUpdate);
      // Clear pending timer on cleanup
      if (updatePOITimerRef.current) {
        clearTimeout(updatePOITimerRef.current);
      }
    };
  }, [config.poiDisplayEnabled, config.poiMinZoom, config.poiMaxDisplay, config.poiSources]);

  // Reload POIs when layers are toggled
  useEffect(() => {
    if (!mapRef.current || !config.poiDisplayEnabled) return;

    // Trigger POI reload when layer state changes
    updatePOIMarkers();
  }, [JSON.stringify(poiLayers.map((l) => ({ id: l.id, enabled: l.enabled })))]);

  // Add cursor pointer on POI hover (GeoJSON and PMTiles layers)
  useEffect(() => {
    if (!mapRef.current || !config.poiDisplayEnabled) return;

    const map = mapRef.current.getMap();

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const registerHoverHandlers = () => {
      map.on('mouseenter', 'poi-circles', handleMouseEnter);
      map.on('mouseleave', 'poi-circles', handleMouseLeave);
      for (const layerId of getPMTilesLayerIds()) {
        map.on('mouseenter', layerId, handleMouseEnter);
        map.on('mouseleave', layerId, handleMouseLeave);
      }
    };

    if (map.loaded()) {
      registerHoverHandlers();
    } else {
      map.on('load', registerHoverHandlers);
    }

    return () => {
      map.off('mouseenter', 'poi-circles', handleMouseEnter);
      map.off('mouseleave', 'poi-circles', handleMouseLeave);
      for (const layerId of getPMTilesLayerIds()) {
        map.off('mouseenter', layerId, handleMouseEnter);
        map.off('mouseleave', layerId, handleMouseLeave);
      }
    };
  }, [config.poiDisplayEnabled, JSON.stringify(getPMTilesLayerIds())]);

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Typography textColor="neutral800" variant="pi" fontWeight="bold">
        {formatMessage(label)}
      </Typography>

      {/* Search Box - NEW */}
      <SearchBox
        onSelectResult={handleSearchResult}
        nominatimUrl={config.nominatimUrl || 'https://nominatim.openstreetmap.org'}
        poiSearchEnabled={config.poiSearchEnabled}
        poiSources={searchablePoiSources}
        queryMapFeatures={queryMapFeatures}
      />

      <Flex
        direction="column"
        alignItems="stretch"
        style={{
          height: '500px',
          width: '100%',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          onClick={handleMapClick}
          onDblClick={handleMapDoubleClick}
          mapStyle={currentStyleUrl}
        >
          {/* keyed so a late-arriving config value rebuilds the controls with the right mode */}
          <MapControls
            key={String(config.useFullscreenPseudo ?? true)}
            pseudo={config.useFullscreenPseudo ?? true}
          />
          {config.mapStyles && config.mapStyles.length > 1 && (
            <BasemapControlComponent
              mapStyles={config.mapStyles}
              currentStyleUrl={currentStyleUrl}
              onStyleChange={handleStyleChange}
            />
          )}

          {/* Layer Control for POIs */}
          {poiLayers.length > 0 && (
            <LayerControl mapRef={mapRef} layers={poiLayers} onLayerToggle={handleLayerToggle} />
          )}

          {/* POI Markers Layer */}
          {config.poiDisplayEnabled &&
            displayedPOIs.length > 0 &&
            (() => {
              // Create color mapping from layer configuration
              const layerColorMap: Record<string, string> = {};
              poiLayers.forEach((layer) => {
                if (layer.color) {
                  layerColorMap[layer.id] = layer.color;
                }
              });

              // Build MapLibre match expression for dynamic colors
              // Format: ['match', ['get', 'layerId'], 'layer1', 'color1', 'layer2', 'color2', ..., 'fallback']
              const colorMatchExpression: (string | string[])[] = ['match', ['get', 'layerId']];
              Object.entries(layerColorMap).forEach(([layerId, color]) => {
                colorMatchExpression.push(layerId, color);
              });
              colorMatchExpression.push('#999999'); // Fallback color for POIs without layerId

              return (
                <Source
                  key={`poi-source-${displayedPOIs.length}-${selectedPOI?.id || 'none'}`}
                  id="poi-markers"
                  type="geojson"
                  data={{
                    type: 'FeatureCollection',
                    features: displayedPOIs.slice(0, 100).map((poi) => ({
                      type: 'Feature',
                      id: poi.id,
                      geometry: {
                        type: 'Point',
                        coordinates: poi.coordinates,
                      },
                      properties: {
                        name: poi.name || 'Unknown',
                        type: poi.type || 'poi',
                        source: poi.source,
                        layerId: poi.layerId || '', // Include layerId for color mapping
                        isSelected: selectedPOI?.id === poi.id,
                      },
                    })),
                  }}
                >
                  <Layer
                    id="poi-circles"
                    type="circle"
                    paint={{
                      'circle-radius': [
                        'case',
                        ['get', 'isSelected'],
                        12, // Larger radius for selected
                        10, // Regular radius
                      ],
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      'circle-color': colorMatchExpression as any, // Use dynamic color mapping based on layerId per POI
                      'circle-stroke-width': 2,
                      'circle-stroke-color': '#ffffff',
                      'circle-opacity': [
                        'case',
                        ['get', 'isSelected'],
                        0.8, // Selected POI opacity
                        1.0, // Regular POI opacity
                      ],
                    }}
                  />
                  <Layer
                    id="poi-labels"
                    type="symbol"
                    minzoom={12}
                    layout={{
                      'text-field': ['get', 'name'],
                      'text-size': 12,
                      'text-offset': [0, 1.5],
                      'text-anchor': 'top',
                      'text-optional': true,
                      'symbol-placement': 'point',
                      'text-allow-overlap': false,
                      'text-ignore-placement': false,
                    }}
                    paint={{
                      'text-color': '#333333',
                      'text-halo-color': '#ffffff',
                      'text-halo-width': 2,
                    }}
                  />
                </Source>
              );
            })()}

          {/* PMTiles Vector Tile POI Layers */}
          {config.poiDisplayEnabled &&
            (config.poiSources || [])
              .filter((source) => source.type === 'pmtiles')
              .map((source) => {
                const layer = poiLayers.find((l) => l.id === source.id);
                if (!layer?.enabled) return null;
                const pmtilesUrl = source.apiUrl.startsWith('pmtiles://')
                  ? source.apiUrl
                  : `pmtiles://${source.apiUrl}`;
                return (
                  <Source
                    key={`pmtiles-source-${source.id}`}
                    id={`pmtiles-source-${source.id}`}
                    type="vector"
                    url={pmtilesUrl}
                  >
                    <Layer
                      id={`pmtiles-circle-${source.id}`}
                      type="circle"
                      source-layer={source.sourceLayer}
                      minzoom={config.poiMinZoom ?? 10}
                      paint={{
                        'circle-radius': 10,
                        'circle-color': source.color ?? '#999999',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff',
                        'circle-opacity': 1.0,
                      }}
                    />
                    <Layer
                      id={`pmtiles-label-${source.id}`}
                      type="symbol"
                      source-layer={source.sourceLayer}
                      minzoom={12}
                      layout={{
                        'text-field': ['get', 'name'],
                        'text-size': 12,
                        'text-offset': [0, 1.5],
                        'text-anchor': 'top',
                        'text-optional': true,
                        'symbol-placement': 'point',
                        'text-allow-overlap': false,
                      }}
                      paint={{
                        'text-color': '#333333',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2,
                      }}
                    />
                  </Source>
                );
              })}

          <Marker
            longitude={longitude}
            latitude={latitude}
            color="#4945ff" /* primary600 */
            draggable
            onDragEnd={handleMainMarkerDragEnd}
          />
        </Map>
      </Flex>

      <Grid.Root gap={2} marginTop={1}>
        {/* Row 1: Name (half) + Longitude (quarter) + Latitude (quarter) */}
        <Grid.Item col={6} direction="column" alignItems="stretch">
          <Field.Root>
            <Field.Label>
              {formatMessage({ id: getTranslation('fields.name'), defaultMessage: 'Name' })}
            </Field.Label>
            <Field.Input name="place_name" value={locationName} placeholder="—" disabled />
          </Field.Root>
        </Grid.Item>
        <Grid.Item col={3} direction="column" alignItems="stretch">
          <Field.Root>
            <Field.Label>
              {formatMessage({
                id: getTranslation('fields.longitude'),
                defaultMessage: 'Longitude',
              })}
            </Field.Label>
            <Field.Input name="longitude" value={longitude} disabled />
          </Field.Root>
        </Grid.Item>
        <Grid.Item col={3} direction="column" alignItems="stretch">
          <Field.Root>
            <Field.Label>
              {formatMessage({ id: getTranslation('fields.latitude'), defaultMessage: 'Latitude' })}
            </Field.Label>
            <Field.Input name="latitude" value={latitude} disabled />
          </Field.Root>
        </Grid.Item>

        {/* Row 2: Address, full width */}
        <Grid.Item col={12} direction="column" alignItems="stretch">
          <Field.Root>
            <Field.Label>
              {formatMessage({ id: getTranslation('fields.address'), defaultMessage: 'Address' })}
            </Field.Label>
            <Field.Input name="address" value={address} placeholder="—" disabled />
          </Field.Root>
        </Grid.Item>
      </Grid.Root>
    </Flex>
  );
};

export default MapField;
