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
  ],
};
