const path = require('path');
const { parseConfigTxt } = require('./config'); // Asume que config.js está en la misma raíz

let loadedConfig = null;
let hasLoaded = false;

function getConfig() {
    if (hasLoaded) {
        return loadedConfig;
    }

    console.log("ConfigLoader: Loading and validating configuration...");
    const configFilePath = path.join(__dirname, 'config.txt'); // __dirname será la raíz aquí

    try {
        loadedConfig = parseConfigTxt(configFilePath);
    } catch (error) {
        console.error("ConfigLoader: Fatal error loading configuration:", error);
        // En lugar de process.exit, lanzamos el error para que el llamador decida
        loadedConfig = null;
        hasLoaded = true; // Marcamos como cargado para no reintentar infinitamente
        throw new Error(`Failed to load config file at ${configFilePath}: ${error.message}`);
    }

    // Validate essential config loaded
    if (!loadedConfig || !loadedConfig.plate || !loadedConfig.streamEndpoint || !loadedConfig.sources || loadedConfig.sources.length === 0) {
        const errorMessage = "ConfigLoader: Essential configuration (plate, streamEndpoint, sources with at least one entry) missing or invalid in config.txt";
        console.error(errorMessage);
        loadedConfig = null; // Invalidar config
        hasLoaded = true;
        throw new Error(errorMessage);
    }

    console.log("ConfigLoader: Configuration loaded and validated successfully.");
    hasLoaded = true;
    return loadedConfig;
}

module.exports = { getConfig }; 