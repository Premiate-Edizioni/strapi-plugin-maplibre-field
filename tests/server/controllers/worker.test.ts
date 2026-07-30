/**
 * @jest-environment node
 */
import * as fs from 'node:fs/promises';
import createWorkerController from '../../../server/src/controllers/worker';

// Properties of built-in modules are not configurable, so spyOn cannot be used on readFile.
// The mock delegates to the real implementation unless a test overrides it.
jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual('node:fs/promises');
  return { ...actual, readFile: jest.fn(actual.readFile) };
});

const mockedReadFile = fs.readFile as unknown as jest.Mock;

const strapi = { log: { error: jest.fn() } } as never;

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

const createContext = (file: string) => ({
  params: { file },
  type: '',
  body: undefined as unknown,
  headers: {} as Record<string, string>,
  set(field: string, value: string) {
    this.headers[field] = value;
  },
  throw(status: number): never {
    throw new HttpError(status);
  },
});

const getWorker = (file: string) => {
  const ctx = createContext(file);
  return { ctx, run: () => createWorkerController({ strapi }).getWorker(ctx) };
};

describe('worker controller', () => {
  describe('serving maplibre-gl files', () => {
    test.each(['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])(
      'serves %s as JavaScript',
      async (file) => {
        const { ctx, run } = getWorker(file);
        await run();

        expect(ctx.type).toBe('text/javascript');
        expect(typeof ctx.body).toBe('string');
        expect((ctx.body as string).length).toBeGreaterThan(0);
      }
    );

    test('serves the file installed in node_modules, not a bundled copy', async () => {
      const { ctx, run } = getWorker('maplibre-gl-worker.mjs');
      await run();

      const onDisk = await fs.readFile(
        require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'),
        'utf8'
      );
      expect(ctx.body).toBe(onDisk);
    });

    test('asks clients to revalidate, since contents follow the installed version', async () => {
      const { ctx, run } = getWorker('maplibre-gl-worker.mjs');
      await run();

      expect(ctx.headers['Cache-Control']).toBe('no-cache');
    });
  });

  describe('rejecting anything else', () => {
    test.each([
      ['a path traversal attempt', '../../package.json'],
      ['an absolute path', '/etc/passwd'],
      ['another file from the same folder', 'maplibre-gl.mjs'],
      ['an empty filename', ''],
    ])('answers 404 to %s', async (_label, file) => {
      const { run } = getWorker(file);
      await expect(run()).rejects.toMatchObject({ status: 404 });
    });

    test('does not read from disk before the filename is whitelisted', async () => {
      mockedReadFile.mockClear();
      const { run } = getWorker('../../package.json');

      await expect(run()).rejects.toMatchObject({ status: 404 });
      expect(mockedReadFile).not.toHaveBeenCalled();
    });
  });

  describe('when maplibre-gl cannot be read', () => {
    test('answers 500 and logs instead of crashing', async () => {
      mockedReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));
      (strapi as unknown as { log: { error: jest.Mock } }).log.error.mockClear();

      const { run } = getWorker('maplibre-gl-worker.mjs');
      await expect(run()).rejects.toMatchObject({ status: 500 });
      expect((strapi as unknown as { log: { error: jest.Mock } }).log.error).toHaveBeenCalled();
    });
  });
});
