const { spawn } = require('child_process');
const EventEmitter = require('events');

// Constantes para configuración de FFmpeg (podrían ser parámetros)
// const FFMPEG_FPS = 10; // Eliminado - No limitar FPS para el visor
const FFMPEG_QUALITY = 2; // Calidad JPEG (1-31, menor es mejor calidad)
const FFMPEG_RESTART_DELAY = 5000; // ms
const FFMPEG_COMMAND = 'ffmpeg'; // Asegúrate que ffmpeg esté en el PATH

class FrameExtractor extends EventEmitter {
    constructor(rtspUrl, name = 'Extractor') {
        super();
        this.rtspUrl = rtspUrl;
        this.name = name;
        this.ffmpegProcess = null;
        this.stopRequested = false;
        this.restartTimeout = null;

        console.log(`[${this.name}] FrameExtractor created for: ${this.rtspUrl}`);
    }

    start() {
        this.stopRequested = false;
        console.log(`[${this.name}] Starting FFmpeg process...`);
        this.spawnFFmpeg();
    }

    stop() {
        console.log(`[${this.name}] Stop requested for FrameExtractor.`);
        this.stopRequested = true;
        clearTimeout(this.restartTimeout); // Cancelar reinicios pendientes
        if (this.ffmpegProcess) {
            console.log(`[${this.name}] Sending SIGINT to FFmpeg process (PID: ${this.ffmpegProcess.pid}).`);
            this.ffmpegProcess.kill('SIGINT');
            // Podríamos añadir un SIGKILL después de un timeout si SIGINT no funciona
            setTimeout(() => {
                if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                    console.warn(`[${this.name}] FFmpeg process did not exit after SIGINT, sending SIGKILL.`);
                    this.ffmpegProcess.kill('SIGKILL');
                }
            }, 2000);
        } else {
            console.log(`[${this.name}] No FFmpeg process running.`);
        }
    }

    spawnFFmpeg() {
        if (this.stopRequested) {
            console.log(`[${this.name}] Stop was requested, not spawning FFmpeg.`);
            return;
        }

        // Limpiar proceso anterior si existe (aunque 'close' debería manejarlo)
        if (this.ffmpegProcess) {
            console.warn(`[${this.name}] Spawning FFmpeg while another process might exist. Attempting cleanup.`);
            try {
                this.ffmpegProcess.kill('SIGKILL');
            } catch (e) { /* ignore */ }
            this.ffmpegProcess = null;
        }

        const ffmpegParams = [
            '-rtsp_transport', 'tcp', // Usar TCP para RTSP (más fiable que UDP en algunas redes)
            '-i', this.rtspUrl,        // Input URL
            '-q:v', `${FFMPEG_QUALITY}`, // Calidad JPEG ajustada
            '-f', 'image2pipe',        // Formato de salida: secuencia de imágenes a pipe
            '-c:v', 'mjpeg',           // Codec de salida: Motion JPEG
            '-update', '1',            // Escribir cada frame como una imagen separada
            'pipe:1'                   // Salida a stdout
        ];

        console.log(`[${this.name}] Spawning FFmpeg command: ${FFMPEG_COMMAND} ${ffmpegParams.join(' ')}`);
        this.ffmpegProcess = spawn(FFMPEG_COMMAND, ffmpegParams, { stdio: ['ignore', 'pipe', 'pipe'] }); // stdin:ignore, stdout:pipe, stderr:pipe

        // Manejar salida de datos (frames JPEG)
        this.ffmpegProcess.stdout.on('data', (data) => {
            // Los frames MJPEG pueden venir fragmentados o agrupados.
            // Necesitamos encontrar los delimitadores SOI (0xFFD8) y EOI (0xFFD9).
            // Una simplificación (puede fallar con frames corruptos) es asumir
            // que cada 'data' chunk podría contener uno o más frames completos.
            // Para mjpeg pipe, ffmpeg suele enviar un frame por 'data' event.
            this.emit('frame', data); // Emitir el buffer directamente
        });

        // Manejar salida de errores
        this.ffmpegProcess.stderr.on('data', (data) => {
            const log = data.toString();
            // Loguear errores de ffmpeg, pero filtrar mensajes comunes/ruidosos
            if (log.includes('error') || log.includes('failed') || !log.includes('frame=')) {
                console.error(`[${this.name} FFmpeg stderr]: ${log.trim()}`);
            }
        });

        // Manejar cierre del proceso
        this.ffmpegProcess.on('close', (code, signal) => {
            console.log(`[${this.name}] FFmpeg process exited with code ${code}, signal ${signal}.`);
            this.ffmpegProcess = null; // Limpiar referencia al proceso
            if (!this.stopRequested) {
                console.log(`[${this.name}] FFmpeg process closed unexpectedly. Scheduling restart in ${FFMPEG_RESTART_DELAY}ms...`);
                this.emit('error', `FFmpeg process closed unexpectedly (code ${code}, signal ${signal})`); // Notificar al gestor
                clearTimeout(this.restartTimeout); // Limpiar timeout anterior si existe
                this.restartTimeout = setTimeout(() => {
                    console.log(`[${this.name}] Restarting FFmpeg process now.`);
                    this.spawnFFmpeg();
                }, FFMPEG_RESTART_DELAY);
            } else {
                console.log(`[${this.name}] FFmpeg process closed after stop request.`);
            }
        });

        // Manejar errores al spawnear
        this.ffmpegProcess.on('error', (err) => {
            console.error(`[${this.name}] Failed to start FFmpeg process:`, err.message);
            this.ffmpegProcess = null;
            this.emit('error', `Failed to start FFmpeg process: ${err.message}`);
            if (!this.stopRequested) {
                // Intentar reiniciar también si falla el spawn
                console.log(`[${this.name}] Scheduling restart after spawn error in ${FFMPEG_RESTART_DELAY}ms...`);
                clearTimeout(this.restartTimeout);
                this.restartTimeout = setTimeout(() => this.spawnFFmpeg(), FFMPEG_RESTART_DELAY);
            }
        });
    }
}

module.exports = FrameExtractor; 