type TradOptions = Record<string, string>;

// Keys the admin looks up in its own namespace, not in the plugin's. The Settings > Plugins page
// renders each row with `global.plugins.<name>` / `global.plugins.<name>.description`, so those
// have to reach the message store unprefixed to override the package.json fallback.
const GLOBAL_KEY_PREFIX = 'global.';

export const prefixPluginTranslations = (trad: TradOptions, pluginId: string): TradOptions => {
  if (!pluginId) {
    throw new TypeError("pluginId can't be empty");
  }
  return Object.keys(trad).reduce((acc, current) => {
    const key = current.startsWith(GLOBAL_KEY_PREFIX) ? current : `${pluginId}.${current}`;
    acc[key] = trad[current];
    return acc;
  }, {} as TradOptions);
};
