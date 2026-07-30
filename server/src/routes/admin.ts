export default {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/config',
      handler: 'config.getConfig',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
    {
      // Fetched by the browser's Worker loader, which cannot send admin credentials.
      // Serves public maplibre-gl dist files only (see controllers/worker.ts).
      method: 'GET',
      path: '/worker/:file',
      handler: 'worker.getWorker',
      config: {
        auth: false,
      },
    },
  ],
};
