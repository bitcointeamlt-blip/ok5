module.exports = {
  apps: [{
    name: 'colyseus-server',
    script: 'build/index.js',
    instances: 1,
    exec_mode: 'fork',
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    shutdown_with_message: true,
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 2567
    },
    autorestart: true,
    watch: false
  }]
};
