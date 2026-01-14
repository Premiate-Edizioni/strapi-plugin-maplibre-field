export default [
  {
    method: 'GET',
    path: '/config',
    handler: 'config.getConfig',
    config: {
      auth: false, // No authentication needed - config is public
    },
  },
];
