import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// styled-components (used by @strapi/design-system) expects React in global scope
(globalThis as unknown as { React: typeof React }).React = React;

// Mock window.maplibregl (only present in the jsdom environment)
if (typeof window !== 'undefined') {
  (window as unknown as { maplibregl: unknown }).maplibregl = {};
}

// jsdom implements neither observer; the design system's Combobox uses IntersectionObserver for
// its "load more" sentinel, and Radix's popper uses ResizeObserver.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

for (const name of ['IntersectionObserver', 'ResizeObserver'] as const) {
  if (!(name in globalThis)) {
    (globalThis as unknown as Record<string, unknown>)[name] = NoopObserver;
  }
}

// Radix (under the design system's Combobox) calls Pointer Capture APIs that jsdom lacks.
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
}

// @strapi/strapi/admin is a peer dependency of the host app and is not installed here.
vi.mock('@strapi/strapi/admin', () => ({
  useStrapiApp: vi.fn(),
}));
