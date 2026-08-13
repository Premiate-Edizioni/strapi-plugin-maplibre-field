import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * @strapi/design-system and its @strapi/ui-primitives dependency declare `"type": "module"` but
 * point `main` at a CJS bundle named `.js`, which Node refuses to load. Neither package has an
 * `exports` map, so resolution has to be pointed at the ESM build explicitly.
 */
const esmBuild = (pkg: string) =>
  fileURLToPath(new URL(`./node_modules/${pkg}/dist/index.mjs`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@strapi/design-system': esmBuild('@strapi/design-system'),
      '@strapi/ui-primitives': esmBuild('@strapi/ui-primitives'),
    },
  },
  test: {
    globals: true,
    // Admin components need a DOM; server tests opt into node with a `@vitest-environment` docblock.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts?(x)'],
    // CSS imports (maplibre-gl.css) resolve to an empty module, so no style stub is needed.
    css: false,
    server: {
      deps: {
        // Those same ESM bundles named-import from CJS packages (lodash), which Node rejects.
        // Inlining routes them through Vite, whose interop handles it.
        inline: [/@strapi[\\/](design-system|ui-primitives)[\\/]/],
      },
    },
  },
});
