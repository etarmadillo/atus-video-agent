module.exports = {
  apps: [
    {
      name: "cameras",
      script: "./index.js",
      max_restarts: 1000,
      restart_delay: 500
    },
    {
      name: "captures",
      script: "./fileUploader.js",
      cron_restart: "*/5 * * * *",
      autorestart: false
    },
  ]
}
