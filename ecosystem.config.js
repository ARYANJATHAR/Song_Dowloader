module.exports = {
  apps: [{
    name: 'audio-scrapper',
    script: './BACKEND/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '800M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      HEADLESS: 'false'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      HEADLESS: 'true'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm Z'
  }]
}
