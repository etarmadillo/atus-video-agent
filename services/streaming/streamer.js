const { spawn } = require('child_process');
const EventEmitter = require('events');

// Renombrado de Camera a Streamer
class Streamer extends EventEmitter {
    constructor(config) {
        super();
        console.log(`Initializing streamer for ${config.camera}`)
        this.config = config;
        this.name = config.camera; // Mantenemos 'camera' en config por ahora
        this.debug = require('debug')(config.camera);
        this.lastMessage = '';
        this.error = false;
        this.monitorId = 0;
        this.maxTimeVideo = 60000; // TODO: Hacer configurable?
        this.ffmpegProcess = null; // Para mantener referencia al proceso
        this.startStreaming();
    }

    startStreaming() {
        console.log(`Starting ffmpeg stream for ${this.name}`)
        this.ffmpegProcess = this.spawnFFmpeg();

        this.ffmpegProcess.on('close', (code) => {
            console.log(`ffmpeg process for ${this.name} closed with code ${code}. Restarting.`);
            // Evitar reinicios demasiado rápidos en caso de error persistente
            setTimeout(() => this.startStreaming(), 5000); // Espera 5s antes de reiniciar
        });

        this.ffmpegProcess.stderr.on('data', (chunk) => {
            let log = chunk.toString();
            // Parsear el log de ffmpeg para obtener estado (opcional, la lógica actual es compleja)
            this.handleFFmpegLog(log);
        });
    }

    handleFFmpegLog(log) {
        // Lógica simplificada o mejorada para parsear el log de ffmpeg
        // La lógica anterior para extraer fps/time era frágil.
        // Se podría buscar mensajes de error específicos o simplemente loguear.
        // console.log(`[${this.name} ffmpeg]: ${log.trim()}`);

        // Mantenemos el monitor de actividad basado en tiempo sin output
        this.resetStreamMonitor();

        // Ejemplo de logueo menos verboso (solo líneas importantes?)
        if (!log.includes('frame=') && !log.includes('progress=')) {
            console.log(`[${this.name} ffmpeg]: ${log.trim()}`);
        }
    }

    resetStreamMonitor() {
        clearInterval(this.monitorId);
        this.monitorId = setInterval(() => {
            this.error = true;
            console.error(`No activity from ffmpeg for ${this.name} in ${this.maxTimeVideo / 1000}s. Restarting stream.`);
            this.emit('error', `No activity from ffmpeg stream ${this.name}`);
            this.stopStreaming(); // Intentar detener limpiamente antes de reiniciar
        }, this.maxTimeVideo);
    }

    spawnFFmpeg() {
        // Los parámetros de ffmpeg podrían venir de config también
        let camParams = [
            "-rtsp_transport", "tcp",
            "-fflags", "+nobuffer", // Reduce latencia de entrada
            "-i", this.config.source,
            "-vf", "scale=640:360", // Podría ser configurable
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "zerolatency",
            "-b:v", "159k", // Bitrate bajo (configurable)
            "-r", "15", // FPS (configurable)
            "-g", "30", // Keyframe interval (2*r es común)
            "-an", // No audio
            "-f", "flv",
            this.config.destination
        ];
        console.log(`Spawning ffmpeg for ${this.name} with params: ${camParams.join(' ')}`);
        return spawn("ffmpeg", camParams);
    }

    stopStreaming() {
        console.log(`Stopping ffmpeg stream for ${this.name}`);
        clearInterval(this.monitorId);
        if (this.ffmpegProcess) {
            this.ffmpegProcess.kill('SIGINT'); // Intentar terminar amablemente
            // Forzar después de un tiempo si no termina
            setTimeout(() => {
                if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                    console.warn(`Force killing ffmpeg process for ${this.name}`);
                    this.ffmpegProcess.kill('SIGKILL');
                }
            }, 2000); // Esperar 2 segundos
        }
    }

    get pid() { return this.ffmpegProcess ? this.ffmpegProcess.pid : null }

    restart() {
        console.log(`Restarting stream for ${this.name}`);
        this.stopStreaming();
        // startStreaming será llamado automáticamente en el evento 'close'
    }
}

module.exports = Streamer; // Exportar la clase renombrada 