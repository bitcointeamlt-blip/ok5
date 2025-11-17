module.exports = {
  apps: [{
    name: 'omg01-colyseus-server',
    script: 'build/index.js',
    instances: 1,
    exec_mode: 'fork',
    wait_ready: true,
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 2567
    },
    autorestart: true,
    watch: false
  }]
};

