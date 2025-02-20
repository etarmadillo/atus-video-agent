const { spawn } = require('child_process');
const EventEmitter = require('events');

class Camera extends EventEmitter {
    constructor(config) {
        super();
        console.log("Initializing camera")
        this.config = config;
        this.name = config.camera;
        this.debug = require('debug')(config.camera);
        this.lastMessage = '';
        this.error = false;
        this.monitorId = 0;
        this.maxTimeVideo = 60000;
        this.video();
    }

    video() {
        console.log("Init Video")
        this.camera = this.camStream();
        this.camera.on('close', () => {
            this.video()
        });

        this.camera.stderr.on('data', (chunk) => {
            let message = '';
            let log = chunk.toString();
            console.log(log);
            try {
                let lines = log.split("\r");
                let lastLine = lines[lines.length - 2].split(" ").filter(x => x != " " && x != "");
                let dateIndex = lastLine[lastLine.findIndex(x => x.includes("time"))];
                if (typeof dateIndex !== "undefined") {
                    this.time = dateIndex.split("=")[1];
                    this.frame = lastLine[1];
                    this.fps = lastLine[3];
                    message = `Fps:\t${this.fps}\tFrame:\t${this.frame}\tTime:\t${this.time}`;
                    // Monitor Status
                    clearInterval(this.monitorId);
                    this.monitorId = setInterval(() => {
                        this.error = true;
                        console.log('Restarting video streaming.');
                        this.emit('Restarting video streaming.');
                        this.camera.kill('SIGINT');
                        // this.snapshot();
                    }, this.maxTimeVideo);
                } else {
                    message = `Startup...\tPID:\t${this.pid}`;
                    clearInterval(this.monitorId);
                    this.monitorId = setInterval(() => {
                        this.error = true;
                        console.log('Restarting video streaming.')
                        this.emit('Restarting video streaming.');
                        this.camera.kill('SIGINT');
                        // this.snapshot();
                    }, this.maxTimeVideo);
                }
                if (message !== this.lastMessage) {
                    this.error = false;
                    this.lastMessage = message;
                    console.log(`Camera:\t${this.name}\t${message}`)
                }
            } catch (error) {

            }

        });
    }

    camStream() {
        let audioParams = ["-c:a", "aac", "-ar", "44100"];
        let camParams = ["-rtsp_transport", "tcp", "-i", this.config.source, "-c:v", "copy", "-an", "-f", "flv", this.config.destination];
        camParams.splice(4, 0, ...audioParams);
        // console.log(camParams);
        return spawn("ffmpeg", camParams);
    }

    get pid() { return this.camera.pid }
    restart() {
        this.camera.kill('SIGINT');
        this.video();
    }
}

module.exports = Camera;