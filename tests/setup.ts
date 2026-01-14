import '@testing-library/jest-dom';

// Mock window.maplibregl
(global as any).window = {
  ...global.window,
  maplibregl: {},
};

// Mock @strapi/strapi/admin module to prevent TypeScript errors
jest.mock('@strapi/strapi/admin', () => ({
  useStrapiApp: jest.fn(),
}), { virtual: true });
