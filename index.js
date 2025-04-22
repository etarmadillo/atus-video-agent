const Camera = require('./camera');
const config = require('./config.json');

// async function getLogin() {
//   const response = await axios.post(config.loginEndpoint, config.credentials)
//   return response
// }

(async function (config) {
  try {
    let streamPaths = config.sources.map((src, ind) =>
    ({
      name: `${config.plate}_${ind + 1}`,
      src: src.endpoint,
      dest: `${config.streamEndpoint}${config.plate}_${ind}`,
      audio: !!src.audio
    })
    );
    this.cameras = streamPaths.map((cam, i) => new Camera({
      source: cam.src,
      audio: cam.audio,
      destination: cam.dest,
      camera: cam.name
    }))
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
})(config)