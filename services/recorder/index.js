const fs = require('fs');
const path = require('path');
const { getConfig } = require('../../configLoader');
const Recorder = require('./recorder');

let activeRecorders = {}; // Almacena instancias por nombre de cámara { cameraName: Recorder }
let outputBaseDir = '';

function run() {
    console.log("Recording Service: Starting...");
    let appConfig;
    try {
        appConfig = getConfig();
        if (!appConfig) {
            console.error("Recording Service: Failed to get configuration.");
            return;
        }
        console.log(`Recording Service: Configuration loaded for Plate ${appConfig.plate}.`);
    } catch (error) {
        console.error("Recording Service: Could not start due to configuration error:", error.message);
        return;
    }

    // Determinar directorio base de salida
    // Podría venir de config.txt como recording_output_dir
    outputBaseDir = appConfig.recording_output_dir || path.join(__dirname, '..', '..', 'recordings');
    console.log(`Recording Service: Base output directory set to ${outputBaseDir}`);

    // Crear directorio base si no existe
    try {
        if (!fs.existsSync(outputBaseDir)) {
            fs.mkdirSync(outputBaseDir, { recursive: true });
            console.log(`Recording Service: Created base output directory: ${outputBaseDir}`);
        }
    } catch (error) {
        console.error(`Recording Service: Failed to create base output directory ${outputBaseDir}:`, error);
        // Podríamos decidir si esto es fatal o el Recorder individual manejará el error
        return; // Detener el inicio del servicio si no se puede crear el dir base
    }

    // Detener grabadores anteriores si run se llama de nuevo
    stopAll();

    // Obtener el tiempo de segmento de la config o usar default
    const defaultSegmentTime = 900; // 15 minutos por defecto
    const segmentTime = appConfig.recording_segment_time || defaultSegmentTime;
    if (segmentTime !== defaultSegmentTime) {
        console.log(`Recording Service: Using custom segment time: ${segmentTime} seconds.`);
    } else {
        console.log(`Recording Service: Using default segment time: ${defaultSegmentTime} seconds.`);
    }

    // Iniciar grabador para cada fuente válida
    appConfig.sources.forEach((src, ind) => {
        if (!src || !src.endpoint) {
            console.warn(`Recording Service: Skipping invalid source configuration at index ${ind}`);
            return;
        }
        const cameraName = `${appConfig.plate}_${ind}`;

        if (activeRecorders[cameraName]) {
            console.warn(`Recording Service: Recorder for ${cameraName} already exists. Skipping.`);
            return;
        }

        console.log(`Recording Service: Initializing recorder for ${cameraName}...`);
        try {
            const recorderInstance = new Recorder(src.endpoint, outputBaseDir, cameraName, segmentTime);
            recorderInstance.on('error', (errMsg) => {
                console.error(`Recording Service: Error from recorder ${cameraName}: ${errMsg}`);
                // Aquí podríamos añadir lógica de notificación o reintentos a nivel de servicio
            });
            recorderInstance.on('stopped', () => {
                console.log(`Recording Service: Recorder ${cameraName} reported stopped.`);
                // Limpiar la referencia si es necesario (aunque stopAll ya lo hace)
                // delete activeRecorders[cameraName];
            });

            recorderInstance.start(); // Iniciar el proceso ffmpeg
            activeRecorders[cameraName] = recorderInstance;
        } catch (error) {
            console.error(`Recording Service: Failed to initialize recorder for ${cameraName}:`, error);
        }
    });

    if (Object.keys(activeRecorders).length > 0) {
        console.log(`Recording Service: Initialized ${Object.keys(activeRecorders).length} recorders.`);
    } else {
        console.warn("Recording Service: No recorders were initialized.");
    }
}

function stopAll() {
    const recorderNames = Object.keys(activeRecorders);
    if (recorderNames.length > 0) {
        console.log(`Recording Service: Stopping ${recorderNames.length} active recorders...`);
        recorderNames.forEach(cameraName => {
            const recorder = activeRecorders[cameraName];
            if (recorder && typeof recorder.stop === 'function') {
                try {
                    recorder.stop();
                } catch (error) {
                    console.error(`Recording Service: Error stopping recorder ${cameraName}:`, error);
                }
            }
        });
        activeRecorders = {}; // Limpiar referencias
        console.log("Recording Service: Stop command issued for all recorders.");
    } else {
        // console.log("Recording Service: No active recorders to stop.");
    }
}

module.exports = {
    run,
    stopAll
}; 