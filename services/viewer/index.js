const WebSocket = require('ws');
const FrameExtractor = require('./frameExtractor');
const { getConfig } = require('../../configLoader');
const http = require('http'); // Necesario para crear el servidor HTTP
const express = require('express'); // Necesario para servir archivos
const path = require('path'); // Necesario para rutas de archivos

let httpServer = null; // Referencia al servidor HTTP
let wss = null;        // Instancia del WebSocket Server
let extractors = {};
let clientSubscriptions = new Map();

// Función principal para iniciar el servicio
function run() {
    console.log("Viewer Service: Starting...");
    let appConfig;
    try {
        appConfig = getConfig();
        if (!appConfig) {
            console.error("Viewer Service: Failed to get configuration.");
            return;
        }
        console.log(`Viewer Service: Configuration loaded for Plate ${appConfig.plate}.`);
    } catch (error) {
        console.error("Viewer Service: Could not start due to configuration error:", error.message);
        return;
    }

    // Usar puerto del entorno o default
    const viewerPort = process.env.VIEWER_PORT || 8080;

    stopAll(); // Asegura limpiar estado anterior

    try {
        // 1. Crear la aplicación Express
        const app = express();

        // 2. Crear el servidor HTTP usando la app Express
        httpServer = http.createServer(app);

        // 3. Crear el servidor WebSocket, adjunto al servidor HTTP
        wss = new WebSocket.Server({ server: httpServer }); // NO especificar 'port' aquí

        // 4. Configurar Express para servir archivos estáticos desde 'public'
        // __dirname aquí es services/viewer, así que subimos dos niveles
        const publicPath = path.join(__dirname, '..', '..', 'public');
        console.log(`Viewer Service: Serving static files from ${publicPath}`);
        app.use(express.static(publicPath));

        // Ruta específica por si el usuario va a la raíz
        app.get('/', (req, res) => {
            res.sendFile(path.join(publicPath, 'viewer.html'));
        });

        // 5. Configurar los listeners del WebSocket Server (igual que antes)
        wss.on('connection', (ws) => {
            console.log('Viewer Service: Client connected');
            clientSubscriptions.set(ws, null);
            ws.on('message', (message) => {
                try {
                    let data;
                    try { data = JSON.parse(message); }
                    catch (jsonError) {
                        console.warn('Viewer Service: Received non-JSON message:', message.toString());
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format, expected JSON.' }));
                        return;
                    }
                    if (data.action === 'subscribe' && data.cameraName) {
                        handleSubscription(ws, data.cameraName, appConfig);
                    } else if (data.action === 'unsubscribe') {
                        handleUnsubscription(ws);
                    } else {
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', message: 'Unknown action.' }));
                    }
                } catch (e) {
                    console.error('Viewer Service: Failed to process message', message.toString(), e);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message.' }));
                    }
                }
            });
            ws.on('close', () => {
                console.log('Viewer Service: Client disconnected');
                handleUnsubscription(ws);
                clientSubscriptions.delete(ws);
            });
            ws.on('error', (error) => {
                console.error('Viewer Service: WebSocket client error:', error);
                handleUnsubscription(ws);
                clientSubscriptions.delete(ws);
            });
            try {
                const availableCameras = appConfig.sources
                    .map((src, ind) => src && src.endpoint ? `${appConfig.plate}_${ind}` : null)
                    .filter(name => name !== null);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'available_cameras', cameras: availableCameras }));
                }
            } catch (listError) {
                console.error("Viewer Service: Error getting available cameras:", listError);
            }
        });
        wss.on('error', (error) => {
            console.error("Viewer Service: WebSocket Server component error:", error);
            stopAll(); // Detener todo si el WS falla
        });

        // 6. Iniciar el servidor HTTP para que escuche en el puerto
        httpServer.listen(viewerPort, () => {
            console.log(`Viewer Service: HTTP server running at http://localhost:${viewerPort}/`);
            console.log(`Viewer Service: WebSocket available on ws://localhost:${viewerPort}/`);
        });

        httpServer.on('error', (error) => {
            console.error("Viewer Service: HTTP Server error:", error);
            stopAll(); // Detener si el servidor HTTP falla
        });

    } catch (error) {
        console.error("Viewer Service: Failed to start HTTP or WebSocket server:", error);
        stopAll(); // Asegurar limpieza
    }
}

function handleSubscription(ws, cameraName, appConfig) {
    // Desuscribir de la cámara anterior si estaba suscrito a otra
    handleUnsubscription(ws);

    console.log(`Viewer Service: Client subscribing to ${cameraName}`);
    clientSubscriptions.set(ws, cameraName);

    // Si no hay un extractor para esta cámara, crearlo
    if (!extractors[cameraName]) {
        const sourceIndex = appConfig.sources.findIndex((_, ind) => `${appConfig.plate}_${ind}` === cameraName);
        const sourceConfig = sourceIndex !== -1 ? appConfig.sources[sourceIndex] : null;

        if (!sourceConfig || !sourceConfig.endpoint) {
            console.error(`Viewer Service: Source config not found or invalid for ${cameraName}`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', camera: cameraName, message: `Configuration not found for ${cameraName}` }));
            }
            clientSubscriptions.set(ws, null);
            return;
        }

        console.log(`Viewer Service: Creating FrameExtractor for ${cameraName} (Source: ${sourceConfig.endpoint})`);
        try {
            const newExtractor = new FrameExtractor(sourceConfig.endpoint, cameraName);
            extractors[cameraName] = {
                instance: newExtractor,
                clients: new Set()
            };

            // Manejador de frames: convierte a Base64 y envía
            newExtractor.on('frame', (frameBuffer) => {
                // Optimización: Solo convertir y enviar si hay clientes suscritos
                if (extractors[cameraName] && extractors[cameraName].clients.size > 0) {
                    const base64Frame = frameBuffer.toString('base64');
                    const message = JSON.stringify({ type: 'frame', camera: cameraName, data: base64Frame });
                    extractors[cameraName].clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(message);
                        }
                    });
                }
            });

            // Manejador de errores del extractor
            newExtractor.on('error', (error) => {
                console.error(`Viewer Service: FrameExtractor error for ${cameraName}:`, error);
                const errorMessage = JSON.stringify({ type: 'error', camera: cameraName, message: 'Stream error occurred.' });
                if (extractors[cameraName]) {
                    extractors[cameraName].clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(errorMessage);
                        }
                    });
                }
                // Detener y limpiar este extractor específico al fallar
                stopExtractor(cameraName);
            });

            // Iniciar el extractor después de configurar los listeners
            newExtractor.start();

        } catch (error) {
            console.error(`Viewer Service: Failed to create or start FrameExtractor for ${cameraName}:`, error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', camera: cameraName, message: `Failed to start stream for ${cameraName}` }));
            }
            clientSubscriptions.set(ws, null);
            // Limpiar si se creó parcialmente el objeto extractor
            if (extractors[cameraName]) {
                delete extractors[cameraName];
            }
            return;
        }
    }

    // Añadir este cliente al conjunto de suscritos para este extractor
    // Verificar si el extractor aún existe (podría haber fallado y sido eliminado)
    if (extractors[cameraName]) {
        extractors[cameraName].clients.add(ws);
        console.log(`Viewer Service: Client added to ${cameraName}. Total clients: ${extractors[cameraName].clients.size}`);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribed', camera: cameraName }));
        }
    } else {
        console.warn(`Viewer Service: Extractor for ${cameraName} was not available for subscription.`);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', camera: cameraName, message: `Stream ${cameraName} is not available.` }));
        }
        clientSubscriptions.set(ws, null);
    }
}

function handleUnsubscription(ws) {
    const cameraName = clientSubscriptions.get(ws);
    if (cameraName && extractors[cameraName]) {
        extractors[cameraName].clients.delete(ws);
        console.log(`Viewer Service: Client unsubscribed from ${cameraName}. Remaining clients: ${extractors[cameraName].clients.size}`);
        // Si no quedan clientes para este extractor, detenerlo
        if (extractors[cameraName].clients.size === 0) {
            stopExtractor(cameraName);
        }
    }
    // Asegurarse de marcar como no suscrito incluso si la cámara no existía
    clientSubscriptions.set(ws, null);
    if (ws.readyState === WebSocket.OPEN && cameraName) {
        ws.send(JSON.stringify({ type: 'unsubscribed', camera: cameraName }));
    }
}

function stopExtractor(cameraName) {
    if (extractors[cameraName]) {
        console.log(`Viewer Service: Stopping FrameExtractor for ${cameraName}...`);
        try {
            extractors[cameraName].instance.stop();
        } catch (stopError) {
            console.error(`Viewer Service: Error stopping extractor ${cameraName}:`, stopError);
        }
        delete extractors[cameraName];
        console.log(`Viewer Service: FrameExtractor for ${cameraName} stopped and removed.`);
    }
}

function stopAll() {
    console.log("Viewer Service: Stopping service...");

    // 1. Detener todos los extractores (esto debería hacerse primero)
    Object.keys(extractors).forEach(cameraName => {
        stopExtractor(cameraName);
    });
    console.log("Viewer Service: All extractors stopped.");

    // 2. Cerrar el servidor WebSocket (esto cerrará conexiones WS)
    if (wss) {
        console.log("Viewer Service: Closing WebSocket server connections...");
        wss.close((err) => { // close() cierra el servidor y las conexiones
            if (err) { console.error("Viewer Service: Error closing WebSocket server:", err); }
            else { console.log("Viewer Service: WebSocket server closed."); }
        });
        wss = null;
    }

    // 3. Cerrar el servidor HTTP
    if (httpServer) {
        console.log("Viewer Service: Closing HTTP server...");
        httpServer.close((err) => {
            if (err) { console.error("Viewer Service: Error closing HTTP server:", err); }
            else { console.log("Viewer Service: HTTP server closed."); }
            httpServer = null; // Limpiar referencia
        });
    }

    console.log("Viewer Service: Shutdown sequence initiated.");
}

module.exports = {
    run,
    stopAll
};
