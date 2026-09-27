import type { AddLayerObject, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { POISource } from '../../../../server/src/types/config';
import type { POI } from '../../services/poi-service';
import type { LayerConfig } from './layer-control';

/**
 * The sources and layers the field draws on top of the basemap.
 *
 * They are added imperatively, and `setStyle` throws away everything the new style does not
 * declare, so `syncPoiLayers` is written to be run again at any time: after every style load and
 * after every change to what should be shown. It adds what is missing, updates what is there and
 * removes what should no longer be.
 */

export const POI_SOURCE_ID = 'poi-markers';
export const POI_CIRCLE_LAYER_ID = 'poi-circles';
const POI_LABEL_LAYER_ID = 'poi-labels';

export const PMTILES_CIRCLE_PREFIX = 'pmtiles-circle-';
const pmtilesSourceId = (id: string) => `pmtiles-source-${id}`;
export const pmtilesCircleLayerId = (id: string) => `${PMTILES_CIRCLE_PREFIX}${id}`;
const pmtilesLabelLayerId = (id: string) => `pmtiles-label-${id}`;

/** Shown for POIs whose layer has no configured colour. */
const FALLBACK_COLOR = '#999999';
/** Drawing more than this many GeoJSON POIs at once is noise, not information. */
const MAX_DRAWN_POIS = 100;
const LABEL_MIN_ZOOM = 12;

type CircleColor = NonNullable<
  Extract<AddLayerObject, { type: 'circle' }>['paint']
>['circle-color'];

/**
 * MapLibre match expression colouring each GeoJSON POI by the layer it came from:
 * `['match', ['get', 'layerId'], 'layer1', 'color1', …, fallback]`.
 */
export const buildColorMatchExpression = (layers: LayerConfig[]): CircleColor => {
  const branches = layers.flatMap((layer) => (layer.color ? [layer.id, layer.color] : []));
  // A match with no branches is invalid; with nothing to match on, every POI takes the fallback.
  if (branches.length === 0) return FALLBACK_COLOR;
  // The spec types `match` as fixed-length tuples, which a branch count known only at runtime
  // cannot satisfy, although the expression is valid.
  return ['match', ['get', 'layerId'], ...branches, FALLBACK_COLOR] as unknown as CircleColor;
};

export const buildPoiFeatureCollection = (
  pois: POI[],
  selectedPOI: POI | null
): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: 'FeatureCollection',
  features: pois.slice(0, MAX_DRAWN_POIS).map((poi) => ({
    type: 'Feature',
    id: poi.id,
    geometry: { type: 'Point', coordinates: poi.coordinates },
    properties: {
      name: poi.name || 'Unknown',
      type: poi.type || 'poi',
      source: poi.source,
      layerId: poi.layerId || '', // for the colour match
      isSelected: selectedPOI?.id === poi.id,
    },
  })),
});

const poiCircleLayer = (colorExpression: CircleColor): AddLayerObject => ({
  id: POI_CIRCLE_LAYER_ID,
  type: 'circle',
  source: POI_SOURCE_ID,
  paint: {
    'circle-radius': ['case', ['get', 'isSelected'], 12, 10],
    'circle-color': colorExpression,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
    'circle-opacity': ['case', ['get', 'isSelected'], 0.8, 1.0],
  },
});

const pmtilesCircleLayer = (source: POISource, minzoom: number): AddLayerObject => ({
  id: pmtilesCircleLayerId(source.id),
  type: 'circle',
  source: pmtilesSourceId(source.id),
  'source-layer': source.sourceLayer ?? '',
  minzoom,
  paint: {
    'circle-radius': 10,
    'circle-color': source.color ?? FALLBACK_COLOR,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
    'circle-opacity': 1.0,
  },
});

// Labels share the look of the circles' white stroke: dark text on a white halo, readable over any
// basemap. Same reasoning as the rest of the map chrome — see layer-control.tsx.
const labelLayer = (id: string, source: string, sourceLayer?: string): AddLayerObject => ({
  id,
  type: 'symbol',
  source,
  ...(sourceLayer !== undefined && { 'source-layer': sourceLayer }),
  minzoom: LABEL_MIN_ZOOM,
  layout: {
    'text-field': ['get', 'name'],
    'text-size': 12,
    'text-offset': [0, 1.5],
    'text-anchor': 'top',
    'text-optional': true,
    'symbol-placement': 'point',
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#333333',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
  },
});

const pmtilesUrl = (apiUrl: string) =>
  apiUrl.startsWith('pmtiles://') ? apiUrl : `pmtiles://${apiUrl}`;

const removeLayersAndSource = (map: MapLibreMap, layerIds: string[], sourceId: string) => {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);
};

export interface PoiLayersState {
  /** GeoJSON POIs to draw, or null to draw none. */
  geojson: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  colorExpression: CircleColor;
  /** Every configured PMTiles source, with whether it should currently be drawn. */
  pmtiles: { source: POISource; enabled: boolean }[];
  pmtilesMinZoom: number;
}

export const syncPoiLayers = (map: MapLibreMap, state: PoiLayersState): void => {
  if (state.geojson) {
    const existing = map.getSource(POI_SOURCE_ID) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(state.geojson);
      map.setPaintProperty(POI_CIRCLE_LAYER_ID, 'circle-color', state.colorExpression);
    } else {
      map.addSource(POI_SOURCE_ID, { type: 'geojson', data: state.geojson });
      map.addLayer(poiCircleLayer(state.colorExpression));
      map.addLayer(labelLayer(POI_LABEL_LAYER_ID, POI_SOURCE_ID));
    }
  } else {
    removeLayersAndSource(map, [POI_CIRCLE_LAYER_ID, POI_LABEL_LAYER_ID], POI_SOURCE_ID);
  }

  for (const { source, enabled } of state.pmtiles) {
    const sourceId = pmtilesSourceId(source.id);
    const circleId = pmtilesCircleLayerId(source.id);
    const labelId = pmtilesLabelLayerId(source.id);

    if (!enabled) {
      removeLayersAndSource(map, [circleId, labelId], sourceId);
      continue;
    }
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'vector', url: pmtilesUrl(source.apiUrl) });
    }
    if (!map.getLayer(circleId)) {
      map.addLayer(pmtilesCircleLayer(source, state.pmtilesMinZoom));
    }
    if (!map.getLayer(labelId)) {
      map.addLayer(labelLayer(labelId, sourceId, source.sourceLayer ?? ''));
    }
  }
};
