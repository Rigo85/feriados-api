'use strict';

module.exports = {
  apps: [
    {
      name: 'feriados-api',
      cwd: __dirname,
      script: 'dist/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      kill_timeout: 35000,
      listen_timeout: 10000,
      time: true,
      out_file: "../feriados-api.log",
      error_file: "../feriados-api-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
