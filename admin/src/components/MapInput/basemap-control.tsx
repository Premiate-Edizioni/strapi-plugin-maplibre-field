import { useEffect } from 'react';
import { useControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import type { MapStyle } from '../../../../server/src/types/config';

interface BasemapControlProps {
  mapStyles: MapStyle[];
  currentStyleUrl: string;
  onStyleChange: (styleUrl: string) => void;
}

class BasemapControl implements maplibregl.IControl {
  _map: maplibregl.Map | undefined;
  _container: HTMLDivElement | undefined;
  _styles: MapStyle[];
  _currentStyleUrl: string;
  _onStyleChange: (styleUrl: string) => void;

  constructor(
    styles: MapStyle[],
    currentStyleUrl: string,
    onStyleChange: (styleUrl: string) => void
  ) {
    this._styles = styles;
    this._currentStyleUrl = currentStyleUrl;
    this._onStyleChange = onStyleChange;
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    // Style container for horizontal layout
    this._container.style.display = 'flex';
    this._container.style.flexDirection = 'row';

    // Create button for each style
    this._styles.forEach((style, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = style.name;
      button.setAttribute('aria-label', style.name);

      // Create span for text content
      const span = document.createElement('span');
      span.textContent = style.name;
      span.style.padding = '0 8px';
      button.appendChild(span);

      // Use MapLibre's native button styling
      button.className = 'maplibregl-ctrl-icon';
      button.style.width = 'auto';
      button.style.height = '29px';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';

      // Add visual indicator for active state
      if (style.url === this._currentStyleUrl) {
        button.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        button.style.fontWeight = 'bold';
      }

      // Add border between buttons (except last one)
      if (index < this._styles.length - 1) {
        button.style.borderRight = '1px solid rgba(0, 0, 0, 0.1)';
      }

      button.onclick = () => {
        // Update visual state of all buttons
        const buttons = this._container?.querySelectorAll('button');
        buttons?.forEach((btn, btnIndex) => {
          if (btnIndex === index) {
            btn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            btn.style.fontWeight = 'bold';
          } else {
            btn.style.backgroundColor = '';
            btn.style.fontWeight = '';
          }
        });

        // Trigger style change
        this._onStyleChange(style.url);
      };

      this._container!.appendChild(button);
    });

    return this._container;
  }

  onRemove(): void {
    this._container?.parentNode?.removeChild(this._container);
    this._map = undefined;
  }

  updateCurrentStyle(styleUrl: string): void {
    this._currentStyleUrl = styleUrl;
    // Update active state on buttons
    const buttons = this._container?.querySelectorAll('button');
    buttons?.forEach((button, index) => {
      const btn = button as HTMLElement;
      if (this._styles[index].url === styleUrl) {
        btn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        btn.style.fontWeight = 'bold';
      } else {
        btn.style.backgroundColor = '';
        btn.style.fontWeight = '';
      }
    });
  }
}

export default function BasemapControlComponent({
  mapStyles,
  currentStyleUrl,
  onStyleChange,
}: BasemapControlProps) {
  const controlRef = useControl(
    () => new BasemapControl(mapStyles, currentStyleUrl, onStyleChange),
    {
      position: 'bottom-left',
    }
  );

  // Update active button when currentStyleUrl changes externally
  useEffect(() => {
    if (controlRef && 'updateCurrentStyle' in controlRef) {
      (controlRef as BasemapControl).updateCurrentStyle(currentStyleUrl);
    }
  }, [currentStyleUrl, controlRef]);

  return null;
}
