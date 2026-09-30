import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useMaplibreMap } from '../../../admin/src/components/MapInput/useMaplibreMap';

const { mockMap } = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {};
  return {
    mockMap: {
      handlers,
      on: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      off: vi.fn(),
      setStyle: vi.fn(),
      remove: vi.fn(),
    },
  };
});

vi.mock('maplibre-gl', () => ({
  Map: vi.fn(function () {
    return mockMap;
  }),
}));

let latest: ReturnType<typeof useMaplibreMap>;

const Harness = ({ styleUrl }: { styleUrl: string }) => {
  latest = useMaplibreMap({ styleUrl, center: [10, 45], zoom: 5 });
  return <div ref={latest.containerRef} />;
};

describe('useMaplibreMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('reports the style as loaded only once MapLibre says so', () => {
    render(<Harness styleUrl="https://styles.test/a.json" />);
    expect(latest.map).toBe(mockMap);
    expect(latest.isStyleLoaded).toBe(false);

    act(() => mockMap.handlers['style.load']());
    expect(latest.isStyleLoaded).toBe(true);
  });

  test('swaps the style without diffing, so that style.load fires again', () => {
    const { rerender } = render(<Harness styleUrl="https://styles.test/a.json" />);
    act(() => mockMap.handlers['style.load']());

    rerender(<Harness styleUrl="https://styles.test/b.json" />);
    // A diffed swap drops our layers all the same but never fires style.load, so nothing would
    // ever put them back.
    expect(mockMap.setStyle).toHaveBeenCalledWith('https://styles.test/b.json', { diff: false });
    expect(latest.isStyleLoaded).toBe(false);

    act(() => mockMap.handlers['style.load']());
    expect(latest.isStyleLoaded).toBe(true);
  });

  test('does not reload the style it opened with', () => {
    const { rerender } = render(<Harness styleUrl="https://styles.test/a.json" />);
    rerender(<Harness styleUrl="https://styles.test/a.json" />);
    expect(mockMap.setStyle).not.toHaveBeenCalled();
  });

  test('removes the map on unmount', () => {
    const { unmount } = render(<Harness styleUrl="https://styles.test/a.json" />);
    unmount();
    expect(mockMap.remove).toHaveBeenCalledTimes(1);
  });
});
