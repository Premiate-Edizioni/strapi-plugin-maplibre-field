import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

/**
 * maplibre-gl v6 is ESM-only and no longer inlines its web worker, so the admin bundle has to
 * point at a real URL. Loading it from a CDN is blocked by Strapi's default CSP
 * (`worker-src 'self' blob:`), and Vite's `?worker&url` suffix breaks `strapi develop`
 * (esbuild cannot resolve the suffix while pre-bundling the plugin).
 *
 * Serving the files from the plugin keeps the worker same-origin and — because they are read from
 * the maplibre-gl copy the app actually installed — always in sync with the bundled main thread.
 *
 * The worker imports `./maplibre-gl-shared.mjs`, so both files are served from the same path.
 */
const ALLOWED_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const resolveMaplibreFile = (file: string): string => {
  // Resolve from the Strapi app root first (hoisted install), then from this bundle (nested install).
  const bases = [path.join(process.cwd(), 'noop.js')];
  if (typeof __filename !== 'undefined') {
    bases.push(__filename);
  }

  for (const base of bases) {
    try {
      return createRequire(base).resolve(`maplibre-gl/dist/${file}`);
    } catch {
      // try the next base
    }
  }

  throw new Error(`Could not resolve maplibre-gl/dist/${file}`);
};

export interface WorkerContext {
  params: { file: string };
  type: string;
  body: unknown;
  set: (field: string, value: string) => void;
  throw: (status: number, message?: string) => never;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getWorker(ctx: WorkerContext) {
    const { file } = ctx.params;

    if (!ALLOWED_FILES.includes(file)) {
      ctx.throw(404, 'Unknown worker file');
    }

    try {
      const contents = await readFile(resolveMaplibreFile(file), 'utf8');
      ctx.type = 'text/javascript';
      // Contents follow the installed maplibre-gl version, so revalidate instead of caching hard.
      ctx.set('Cache-Control', 'no-cache');
      ctx.body = contents;
    } catch (error) {
      strapi.log.error(`[maplibre-field] Failed to serve ${file}: ${(error as Error).message}`);
      ctx.throw(500, 'Could not read maplibre-gl worker');
    }
  },
});
