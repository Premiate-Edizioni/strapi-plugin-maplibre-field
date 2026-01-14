import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.customFields.register({
    name: 'map',
    plugin: 'maplibre-field',
    type: 'json',
    // Icon will be loaded from admin side via intlLabel
  });
};
