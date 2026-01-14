import pluginPkg from '../../../package.json';

// Handle both regular and scoped package names:
// - 'strapi-plugin-maplibre-field' -> 'maplibre-field'
// - '@premiate/strapi-plugin-maplibre-field' -> 'maplibre-field'
const pluginId = pluginPkg.name.replace(/^(@[^/]+\/)?strapi-plugin-/i, '');

export default pluginId;
