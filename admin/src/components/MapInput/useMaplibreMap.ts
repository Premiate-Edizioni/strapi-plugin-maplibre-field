import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';

interface UseMaplibreMapOptions {
  styleUrl: string;
  /** Camera the map opens on. Read once, when the map is created; move it with the map's own API. */
  center: [number, number];
  zoom: number;
}

interface UseMaplibreMapResult {
  containerRef: React.RefObject<HTMLDivElement>;
  /** Null until the map exists. State rather than a ref, so effects that need the map re-run once it does. */
  map: maplibregl.Map | null;
  /**
   * Whether the current style has finished loading, so sources and layers can be added to it.
   * `setStyle` throws away every source and layer the style did not declare, and `addSource` throws
   * before the new one has loaded, so anything added on top has to wait for this and be re-added
   * each time it flips back to true.
   */
  isStyleLoaded: boolean;
}

/**
 * Owns one maplibre-gl map for the lifetime of the component.
 *
 * The camera is uncontrolled: MapLibre keeps it, and React is not re-rendered on every frame of a
 * pan or zoom. Only the style URL is a live input.
 */
export const useMaplibreMap = ({
  styleUrl,
  center,
  zoom,
}: UseMaplibreMapOptions): UseMaplibreMapResult => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [isStyleLoaded, setIsStyleLoaded] = useState(false);

  const initialRef = useRef({ styleUrl, center, zoom });
  const appliedStyleRef = useRef(styleUrl);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { styleUrl: initialStyle, center: initialCenter, zoom: initialZoom } = initialRef.current;
    const instance = new maplibregl.Map({
      container,
      style: initialStyle,
      center: initialCenter,
      zoom: initialZoom,
    });
    appliedStyleRef.current = initialStyle;

    const handleStyleLoad = () => setIsStyleLoaded(true);
    instance.on('style.load', handleStyleLoad);
    setMap(instance);

    return () => {
      instance.off('style.load', handleStyleLoad);
      instance.remove();
      setMap(null);
      setIsStyleLoaded(false);
    };
  }, []);

  useEffect(() => {
    if (!map || !styleUrl || styleUrl === appliedStyleRef.current) return;
    appliedStyleRef.current = styleUrl;
    setIsStyleLoaded(false);
    // `diff: false` rebuilds the style from scratch, which is what fires `style.load` again. A
    // diffed swap would drop our layers just the same but never say it had finished.
    map.setStyle(styleUrl, { diff: false });
  }, [map, styleUrl]);

  return { containerRef, map, isStyleLoaded };
};
