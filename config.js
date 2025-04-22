const fs = require('fs');

// Function to parse the .txt config file (KEY=VALUE format)
function parseConfigTxt(filePath) {
    const config = {
        sources: [] // Initialize sources array
    };
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split(/\r?\n/); // Split by newline (Windows or Unix)

        const sourceData = {}; // Temporary object to collect source parts

        lines.forEach(line => {
            // Ignore comments and empty lines
            if (line.trim() === '' || line.trim().startsWith('#')) {
                return;
            }

            const parts = line.match(/^([^=]+)=(.*)$/); // Match KEY=VALUE
            if (parts && parts.length === 3) {
                const key = parts[1].trim();
                const value = parts[2].trim();

                // Check if it's a source key (e.g., source_1_endpoint)
                const sourceMatch = key.match(/^source_(\d+)_(.+)$/);
                if (sourceMatch) {
                    const index = parseInt(sourceMatch[1], 10) - 1; // 0-based index
                    const property = sourceMatch[2]; // 'endpoint' or 'audio'

                    if (!sourceData[index]) {
                        sourceData[index] = {}; // Initialize object for this source index
                    }
                    // Store endpoint as is, convert audio to booleanish number (0 or 1)
                    sourceData[index][property] = property === 'audio' ? parseInt(value, 10) : value;
                } else if (key === 'recording_segment_time') {
                    // Nueva clave: convertir a número entero
                    const segmentTime = parseInt(value, 10);
                    if (!isNaN(segmentTime) && segmentTime > 0) {
                        config[key] = segmentTime;
                    } else {
                        console.warn(`Invalid value for ${key}: ${value}. Ignoring.`);
                    }
                } else {
                    // Regular key-value pair
                    config[key] = value;
                }
            }
        });

        // Convert collected sourceData object into the sources array
        for (const index in sourceData) {
            if (sourceData.hasOwnProperty(index)) {
                // Ensure both endpoint and audio were found for the source
                if (sourceData[index].endpoint !== undefined && sourceData[index].audio !== undefined) {
                    // Ensure array is large enough
                    while (config.sources.length <= index) {
                        config.sources.push(null); // Push nulls if indices are skipped (e.g., source_1, source_3)
                    }
                    config.sources[index] = {
                        endpoint: sourceData[index].endpoint,
                        audio: sourceData[index].audio
                    };
                } else {
                    console.warn(`Incomplete data for source index ${index} in config file.`);
                }
            }
        }
        // Remove any nulls if indices were skipped
        config.sources = config.sources.filter(source => source !== null);


    } catch (error) {
        console.error(`Error reading or parsing config file: ${filePath}`, error);
        // Depending on requirements, you might exit or return a default config
        process.exit(1);
    }
    return config;
}

module.exports = { parseConfigTxt }; 