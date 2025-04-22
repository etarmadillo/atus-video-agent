const streamingService = require('./services/streaming');
const viewerService = require('./services/viewer');
const recordingService = require('./services/recorder');

console.log("--- ATUS Video Agent Initializing ---");

try {
  streamingService.run();
  viewerService.run();
  recordingService.run();
  console.log("--- Services launched --- Agent running. Press Ctrl+C to stop. ---");

} catch (error) {
  console.error("--- CRITICAL ERROR during service launch: ---", error);
  try {
    recordingService.stopAll();
    viewerService.stopAll();
    streamingService.stopAll();
  } catch (stopError) { /* ignore */ }
  process.exit(1);
}

const shutdown = (signal) => {
  console.log(`\n--- Caught ${signal}, shutting down services... ---`);
  let servicesStopped = 0;
  const totalServices = 3;

  const onStopComplete = () => {
    servicesStopped++;
    if (servicesStopped >= totalServices) {
      console.log("--- All services stopped. Exiting. ---");
      setTimeout(() => process.exit(0), 500);
    }
  };
  try { recordingService.stopAll(); } catch (e) { console.error("Error stopping recording service:", e); } finally { onStopComplete(); }
  try { viewerService.stopAll(); } catch (e) { console.error("Error stopping viewer service:", e); } finally { onStopComplete(); }
  try { streamingService.stopAll(); } catch (e) { console.error("Error stopping streaming service:", e); } finally { onStopComplete(); }
  setTimeout(() => {
    console.error("--- Shutdown timeout reached. Forcing exit. ---");
    process.exit(1);
  }, 8000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Manejar promesas no capturadas y excepciones
process.on('uncaughtException', (error, origin) => {
  console.error(`--- UNCAUGHT EXCEPTION --- Origin: ${origin} ---`);
  console.error(error);
  // Intentar un cierre ordenado antes de salir
  shutdown('uncaughtException');
  // Forzar salida después de un tiempo si el shutdown falla
  setTimeout(() => process.exit(1), 6000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- UNHANDLED REJECTION ---');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
});