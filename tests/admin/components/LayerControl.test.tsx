import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { IntlProvider } from 'react-intl';
import LayerControl, {
  type LayerConfig,
} from '../../../admin/src/components/MapInput/layer-control';

/**
 * The control is a MapLibre IControl building raw DOM, so it never renders through React: the map
 * calls `onAdd` and keeps the element. The mock map therefore does what MapLibre does — calls
 * `onAdd` and puts the result in the document — which is what makes the panel assertable.
 */
const mountControlOn = (container: HTMLElement) => {
  const map = {
    addControl: vi.fn((control: { onAdd: (m: unknown) => HTMLElement }) => {
      container.appendChild(control.onAdd(map));
    }),
    removeControl: vi.fn(),
  };
  return map;
};

const layers: LayerConfig[] = [
  { id: 'spots', name: 'Skatespots', enabled: true, color: '#cc0000', sourceType: 'geojson' },
];

const renderControl = (locale: string, messages: Record<string, string>) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const map = mountControlOn(host);
  const mapRef = { current: { getMap: () => map } } as never;

  render(
    <IntlProvider locale={locale} messages={messages} onError={() => {}}>
      <LayerControl mapRef={mapRef} layers={layers} onLayerToggle={vi.fn()} />
    </IntlProvider>
  );

  return host;
};

describe('LayerControl', () => {
  test('falls back to the English defaults when a locale has no messages', () => {
    const host = renderControl('en', {});

    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Toggle POI layers');
    expect(host.textContent).toContain('POI layers');
  });

  test('shows the panel title and the button label in the admin panel language', () => {
    const host = renderControl('it', {
      'maplibre-field.layers.title': 'Livelli POI',
      'maplibre-field.layers.toggle': 'Mostra o nascondi i livelli POI',
    });

    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Mostra o nascondi i livelli POI');
    expect(button?.title).toBe('Mostra o nascondi i livelli POI');
    expect(host.textContent).toContain('Livelli POI');
    // The layer's own name comes from the host app's config and is never translated.
    expect(host.textContent).toContain('Skatespots');
  });
});
