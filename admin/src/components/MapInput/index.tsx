import React, { useState, useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import { useNotification } from '@strapi/strapi/admin';
import SearchBox from './SearchBox';
import BasemapControlComponent from './basemap-control';
import LayerControl, { LayerConfig } from './layer-control';
import CreditsControl from './credits-control';
import { Flex, Typography, Field, Grid } from '@strapi/design-system';
import Map, {
  FullscreenControl,
  GeolocateControl,
  Marker,
  NavigationControl,
  Source,
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import getTranslation from '../../utils/getTrad';
import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';

// User-Agent for Nominatim API compliance (update version on plugin release)
const USER_AGENT = 'strapi-plugin-maplibre-field/1.0.0 (Strapi CMS)';
import { usePluginConfig } from '../../hooks/usePluginConfig';
import {
  POI,
  LocationFeature,
  createLocationFeature,
  queryPOIsForViewport,
  searchNearbyPOIsForSnap,
  findNearestPOI,
} from '../../services/poi-service';
import 'maplibre-gl/dist/maplibre-gl.css';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

interface MapFieldProps {
  intlLabel: {
    id: string;
    defaultMessage: string;
  };
  name: string;
  onChange: (event: { target: { name: string; value: string; type: string } }) => void;
  value: string | null;
}

const MapField: React.FC<MapFieldProps> = ({ intlLabel, name, onChange, value }) => {
  const { formatMessage } = useIntl();
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

  // Show "Null Island" when coordinates are [0, 0] and no address is defined
  const isNullIsland = initialCoordinates[0] === 0 && initialCoordinates[1] === 0;
  const initialAddress =
    result?.properties?.name || result?.properties?.address || (isNullIsland ? 'Null Island' : '');

  const [longitude, setLongitude] = useState(initialCoordinates[0]);
  const [latitude, setLatitude] = useState(initialCoordinates[1]);
  const [address, setAddress] = useState(initialAddress);

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
      setAddress(isNullIsland ? 'Null Island' : '');
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
  const handleLayerToggle = (layerId: string, enabled: boolean) => {
    setPoiLayers((prevLayers) =>
      prevLayers.map((layer) => (layer.id === layerId ? { ...layer, enabled } : layer))
    );
    // Note: updatePOIMarkers() will be triggered by the useEffect that watches poiLayers
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
                layerId: layer.id, // Pass the layer ID
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

  // Handle POI marker click
  const handlePOIClick = async (poi: POI) => {
    setSelectedPOI(poi);

    // If address is empty, try reverse geocoding
    let address = poi.address;
    if (!address || address.trim() === '') {
      try {
        const [lng, lat] = poi.coordinates;
        const nominatimUrl = config.nominatimUrl || 'https://nominatim.openstreetmap.org';
        const response = await fetch(
          `${nominatimUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
          {
            headers: {
              'User-Agent': USER_AGENT,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          address = data.display_name || '';
        }
      } catch (error) {
        console.warn('Reverse geocoding failed:', error);
      }
    }

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

    toggleNotification({
      type: 'success',
      message: poi.mapName ? `${poi.mapName} ➙ ${poi.name}` : `Selected ${poi.name}`,
    });
  };

  // Handle map click - check for POI marker clicks
  const handleMapClick = (evt: MapLayerMouseEvent) => {
    if (!mapRef.current) return;

    const map = mapRef.current.getMap();

    // Check if the POI layer exists before querying
    const poiLayer = map.getLayer('poi-circles');
    if (!poiLayer) {
      // POI layer doesn't exist (not loaded yet or disabled)
      return;
    }

    const features = map.queryRenderedFeatures(evt.point, {
      layers: ['poi-circles'],
    });

    // If clicked on a POI marker, handle POI selection
    if (features && features.length > 0) {
      const feature = features[0];

      // Find POI by name and coordinates (more reliable than ID)
      // MapLibre may not preserve the original UUID ID, so we match by properties
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
        return;
      }
    }
  };

  // Double-click handler - searches for nearby POI or saves coordinates only
  const handleMapDoubleClick = async (evt: MapLayerMouseEvent) => {
    evt.preventDefault();
    const clickCoords: [number, number] = [evt.lngLat.lng, evt.lngLat.lat];

    // Get snap radius from config (default: 5 meters)
    const snapRadius = typeof config.poiSnapRadius === 'number' ? config.poiSnapRadius : 5;

    // Try to find nearby POI within snap radius from all enabled sources
    try {
      const enabledLayers = poiLayers.filter((layer) => layer.enabled);
      const allNearbyPOIs: POI[] = [];

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
          }
        }

        if (apiUrl) {
          const pois = await searchNearbyPOIsForSnap(
            clickCoords[1], // lat
            clickCoords[0], // lng
            {
              nominatimUrl: config.nominatimUrl || 'https://nominatim.openstreetmap.org',
              customApiUrl: apiUrl,
              mapName: mapName,
              layerId: layer.id, // Pass the layer ID
              radius: snapRadius,
              categories: [],
            }
          );

          allNearbyPOIs.push(...pois);
        }
      }

      // Find the nearest POI
      const nearestPOI = findNearestPOI(clickCoords, allNearbyPOIs);

      if (nearestPOI && nearestPOI.distance !== undefined && nearestPOI.distance <= snapRadius) {
        // Found a POI within snap radius - use handlePOIClick for complete processing
        await handlePOIClick(nearestPOI);

        toggleNotification({
          type: 'success',
          message: `${nearestPOI.name} (${Math.round(nearestPOI.distance)}m)`,
        });
      } else {
        // No POI found nearby - save coordinates only as minimal GeoJSON Feature
        updateValues(
          createLocationFeature(clickCoords, {
            inputMethod: 'map_click',
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
          inputMethod: 'map_click',
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
    setAddress(feature.properties.name || feature.properties.address || '');
    setLongitude(feature.geometry.coordinates[0]);
    setLatitude(feature.geometry.coordinates[1]);
    onChange({ target: { name, value, type: 'json' } });
  };

  // Handle search result selection from SearchBox
  const handleSearchResult = (feature: LocationFeature) => {
    // Update map position
    if (feature.geometry?.coordinates) {
      const [lng, lat] = feature.geometry.coordinates;
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom: 16,
        essential: true,
      });
    }

    // Update form values - this will call onChange ONCE
    updateValues(feature);

    // Show notification
    toggleNotification({
      type: 'success',
      message: `Location set to: ${feature.properties.name || feature.properties.address}`,
    });
  };

  useEffect(() => {
    if (!isDefaultViewState && mapRef.current) {
      const map = mapRef.current.getMap();
      map?.flyTo({ center: [longitude, latitude], zoom: 15 });
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

  // Add cursor pointer on POI hover
  useEffect(() => {
    if (!mapRef.current || !config.poiDisplayEnabled) return;

    const map = mapRef.current.getMap();

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('load', () => {
      map.on('mouseenter', 'poi-circles', handleMouseEnter);
      map.on('mouseleave', 'poi-circles', handleMouseLeave);
    });

    return () => {
      map.off('mouseenter', 'poi-circles', handleMouseEnter);
      map.off('mouseleave', 'poi-circles', handleMouseLeave);
    };
  }, [config.poiDisplayEnabled]);

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
        poiSources={config.poiSources}
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
          attributionControl={false}
        >
          <FullscreenControl />
          <NavigationControl />
          <GeolocateControl />
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

          {/* Credits Control */}
          <CreditsControl mapRef={mapRef} />

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

          <Marker longitude={longitude} latitude={latitude} color="#1da1f2" />
        </Map>
      </Flex>

      <Grid.Root>
        <Grid.Item padding={1} col={8} xs={12}>
          <Field.Root>
            <Field.Label>
              {formatMessage({
                id: result?.properties?.sourceId
                  ? getTranslation('fields.poi-name')
                  : getTranslation('fields.address'),
                defaultMessage: result?.properties?.sourceId ? 'POI Name' : 'Address',
              })}
            </Field.Label>
            <Field.Input name="place_name" value={address} disabled />
          </Field.Root>
        </Grid.Item>

        <Grid.Item padding={1} col={2} xs={12}>
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
        <Grid.Item padding={1} col={2} xs={12}>
          <Field.Root>
            <Field.Label>
              {formatMessage({
                id: getTranslation('fields.latitude'),
                defaultMessage: 'Latitude',
              })}
            </Field.Label>
            <Field.Input name="latitude" value={latitude} disabled />
          </Field.Root>
        </Grid.Item>

        {result?.properties?.sourceId && result?.properties?.address && (
          <Grid.Item padding={1} col={12} xs={12}>
            <Field.Root>
              <Field.Label>
                {formatMessage({
                  id: getTranslation('fields.poi-address'),
                  defaultMessage: 'Full Address',
                })}
              </Field.Label>
              <Field.Input name="poi_address" value={result.properties.address} disabled />
            </Field.Root>
          </Grid.Item>
        )}
      </Grid.Root>
    </Flex>
  );
};

export default MapField;
