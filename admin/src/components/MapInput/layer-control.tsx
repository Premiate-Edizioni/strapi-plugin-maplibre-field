import React, { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

export interface LayerConfig {
  id: string;
  name: string;
  enabled: boolean;
  color?: string; // Color for the layer indicator
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
  private _map: MapLibreMap | undefined;
  private _container: HTMLDivElement | undefined;
  private _layers: LayerConfig[];
  private _onToggle: (layerId: string, enabled: boolean) => void;

  constructor(layers: LayerConfig[], onToggle: (layerId: string, enabled: boolean) => void) {
    this._layers = layers;
    this._onToggle = onToggle;
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this._container.style.padding = '0';

    this._render();

    return this._container;
  }

  onRemove(): void {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }

  private _render(): void {
    if (!this._container) return;

    // Clear existing content
    this._container.innerHTML = '';

    // Create toggle button
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

    // Create layer panel (hidden by default)
    const panel = document.createElement('div');
    panel.className = 'maplibregl-ctrl-layers-panel';
    panel.style.display = 'none';
    panel.style.position = 'absolute';
    panel.style.top = '0';
    panel.style.right = '40px';
    panel.style.background = 'white';
    panel.style.borderRadius = '4px';
    panel.style.boxShadow = '0 0 0 2px rgba(0, 0, 0, 0.1)';
    panel.style.padding = '8px';
    panel.style.minWidth = '180px';
    panel.style.maxHeight = '300px';
    panel.style.overflowY = 'auto';

    // Add title
    const title = document.createElement('div');
    title.textContent = 'POI Layers';
    title.style.fontSize = '12px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.style.color = '#333';
    title.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    panel.appendChild(title);

    // Add layer items with custom circle indicators
    this._layers.forEach((layer) => {
      const layerItem = document.createElement('div');
      layerItem.style.display = 'flex';
      layerItem.style.alignItems = 'center';
      layerItem.style.padding = '4px 0';
      layerItem.style.cursor = 'pointer';
      layerItem.style.fontSize = '12px';
      layerItem.style.color = '#333';
      layerItem.style.fontFamily = 'system-ui, -apple-system, sans-serif';

      // Create custom circle indicator
      const circle = document.createElement('div');
      circle.style.width = '12px';
      circle.style.height = '12px';
      circle.style.borderRadius = '50%';
      circle.style.marginRight = '8px';
      circle.style.cursor = 'pointer';
      circle.style.flexShrink = '0';
      circle.style.transition = 'all 0.2s ease';

      // Set circle style based on enabled state
      if (layer.enabled && layer.color) {
        // Enabled: filled circle with layer color, no border
        circle.style.backgroundColor = layer.color;
        circle.style.border = 'none';
      } else {
        // Disabled: empty circle with gray outline
        circle.style.backgroundColor = 'transparent';
        circle.style.border = '2px solid #999';
      }

      // Toggle functionality
      layerItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onToggle(layer.id, !layer.enabled);
      });

      const labelText = document.createElement('span');
      labelText.textContent = layer.name;
      labelText.style.userSelect = 'none';

      layerItem.appendChild(circle);
      layerItem.appendChild(labelText);
      panel.appendChild(layerItem);
    });

    // Toggle panel visibility
    let isPanelOpen = false;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      isPanelOpen = !isPanelOpen;
      panel.style.display = isPanelOpen ? 'block' : 'none';
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (isPanelOpen && this._container && !this._container.contains(e.target as Node)) {
        isPanelOpen = false;
        panel.style.display = 'none';
      }
    });

    this._container.appendChild(button);
    this._container.appendChild(panel);
  }

  /**
   * Update layers (e.g., when toggled externally)
   */
  updateLayers(layers: LayerConfig[]): void {
    this._layers = layers;
    this._render();
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
