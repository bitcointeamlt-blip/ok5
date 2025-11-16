module.exports = {
  apps: [{
    name: 'colyseus-server',
    script: 'build/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 2567
    },
    autorestart: true,
    watch: false
  }]
};
