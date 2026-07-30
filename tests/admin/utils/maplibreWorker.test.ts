import adminRoutes from '../../../server/src/routes/admin';

// Version is per-test: the worker setup only applies from maplibre-gl v6 onwards.
let mockVersion = '6.0.0';
const mockSetWorkerUrl = jest.fn();

jest.mock('maplibre-gl', () => ({
  getVersion: () => mockVersion,
  setWorkerUrl: (url: string) => mockSetWorkerUrl(url),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadModule = () => require('../../../admin/src/utils/maplibreWorker');

describe('configureMaplibreWorker', () => {
  beforeEach(() => {
    mockSetWorkerUrl.mockClear();
    delete (globalThis as { strapi?: unknown }).strapi;
  });

  test('points maplibre-gl v6 at the plugin worker route', () => {
    mockVersion = '6.0.0';
    (globalThis as { strapi?: unknown }).strapi = { backendURL: 'https://cms.example.com' };

    const { configureMaplibreWorker } = loadModule();
    configureMaplibreWorker();

    expect(mockSetWorkerUrl).toHaveBeenCalledWith(
      'https://cms.example.com/maplibre-field/worker/maplibre-gl-worker.mjs'
    );
  });

  test('falls back to a root-relative URL when backendURL is unavailable', () => {
    mockVersion = '6.0.0';

    const { configureMaplibreWorker } = loadModule();
    configureMaplibreWorker();

    expect(mockSetWorkerUrl).toHaveBeenCalledWith('/maplibre-field/worker/maplibre-gl-worker.mjs');
  });

  test('never loads the worker from a third-party origin', () => {
    mockVersion = '6.0.0';
    (globalThis as { strapi?: unknown }).strapi = { backendURL: 'https://cms.example.com' };

    const { configureMaplibreWorker } = loadModule();
    configureMaplibreWorker();

    const [url] = mockSetWorkerUrl.mock.calls[0];
    expect(url).not.toMatch(/cdn\.|unpkg|jsdelivr/);
  });

  test('leaves maplibre-gl v5 to bootstrap its own worker', () => {
    mockVersion = '5.24.0';

    const { configureMaplibreWorker } = loadModule();
    configureMaplibreWorker();

    expect(mockSetWorkerUrl).not.toHaveBeenCalled();
  });
});

describe('worker URL and server route', () => {
  test('the admin URL matches the route the server actually exposes', () => {
    const { WORKER_PATH, WORKER_FILE } = loadModule();
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
