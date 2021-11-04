const Camera = require('./camera');
const axios = require('axios').default;

const config = require('./config.json');

async function getLogin() {
  const response = await axios.post(config.loginEndpoint, config.credentials);
  return response;
}

(async function (config) {
  let log = await getLogin()
  if (log.status = 200) {
    let streamPaths = log.data.streams;
    if (streamPaths.length > 0) {
      streamPaths = streamPaths.map(x => `${config.streamEndpoint}${x}`);
      this.cameras = config.sources.map((cam, i) => new Camera({
        source: cam.endpoint,
        audio: cam.audio,
        destination: streamPaths[i],
        camera: streamPaths[i].substring(config.streamEndpoint.length + 6, config.streamEndpoint.length + 14)
      }))
    }
  }
})(config);