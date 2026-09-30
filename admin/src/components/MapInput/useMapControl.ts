import { useEffect, useRef } from 'react';
import type { ControlPosition, IControl, Map as MapLibreMap } from 'maplibre-gl';

/**
 * Adds a control to the map while the component is mounted, and removes it on unmount.
 *
 * `create` runs again, and the control is swapped for a fresh one, whenever `deps` change. Updates
 * that should not rebuild the control go through the returned ref instead.
 *
 * Several calls in one component add their controls in call order, which is the only ordering
 * MapLibre offers within a corner.
 */
export const useMapControl = <T extends IControl>(
  map: MapLibreMap | null,
  create: () => T,
  position: ControlPosition,
  deps: React.DependencyList = []
): React.MutableRefObject<T | null> => {
  const controlRef = useRef<T | null>(null);

  useEffect(() => {
    if (!map) return;

    const control = create();
    map.addControl(control, position);
    controlRef.current = control;

    return () => {
      // On unmount the map itself may already be gone: `map.remove()` calls every control's
      // `onRemove`, and `removeControl` would call it a second time.
      if (map.hasControl(control)) map.removeControl(control);
      controlRef.current = null;
    };
    // `create` is a fresh closure every render; `deps` is what decides when it is called again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, position, ...deps]);

  return controlRef;
};
