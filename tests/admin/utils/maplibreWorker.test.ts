import { beforeEach, describe, expect, test, vi } from 'vitest';
import adminRoutes from '../../../server/src/routes/admin';
import {
  configureMaplibreWorker,
  WORKER_FILE,
  WORKER_PATH,
} from '../../../admin/src/utils/maplibreWorker';

const { mockSetWorkerUrl } = vi.hoisted(() => ({ mockSetWorkerUrl: vi.fn() }));

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: (url: string) => mockSetWorkerUrl(url),
}));

describe('configureMaplibreWorker', () => {
  beforeEach(() => {
    mockSetWorkerUrl.mockClear();
    delete (globalThis as { strapi?: unknown }).strapi;
  });

  test('points maplibre-gl at the plugin worker route', () => {
    (globalThis as { strapi?: unknown }).strapi = { backendURL: 'https://cms.example.com' };

    configureMaplibreWorker();

    expect(mockSetWorkerUrl).toHaveBeenCalledWith(
      'https://cms.example.com/maplibre-field/worker/maplibre-gl-worker.mjs'
    );
  });

  test('falls back to a root-relative URL when backendURL is unavailable', () => {
    configureMaplibreWorker();

    expect(mockSetWorkerUrl).toHaveBeenCalledWith('/maplibre-field/worker/maplibre-gl-worker.mjs');
  });

  test('never loads the worker from a third-party origin', () => {
    (globalThis as { strapi?: unknown }).strapi = { backendURL: 'https://cms.example.com' };

    configureMaplibreWorker();

    const [url] = mockSetWorkerUrl.mock.calls[0];
    expect(url).not.toMatch(/cdn\.|unpkg|jsdelivr/);
  });
});

describe('worker URL and server route', () => {
  test('the admin URL matches the route the server actually exposes', () => {
    const workerRoute = adminRoutes.routes.find((route) => route.handler === 'worker.getWorker');

    expect(workerRoute).toBeDefined();
    // Plugin admin routes are mounted under `/<pluginId>`, so `/maplibre-field` + `/worker/:file`
    // has to be what configureMaplibreWorker() builds.
    expect(`${WORKER_PATH}/${WORKER_FILE}`).toBe(
      `/maplibre-field${workerRoute!.path.replace(':file', WORKER_FILE)}`
    );
  });

  test('the worker route stays reachable without admin credentials', () => {
    const workerRoute = adminRoutes.routes.find((route) => route.handler === 'worker.getWorker');

    // The browser's Worker loader cannot attach a session, so requiring auth would break the map.
    expect(workerRoute!.config).toEqual({ auth: false });
  });
});
