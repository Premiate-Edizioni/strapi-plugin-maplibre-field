import pluginPkg from '../../package.json';
import pluginId from './utils/pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';
import mutateEditViewHook from './mutations/mutateEditViewHook';
import { prefixPluginTranslations } from './utils/prefixPluginTranslations';

const name = pluginPkg.strapi.name;

// Strapi admin app interface for plugin registration
interface StrapiApp {
  customFields: {
    register: (config: Record<string, unknown>) => void;
  };
  registerPlugin: (config: Record<string, unknown>) => void;
  registerHook: (name: string, hook: unknown) => void;
}

export default {
  register(app: StrapiApp) {
    // Configuration is fetched dynamically in usePluginConfig hook via API
    app.customFields.register({
      name: 'map',
      pluginId: pluginId,
      type: 'json',
      intlLabel: {
        id: 'maplibre-field.label',
        defaultMessage: 'Map',
      },
      intlDescription: {
        id: 'maplibre-field.description',
        defaultMessage: 'A map custom field using MapLibre',
      },
      icon: PluginIcon,
      components: {
        Input: async () =>
          import(/* webpackChunkName: "input-component" */ './components/MapInput'),
      },
      options: {
        advanced: [
          {
            sectionTitle: null,
            items: [
              {
                name: 'options.pluginOptions.i18n.localized',
                type: 'checkbox',
                intlLabel: {
                  id: 'maplibre-field.i18n.localized.label',
                  defaultMessage: 'Enable localization for this field',
                },
                description: {
                  id: 'maplibre-field.i18n.localized.description',
                  defaultMessage: 'The field can have different values in each language',
                },
                defaultValue: false,
              },
            ],
          },
        ],
      },
    });

    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: false,
      name,
    });
  },

  bootstrap(app: StrapiApp) {
    app.registerHook('Admin/CM/pages/EditView/mutate-edit-view-layout', mutateEditViewHook);
  },

  async registerTrads({ locales }: { locales: string[] }) {
    const importedTrads = await Promise.all(
      locales.map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, pluginId),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      })
    );

    return Promise.resolve(importedTrads);
  },
};
