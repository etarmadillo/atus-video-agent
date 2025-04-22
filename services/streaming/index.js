const Streamer = require('./streamer');
const { getConfig } = require('../../configLoader'); // Subir dos niveles para llegar a la raíz

// Almacenar las instancias de streamers internamente en este módulo
let activeStreamers = [];

// Función para inicializar y arrancar el servicio
function run() {
    console.log("Streaming Service: Starting...");
    let appConfig;
    try {
        appConfig = getConfig();
        if (!appConfig) {
            // getConfig ya debería haber lanzado un error si falló
            console.error("Streaming Service: Failed to get configuration.");
            return; // No continuar
        }
        console.log(`Streaming Service: Configuration loaded for Plate ${appConfig.plate}.`);
    } catch (error) {
        console.error("Streaming Service: Could not start due to configuration error:", error.message);
        return; // No continuar si la config es inválida
    }

    // Lógica de inicialización (anteriormente en initialize)
    console.log("Streaming Service: Initializing streamers...");
    try {
        const cameraSources = appConfig.sources.map((src, ind) => {
            if (!src || !src.endpoint) {
                console.error(`Streaming Service: Invalid source configuration at index ${ind}`);
                return null;
            }
            const cameraName = `${appConfig.plate}_${ind}`;
            return {
                name: cameraName,
                sourceUrl: src.endpoint,
                destinationUrl: `${appConfig.streamEndpoint}${cameraName}`,
                enableAudio: !!src.audio
            };
        }).filter(cam => cam !== null);

        if (cameraSources.length === 0) {
            console.error("Streaming Service: No valid camera sources found in config.");
            // Considerar si esto es un error fatal para el servicio
            // return; 
        }

        // Detener streamers anteriores si run se llama de nuevo (poco probable aquí)
        stopAll();

        activeStreamers = cameraSources.map((camSource) => {
            console.log(`Streaming Service: Setting up streamer for: ${camSource.name}`);
            const streamerInstance = new Streamer({
                source: camSource.sourceUrl,
                destination: camSource.destinationUrl,
                camera: camSource.name
            });
            streamerInstance.on('error', (errMsg) => {
                console.error(`Streaming Service: Error reported from streamer ${camSource.name}: ${errMsg}`);
            });
            return streamerInstance;
        });

        if (activeStreamers.length > 0) {
            console.log(`Streaming Service: Initialized ${activeStreamers.length} camera streamers.`);
        } else {
            console.warn("Streaming Service: No streamers were initialized.");
        }

    } catch (error) {
        console.error("Streaming Service: Error during initialization:", error);
        stopAll(); // Asegurarse de limpiar si falla
    }
}

// Función para detener todos los streamers gestionados por este servicio
function stopAll() {
    if (activeStreamers.length > 0) {
        console.log("Streaming Service: Stopping all active streamers...");
        activeStreamers.forEach(streamer => {
            if (streamer && typeof streamer.stopStreaming === 'function') {
                streamer.stopStreaming();
            }
        });
        activeStreamers = []; // Limpiar el array después de detenerlos
    }
}

// Exportar las funciones públicas del servicio
module.exports = {
    run,
    stopAll,
    // Podríamos exportar activeStreamers si es necesario acceder a ellos desde fuera
    // getActiveStreamers: () => activeStreamers 
}; 