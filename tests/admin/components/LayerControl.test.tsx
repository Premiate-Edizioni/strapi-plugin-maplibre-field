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
  const listeners: Record<string, () => void> = {};
  const map = {
    addControl: vi.fn((control: { onAdd: (m: unknown) => HTMLElement }) => {
      container.appendChild(control.onAdd(map));
    }),
    removeControl: vi.fn(),
    hasControl: vi.fn(() => true),
    getContainer: () => container,
    on: vi.fn((type: string, listener: () => void) => {
      listeners[type] = listener;
    }),
    off: vi.fn(),
    fire: (type: string) => listeners[type]?.(),
  };
  return map;
};

/** jsdom lays nothing out, so the boxes the panel is measured against are set by hand. */
const setBox = (element: Element, top: number, height: number) => {
  element.getBoundingClientRect = () => ({ top, height }) as DOMRect;
};

const layers: LayerConfig[] = [
  { id: 'spots', name: 'Skatespots', enabled: true, color: '#cc0000', sourceType: 'geojson' },
];

const renderControl = (locale: string, messages: Record<string, string>) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const map = mountControlOn(host);

  render(
    <IntlProvider locale={locale} messages={messages} onError={() => {}}>
      <LayerControl map={map as never} layers={layers} onLayerToggle={vi.fn()} />
    </IntlProvider>
  );

  return Object.assign(host, { map });
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

  test('opens the panel at the top of the map and no taller than it', () => {
    const host = renderControl('en', {});
    const control = host.querySelector<HTMLElement>('.maplibregl-ctrl-group')!;
    const panel = host.querySelector<HTMLElement>('.maplibregl-ctrl-layers-panel')!;
    // A 280px map whose layers button sits 185px below its top edge.
    setBox(host, 100, 280);
    setBox(control, 285, 29);

    host.querySelector('button')!.click();

    expect(panel.style.display).toBe('block');
    expect(panel.style.top).toBe('-175px');
    expect(panel.style.maxHeight).toBe('260px');
  });

  test('refits an open panel when the map is resized, as on entering fullscreen', () => {
    const host = renderControl('en', {});
    const control = host.querySelector<HTMLElement>('.maplibregl-ctrl-group')!;
    const panel = host.querySelector<HTMLElement>('.maplibregl-ctrl-layers-panel')!;
    setBox(host, 100, 280);
    setBox(control, 285, 29);
    host.querySelector('button')!.click();

    setBox(host, 0, 900);
    setBox(control, 185, 29);
    host.map.fire('resize');

    expect(panel.style.top).toBe('-175px');
    expect(panel.style.maxHeight).toBe('880px');
  });
});
