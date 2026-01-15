export default {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/config',
      handler: 'config.getConfig',
      config: {
        auth: false, // Config must be accessible from frontend to initialize the map
      },
    },
  ],
};
