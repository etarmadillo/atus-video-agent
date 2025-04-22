const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Constantes (podrían venir de config)
// const SEGMENT_TIME_SECONDS = 900; // Eliminado, ahora viene del constructor
const FFMPEG_RESTART_DELAY = 10000; // ms (más largo para grabación)
const FFMPEG_COMMAND = 'ffmpeg';
const OUTPUT_FORMAT = 'mp4'; // Formato de los segmentos
const VIDEO_CODEC = 'copy'; // Intentar copiar stream directamente (máxima calidad, bajo CPU)
// Alternativa si copy falla o no es deseado: const VIDEO_CODEC = 'libx264'; const CRF = '18'; const PRESET = 'veryslow';

class Recorder extends EventEmitter {
    constructor(rtspUrl, outputDir, cameraName, segmentTime) {
        super();
        this.rtspUrl = rtspUrl;
        this.outputDir = outputDir;
        this.cameraName = cameraName; // Usado para nombres de archivo y logs
        this.segmentTime = segmentTime; // Guardar el tiempo del segmento
        this.ffmpegProcess = null;
        this.stopRequested = false;
        this.restartTimeout = null;

        // Asegurarse que el nombre de la cámara sea seguro para nombres de archivo
        this.safeCameraName = this.cameraName.replace(/[^a-z0-9_\-\/]/gi, '_').toLowerCase();

        console.log(`[Recorder:${this.safeCameraName}] Created for source: ${this.rtspUrl}`);
        console.log(`[Recorder:${this.safeCameraName}] Output directory: ${this.outputDir}`);
        console.log(`[Recorder:${this.safeCameraName}] Segment time: ${this.segmentTime} seconds`); // Loguear el tiempo
    }

    start() {
        this.stopRequested = false;
        console.log(`[Recorder:${this.safeCameraName}] Starting recording process...`);
        this.spawnFFmpeg();
    }

    stop() {
        console.log(`[Recorder:${this.safeCameraName}] Stop requested.`);
        this.stopRequested = true;
        clearTimeout(this.restartTimeout);
        if (this.ffmpegProcess) {
            console.log(`[Recorder:${this.safeCameraName}] Sending SIGINT to FFmpeg process (PID: ${this.ffmpegProcess.pid}).`);
            // Para segment, es importante que ffmpeg termine limpiamente para finalizar el último segmento.
            // Enviamos 'q' a stdin, que es la forma preferida de terminar ffmpeg.
            // Si eso falla (no siempre funciona o stdin no está conectado), usamos SIGINT.
            const gracefullyStopped = this.ffmpegProcess.stdin ? this.ffmpegProcess.stdin.write('q') : false;
            if (!gracefullyStopped) {
                this.ffmpegProcess.kill('SIGINT');
            }
            // Timeout para forzar cierre si no termina
            setTimeout(() => {
                if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                    console.warn(`[Recorder:${this.safeCameraName}] FFmpeg process did not exit gracefully, sending SIGKILL.`);
                    this.ffmpegProcess.kill('SIGKILL');
                }
            }, 5000); // Esperar 5s
        } else {
            console.log(`[Recorder:${this.safeCameraName}] No recording process running.`);
        }
    }

    spawnFFmpeg() {
        if (this.stopRequested) return;

        // Limpiar proceso anterior si existe
        if (this.ffmpegProcess) { /* ... (código de limpieza igual que en FrameExtractor) ... */
            console.warn(`[Recorder:${this.safeCameraName}] Spawning FFmpeg while another process exists. Cleaning up.`);
            try { this.ffmpegProcess.kill('SIGKILL'); } catch (e) { } this.ffmpegProcess = null;
        }

        // Crear directorio de salida específico para esta cámara si no existe
        const cameraOutputDir = path.join(this.outputDir, this.safeCameraName);
        try {
            if (!fs.existsSync(cameraOutputDir)) {
                fs.mkdirSync(cameraOutputDir, { recursive: true });
                console.log(`[Recorder:${this.safeCameraName}] Created output directory: ${cameraOutputDir}`);
            }
        } catch (error) {
            console.error(`[Recorder:${this.safeCameraName}] Failed to create output directory ${cameraOutputDir}:`, error);
            this.emit('error', `Failed to create output directory: ${error.message}`);
            // Programar reintento?
            this.scheduleRestart();
            return;
        }

        // Construir nombre de archivo con timestamp
        // Usamos %03d para el número de segmento, aunque con strftime puede no ser necesario.
        const outputPattern = path.join(cameraOutputDir, `rec_${this.safeCameraName}_%Y%m%d_%H%M%S.${OUTPUT_FORMAT}`);

        const ffmpegParams = [
            // Input options
            '-rtsp_transport', 'tcp',
            '-loglevel', 'warning', // Menos verboso, mostrar solo warnings y errores
            '-i', this.rtspUrl,

            // Output options - Segment muxer
            '-f', 'segment',
            '-segment_time', `${this.segmentTime}`, // Usar el tiempo del constructor
            '-segment_format', OUTPUT_FORMAT,
            '-strftime', '1', // Usar formato de fecha/hora en nombres de archivo
            '-reset_timestamps', '1', // Reiniciar timestamps para cada segmento
            // '-segment_start_number', '1', // Opcional si no usamos strftime

            // Codec options
            '-c:v', VIDEO_CODEC, // Intentar copiar el stream de video
            '-an', // No grabar audio (cambiar a '-c:a copy' o transcodificar si se necesita)

            // Quality/Encoding options (solo si VIDEO_CODEC no es 'copy')
            // ...(añadir -crf, -preset aquí si se transcodifica)

            // Output pattern
            outputPattern
        ];

        // Añadir opciones de transcodificación si no es 'copy'
        /*
        if (VIDEO_CODEC === 'libx264') {
           ffmpegParams.push('-preset', PRESET);
           ffmpegParams.push('-crf', CRF);
        }
        */

        console.log(`[Recorder:${this.safeCameraName}] Spawning FFmpeg command: ${FFMPEG_COMMAND} ${ffmpegParams.join(' ')}`);
        // Conectar stdin para poder enviar 'q' para parada limpia
        this.ffmpegProcess = spawn(FFMPEG_COMMAND, ffmpegParams, { stdio: ['pipe', 'ignore', 'pipe'] }); // stdin:pipe, stdout:ignore, stderr:pipe

        // Manejar salida de errores
        this.ffmpegProcess.stderr.on('data', (data) => {
            console.error(`[Recorder:${this.safeCameraName} FFmpeg stderr]: ${data.toString().trim()}`);
            // Podríamos detectar errores específicos aquí
        });

        // Manejar cierre del proceso
        this.ffmpegProcess.on('close', (code, signal) => {
            const reason = signal ? `signal ${signal}` : `code ${code}`;
            console.log(`[Recorder:${this.safeCameraName}] FFmpeg process exited (${reason}).`);
            this.ffmpegProcess = null;
            if (!this.stopRequested) {
                console.log(`[Recorder:${this.safeCameraName}] Recording process closed unexpectedly. Scheduling restart...`);
                this.emit('error', `Recording process closed unexpectedly (${reason})`);
                this.scheduleRestart();
            } else {
                console.log(`[Recorder:${this.safeCameraName}] Recording process closed after stop request.`);
                this.emit('stopped'); // Emitir evento de parada completada
            }
        });

        // Manejar errores al spawnear
        this.ffmpegProcess.on('error', (err) => {
            console.error(`[Recorder:${this.safeCameraName}] Failed to start recording process:`, err.message);
            this.ffmpegProcess = null;
            this.emit('error', `Failed to start recording process: ${err.message}`);
            if (!this.stopRequested) {
                this.scheduleRestart();
            }
        });
    }

    scheduleRestart() {
        clearTimeout(this.restartTimeout);
        this.restartTimeout = setTimeout(() => {
            if (!this.stopRequested) {
                console.log(`[Recorder:${this.safeCameraName}] Attempting to restart recording process.`);
                this.spawnFFmpeg();
            }
        }, FFMPEG_RESTART_DELAY);
    }
}

module.exports = Recorder; 