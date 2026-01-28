import pluginId from '../utils/pluginId';

// Strapi V5 EditLayout interface based on official documentation
interface EditFieldLayout {
  attribute?: {
    customField?: string;
    pluginOptions?: {
      [key: string]: {
        enabled?: boolean;
      };
    };
    type?: string;
  };
  name?: string;
  size?: number;
  [key: string]: unknown;
}

interface EditLayout {
  layout: Array<Array<EditFieldLayout>>;
  components: {
    [uid: string]: {
      layout: Array<EditFieldLayout>;
      settings: unknown;
    };
  };
  metadatas: {
    [key: string]: unknown;
  };
  options: unknown;
  settings: unknown;
}

const mutateLayouts = (layouts: Array<Array<EditFieldLayout>>): Array<Array<EditFieldLayout>> => {
  return layouts.map((row) => {
    return row.map((field) => {
      // Check if this field has the maplibre-field plugin option enabled
      const hasMapFieldEnabled = field.attribute?.pluginOptions?.['maplibre-field']?.enabled;

      if (!hasMapFieldEnabled) {
        return field;
      }

      // Update the customField type to use our plugin
      return {
        ...field,
        attribute: {
          ...field.attribute,
          customField: `plugin::${pluginId}.map`,
        },
      };
    });
  });
};

const mutateEditViewHook = (editLayout: EditLayout): EditLayout => {
  // Safety check for Strapi V5 structure
  // Handle cases where layout might be undefined or not an array
  if (!editLayout) {
    return editLayout;
  }

  // If layout is not present or not an array, return unchanged
  if (!Array.isArray(editLayout.layout)) {
    return editLayout;
  }

  const mutatedLayout = mutateLayouts(editLayout.layout);

  return {
    ...editLayout,
    layout: mutatedLayout,
  };
};

export default mutateEditViewHook;
