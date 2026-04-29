import React, { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

export interface LayerConfig {
  id: string;
  name: string;
  enabled: boolean;
  color?: string; // Color for the layer indicator
  sourceType?: string; // Source type (e.g. 'geojson', 'pmtiles')
}

interface LayerControlProps {
  mapRef: React.RefObject<MapRef>;
  layers: LayerConfig[];
  onLayerToggle: (layerId: string, enabled: boolean) => void;
}

/**
 * MapLibre native layer control implementation
 * Follows MapLibre GL JS IControl interface standard
 */
class LayerControlImpl implements IControl {
  private _isPanelOpen = false;
  private _panel?: HTMLDivElement;
  private _listContainer?: HTMLDivElement;
  private _outsideClickHandler?: (e: MouseEvent) => void;

  constructor(
    private _layers: LayerConfig[],
    private _onToggle: (layerId: string, enabled: boolean) => void,
    private _map?: MapLibreMap,
    private _container?: HTMLDivElement
  ) {}

  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this._container.style.padding = '0';

    // Create toggle button (once)
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'maplibregl-ctrl-icon';
    button.title = 'Toggle Layers';
    button.setAttribute('aria-label', 'Toggle Layers');
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    `;
    button.style.width = '29px';
    button.style.height = '29px';
    button.style.cursor = 'pointer';
    button.style.border = 'none';
    button.style.padding = '0';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';

    // Create panel (once)
    this._panel = document.createElement('div');
    this._panel.className = 'maplibregl-ctrl-layers-panel';
    this._panel.style.display = 'none';
    this._panel.style.position = 'absolute';
    this._panel.style.top = '0';
    this._panel.style.right = '40px';
    this._panel.style.background = 'white';
    this._panel.style.borderRadius = '4px';
    this._panel.style.boxShadow = '0 0 0 2px rgba(0, 0, 0, 0.1)';
    this._panel.style.padding = '8px';
    this._panel.style.minWidth = '180px';
    this._panel.style.maxHeight = '300px';
    this._panel.style.overflowY = 'auto';

    // Add title (once)
    const title = document.createElement('div');
    title.textContent = 'POI Layers';
    title.style.fontSize = '12px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.style.color = '#333';
    title.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    this._panel.appendChild(title);

    // Container for layer list items (updated on each render)
    this._listContainer = document.createElement('div');
    this._panel.appendChild(this._listContainer);

    // Toggle button handler (once)
    button.addEventListener('click', () => {
      this._isPanelOpen = !this._isPanelOpen;
      this._panel!.style.display = this._isPanelOpen ? 'block' : 'none';
    });

    // Outside click handler using mousedown (fires before click, more reliable)
    // Uses contains() instead of stopPropagation — avoids interference with inner clicks
    this._outsideClickHandler = (e: MouseEvent) => {
      if (this._isPanelOpen && this._container && !this._container.contains(e.target as Node)) {
        this._isPanelOpen = false;
        this._panel!.style.display = 'none';
      }
    };
    document.addEventListener('mousedown', this._outsideClickHandler);

    this._container.appendChild(button);
    this._container.appendChild(this._panel);

    this._renderList();

    return this._container;
  }

  onRemove(): void {
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
    }
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }

  private _renderList(): void {
    if (!this._listContainer) return;

    // Only rebuild the layer list items, not the whole panel
    this._listContainer.innerHTML = '';

    this._layers.forEach((layer) => {
      const layerItem = document.createElement('div');
      layerItem.style.display = 'flex';
      layerItem.style.alignItems = 'center';
      layerItem.style.padding = '4px 0';
      layerItem.style.cursor = 'pointer';
      layerItem.style.fontSize = '12px';
      layerItem.style.color = '#333';
      layerItem.style.fontFamily = 'system-ui, -apple-system, sans-serif';

      const circle = document.createElement('div');
      circle.style.width = '12px';
      circle.style.height = '12px';
      circle.style.borderRadius = '50%';
      circle.style.marginRight = '8px';
      circle.style.cursor = 'pointer';
      circle.style.flexShrink = '0';
      circle.style.transition = 'all 0.2s ease';

      if (layer.enabled && layer.color) {
        circle.style.backgroundColor = layer.color;
        circle.style.border = 'none';
      } else {
        circle.style.backgroundColor = 'transparent';
        circle.style.border = '2px solid #999';
      }

      layerItem.addEventListener('click', () => {
        this._onToggle(layer.id, !layer.enabled);
      });

      const labelText = document.createElement('span');
      labelText.textContent = layer.name;
      labelText.style.userSelect = 'none';
      labelText.style.flex = '1';

      layerItem.appendChild(circle);
      layerItem.appendChild(labelText);

      if (layer.sourceType) {
        const typeLabel = document.createElement('span');
        typeLabel.textContent = layer.sourceType.toUpperCase();
        typeLabel.style.letterSpacing = '1.2px';
        typeLabel.style.userSelect = 'none';
        typeLabel.style.color = '#999';
        typeLabel.style.marginLeft = '8px';
        typeLabel.style.fontSize = '9px';
        typeLabel.style.flexShrink = '0';
        layerItem.appendChild(typeLabel);
      }

      this._listContainer!.appendChild(layerItem);
    });
  }

  /**
   * Update layers (e.g., when toggled externally)
   */
  updateLayers(layers: LayerConfig[]): void {
    this._layers = layers;
    this._renderList();
  }
}

/**
 * React wrapper for MapLibre Layer Control
 */
const LayerControl: React.FC<LayerControlProps> = ({ mapRef, layers, onLayerToggle }) => {
  const controlRef = useRef<LayerControlImpl | null>(null);

  useEffect(() => {
    if (!mapRef.current || layers.length === 0) return;

    const map = mapRef.current.getMap();

    // Create and add control
    const control = new LayerControlImpl(layers, onLayerToggle);
    controlRef.current = control;

    map.addControl(control, 'top-right');

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
  }, [mapRef, onLayerToggle]); // Don't include layers to avoid recreation

  // Update control when layers change
  useEffect(() => {
    if (controlRef.current) {
      controlRef.current.updateLayers(layers);
    }
  }, [layers]);

  return null;
};

export default LayerControl;
