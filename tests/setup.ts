import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// styled-components (used by @strapi/design-system) expects React in global scope
(globalThis as unknown as { React: typeof React }).React = React;

// Mock window.maplibregl (only present in the jsdom environment)
if (typeof window !== 'undefined') {
  (window as unknown as { maplibregl: unknown }).maplibregl = {};
}

// @strapi/strapi/admin is a peer dependency of the host app and is not installed here.
vi.mock('@strapi/strapi/admin', () => ({
  useStrapiApp: vi.fn(),
}));
