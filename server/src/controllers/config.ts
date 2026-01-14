import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getConfig(ctx: any) {
    // Get the processed plugin configuration
    const config = strapi.config.get('plugin::maplibre-field');
    console.log('[MapLibre Controller] Returning config:', JSON.stringify(config, null, 2));
    ctx.body = config;
  },
});
