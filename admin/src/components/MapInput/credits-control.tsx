import React, { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

interface CreditsControlProps {
  mapRef: React.RefObject<MapRef>;
}

/**
 * MapLibre native credits control implementation
 * Follows MapLibre GL JS IControl interface standard
 * Displays an info icon that opens a panel with map credits and attributions
 */
class CreditsControlImpl implements IControl {
  private _map: MapLibreMap | undefined;
  private _container: HTMLDivElement | undefined;

  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact';

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

    // Create info button (using MapLibre attribution control style)
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'maplibregl-ctrl-attrib-button';
    button.title = 'Toggle attribution';
    button.setAttribute('aria-label', 'Toggle attribution');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-pressed', 'false');

    // Create credits panel (compact single line, hidden by default)
    const panel = document.createElement('div');
    panel.className = 'maplibregl-ctrl-attrib maplibregl-compact';
    panel.style.display = 'none';
    panel.style.background = 'rgba(255, 255, 255, 0.5)';
    panel.style.fontSize = '11px';
    panel.style.padding = '0 5px';
    panel.style.margin = '0';
    panel.style.lineHeight = '20px';
    panel.style.color = 'rgba(0, 0, 0, 0.75)';

    // Add credits content on a single line
    const content = document.createElement('div');
    content.innerHTML = `
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> |
      <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a> | SkateMap
    `;

    // Style links
    content.querySelectorAll('a').forEach((link) => {
      (link as HTMLAnchorElement).style.color = 'rgba(0, 0, 0, 0.75)';
      (link as HTMLAnchorElement).style.textDecoration = 'none';
    });

    panel.appendChild(content);

    // Toggle panel visibility
    let isPanelOpen = false;
    const togglePanel = (open: boolean) => {
      isPanelOpen = open;
      panel.style.display = isPanelOpen ? 'block' : 'none';
      button.setAttribute('aria-pressed', isPanelOpen ? 'true' : 'false');
    };

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel(!isPanelOpen);
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (isPanelOpen && this._container && !this._container.contains(e.target as Node)) {
        togglePanel(false);
      }
    });

    this._container.appendChild(button);
    this._container.appendChild(panel);
  }
}

/**
 * React wrapper for MapLibre Credits Control
 */
const CreditsControl: React.FC<CreditsControlProps> = ({ mapRef }) => {
  const controlRef = useRef<CreditsControlImpl | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current.getMap();

    // Create and add control to bottom-right
    const control = new CreditsControlImpl();
    controlRef.current = control;

    map.addControl(control, 'bottom-right');

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
    };
  }, [mapRef]);

  return null;
};

export default CreditsControl;
