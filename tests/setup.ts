import React from 'react';
import '@testing-library/jest-dom';

// styled-components (used by @strapi/design-system) expects React in global scope
(global as any).React = React;

// Mock window.maplibregl
(global as any).window = {
  ...global.window,
  maplibregl: {},
};

// Mock @strapi/strapi/admin module to prevent TypeScript errors
jest.mock('@strapi/strapi/admin', () => ({
  useStrapiApp: jest.fn(),
}), { virtual: true });
