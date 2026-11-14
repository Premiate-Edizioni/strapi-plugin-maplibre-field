/**
 * @vitest-environment node
 */
import { defaultsDeep } from 'lodash';
import { describe, expect, test } from 'vitest';
import pluginConfig from '../../server/src/config';

/**
 * What @strapi/core's plugin loader does at boot (`applyUserConfig`): the app's config is merged
 * over `config.default` with lodash's `defaultsDeep`, then handed to `config.validator`. So
 * `config.default` must hold plain values, and the validator sees the merged result.
 */
const loadConfig = (userConfig: Record<string, unknown>) => {
  const config = defaultsDeep({}, userConfig, pluginConfig.default);
  pluginConfig.validator(config);
  return config;
};

const style = (id: string, isDefault?: boolean) => ({
  id,
  name: id,
  url: `https://tiles.example.com/${id}.json`,
  ...(isDefault === undefined ? {} : { isDefault }),
});

describe('plugin config as loaded by Strapi', () => {
  test('an app with no config boots', () => {
    expect(() => loadConfig({})).not.toThrow();
  });

  test('an app that sets only mapStyles boots', () => {
    expect(() => loadConfig({ mapStyles: [style('osm')] })).not.toThrow();
  });

  test('an omitted option gets its default value', () => {
    expect(loadConfig({}).nominatimUrl).toBe('https://nominatim.openstreetmap.org');
  });

  test('an omitted boolean option gets a boolean', () => {
    expect(loadConfig({}).useFullscreenPseudo).toBe(true);
  });

  test('a value set by the app wins over the default', () => {
    expect(loadConfig({ poiMinZoom: 14 }).poiMinZoom).toBe(14);
  });

  test("the app's mapStyles do not inherit properties from a default style", () => {
    const { mapStyles } = loadConfig({ mapStyles: [style('satellite'), style('osm', true)] });
    expect(mapStyles).toEqual([style('satellite'), style('osm', true)]);
  });

  test("the app's defaultCenter is kept as given", () => {
    expect(loadConfig({ defaultCenter: [9.19, 45.46] }).defaultCenter).toEqual([9.19, 45.46]);
  });

  test('an invalid value set by the app is still rejected', () => {
    expect(() => loadConfig({ defaultZoom: 30 })).toThrow(/defaultZoom/);
  });

  test('an empty mapStyles set by the app is still rejected', () => {
    expect(() => loadConfig({ mapStyles: [] })).toThrow(/at least one style/);
  });
});
