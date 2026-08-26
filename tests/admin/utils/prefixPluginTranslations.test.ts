import { describe, expect, test } from 'vitest';
import { prefixPluginTranslations } from '../../../admin/src/utils/prefixPluginTranslations';
import pluginId from '../../../admin/src/utils/pluginId';
import en from '../../../admin/src/translations/en.json';
import de from '../../../admin/src/translations/de.json';
import es from '../../../admin/src/translations/es.json';
import fr from '../../../admin/src/translations/fr.json';
import it from '../../../admin/src/translations/it.json';

const DESCRIPTION_KEY = `global.plugins.${pluginId}.description`;

describe('prefixPluginTranslations', () => {
  test('prefixes plugin keys with the plugin id', () => {
    expect(prefixPluginTranslations({ label: 'Map' }, pluginId)).toEqual({
      [`${pluginId}.label`]: 'Map',
    });
  });

  test('leaves admin global keys unprefixed', () => {
    const trad = { [DESCRIPTION_KEY]: 'Add a location field' };

    expect(prefixPluginTranslations(trad, pluginId)).toEqual(trad);
  });

  test('throws without a plugin id', () => {
    expect(() => prefixPluginTranslations({}, '')).toThrow(TypeError);
  });
});

describe('translations', () => {
  const locales = { en, de, es, fr, it };

  Object.entries(locales).forEach(([locale, trad]) => {
    test(`${locale} describes the plugin on the Settings > Plugins page`, () => {
      expect(prefixPluginTranslations(trad, pluginId)).toHaveProperty(DESCRIPTION_KEY);
    });
  });
});
