const fs = require('fs');
const path = require('path');
const Camera = require('./camera');

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
        const sourceMatch = key.match(/^source_(\d+)_(.+)$/); // Matches source_NUMBER_PROPERTY
        if (sourceMatch) {
          const index = parseInt(sourceMatch[1], 10) - 1; // 0-based index
          const property = sourceMatch[2]; // 'endpoint' or 'audio'

          if (!sourceData[index]) {
            sourceData[index] = {}; // Initialize object for this source index
          }
          // Store endpoint as is, convert audio to booleanish number (0 or 1)
          sourceData[index][property] = property === 'audio' ? parseInt(value, 10) : value;
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


// Determine config file path (assuming it's in the same directory as index.js)
const configFilePath = path.join(__dirname, 'config.txt');

// Load configuration
const config = parseConfigTxt(configFilePath);

// Validate essential config loaded
if (!config.plate || !config.streamEndpoint || !config.sources || config.sources.length === 0) {
  console.error("Essential configuration (plate, streamEndpoint, sources) missing or invalid. Check config.txt");
  process.exit(1);
}

// async function getLogin() {
//   const response = await axios.post(config.loginEndpoint, config.credentials)
//   return response
// }

(async function (config) {
  try {
    // Map sources to the format expected by the Camera class constructor
    let streamPaths = config.sources.map((src, ind) => {
      // Ensure src is valid before accessing properties
      if (!src || !src.endpoint) {
        console.error(`Invalid source configuration at index ${ind}`);
        return null; // Skip invalid source
      }
      return {
        // Use unique camera name based on index
        name: `${config.plate}_${ind}`, // Changed name format slightly
        src: src.endpoint,
        // Construct destination URL
        dest: `${config.streamEndpoint}${config.plate}_${ind}`, // Use the same unique name
        // Convert audio number (0/1) to boolean for Camera class if needed, or pass as is
        // Camera class currently doesn't seem to use this 'audio' boolean, but keeping logic
        audio: !!src.audio // src.audio should be 0 or 1 from parsing
      };
    }).filter(cam => cam !== null); // Filter out any nulls from invalid sources


    if (streamPaths.length === 0) {
      console.error("No valid camera sources found after parsing configuration.");
      process.exit(1);
    }

    // Initialize cameras
    this.cameras = streamPaths.map((cam) => new Camera({
      source: cam.src,
      // Pass audio as needed by Camera class (seems unused, but passing boolean version)
      // audio: cam.audio,
      destination: cam.dest,
      camera: cam.name // Pass the generated camera name
    }));

    console.log(`Initialized ${this.cameras.length} cameras for plate ${config.plate}`);

  } catch (error) {
    console.error("Error during application initialization:", error);
    process.exit(1);
  }
})(config); // Pass the parsed config object