module.exports = {
  apps: [
    {
      name: "cameras",
      script: "./index.js",
      max_restarts: 1000,
      restart_delay: 30
    }
  ]
}
