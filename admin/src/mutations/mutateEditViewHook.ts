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
  [key: string]: any;
}

interface EditLayout {
  layout: Array<Array<EditFieldLayout>>;
  components: {
    [uid: string]: {
      layout: Array<EditFieldLayout>;
      settings: any;
    };
  };
  metadatas: {
    [key: string]: any;
  };
  options: any;
  settings: any;
}

const mutateLayouts = (layouts: Array<Array<EditFieldLayout>>): Array<Array<EditFieldLayout>> => {
  return layouts.map((row) => {
    return row.map((field) => {
      // Check if this field has the maplibre-field plugin option enabled
      const hasMapFieldEnabled =
        field.attribute?.pluginOptions?.['maplibre-field']?.enabled;

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
  if (!editLayout?.layout || !Array.isArray(editLayout.layout)) {
    console.warn('maplibre-field: Invalid EditLayout structure received', editLayout);
    return editLayout;
  }

  const mutatedLayout = mutateLayouts(editLayout.layout);

  return {
    ...editLayout,
    layout: mutatedLayout,
  };
};

export default mutateEditViewHook;
