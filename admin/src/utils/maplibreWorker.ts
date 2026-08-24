import { setWorkerUrl } from 'maplibre-gl';
import pluginId from './pluginId';

/**
 * maplibre-gl v6+ is ESM-only and no longer inlines its Web Worker, so it has to be loaded from a
 * URL. The plugin server serves it (see server/src/controllers/worker.ts), which keeps the worker
 * same-origin — satisfying Strapi's default CSP (`worker-src 'self' blob:`) with no configuration
 * in the host app — and on the same maplibre-gl version as the bundled main thread.
 */
export const WORKER_FILE = 'maplibre-gl-worker.mjs';

/** Path of the plugin route serving the worker. Must match `/worker/:file` in server/src/routes/admin.ts. */
export const WORKER_PATH = `/${pluginId}/worker`;

const getBackendURL = (): string =>
  (globalThis as { strapi?: { backendURL?: string } }).strapi?.backendURL ?? '';

export const configureMaplibreWorker = (): void => {
  setWorkerUrl(`${getBackendURL()}${WORKER_PATH}/${WORKER_FILE}`);
};
