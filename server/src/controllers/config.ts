import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  getConfig(ctx: { body: unknown }) {
    const config = strapi.config.get('plugin::maplibre-field');
    ctx.body = config;
  },
});
