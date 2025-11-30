// TODO #151: Can't use ES7 import statements here?

// Modules to control application life and create native browser window
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain: ipc } = require("electron");
const _ = require("lodash");
const fs = require("fs-extra");
const log = require("electron-log");

// Event Trigger
const { getPort, sendToPort } = require("event-marker");

const { SerialPort } = require("serialport");
const deviceRegistry = require("../src/deviceRegistry");
const BLEController = require("../src/lib/bleController");
const DeviceScanner = require("../src/lib/deviceScanner");
const DeviceManager = require("../src/lib/deviceManager");
const { eventCodes, vendorId, productId, comName } = require("./config/trigger");

// handle windows installer set up
if (require("electron-squirrel-startup")) app.quit();

// Initialize BLE Controller
let bleController = null;

// Multi-device support
let deviceManager = null;
let driver;  // Keep for backwards compatibility


// Define default environment variables
let USE_EEG = false;
let VIDEO = false;

const VIDEO_ASSETS_DIR = path.join(__dirname, 'assets', 'videos');

// Override product ID if environment variable set
const activeProductId = process.env.EVENT_MARKER_PRODUCT_ID ?? productId;
const activeComName = process.env.EVENT_MARKER_COM_NAME ?? comName;
if (activeProductId) {
  log.info("Active product ID", activeProductId);
} else {
  log.info("COM Name", activeComName);
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let plotWindow;
let fusionWindow;

// Initialize settings with the JSON data from "settings.json"
const defaultSettings = {
  "balloonToleranceStart": 10,
  "balloonToleranceEnd": 3,
  "balloonFeedback": false,
  "fixationDuration": 30,
  "fixationTolerance": 3,
  "fixationGraphic": "C:\\Users\\MRF Users\\bnc\\motion-trainer\\public\\assets\\crosshair-svgrepo-com.svg",
  "videoTimeout": 5,
  "videoTolerance": 3,
  "videoDuration": 60,
  "videoFile": "Bunny.mp4",
  "lagDelta": 20,
  "windowSize": 3
}

let settings = defaultSettings
let selectedDevice = {};

function copyAssetsToUserData() {
  const userDataPath = app.getPath('userData');
  const destAssetsPath = path.join(userDataPath, 'assets', 'videos');

  // Ensure destination directory exists
  try {
    if (!fs.existsSync(destAssetsPath)) {
      fs.mkdirSync(destAssetsPath, { recursive: true });
    }
  } catch (err) {
    log.error(`Error creating directory: ${err.stack || err}`);
    return; 
  }

  // Read and copy files from VIDEO_ASSETS_DIR
  let assetFiles;
  try {
    assetFiles = fs.readdirSync(VIDEO_ASSETS_DIR);
  } catch (err) {
    log.error(`Error reading asset directory: ${err.stack || err}`);
    return;
  }

  for (const fileName of assetFiles) {
    const srcFile = path.join(VIDEO_ASSETS_DIR, fileName);
    const destFile = path.join(destAssetsPath, fileName);

    try {
      if (!fs.existsSync(destFile)) {
        fs.copyFileSync(srcFile, destFile);
      } 
    } catch (err) {
      log.error(`Error copying ${fileName}: ${err.stack || err}`);
    }
  }
}


function createWindow() {
  // Create the browser window.
  if (process.env.ELECTRON_START_URL) {
    // in dev mode, disable web security to allow local file loading
    console.log(process.env.ELECTRON_START_URL);
    mainWindow = new BrowserWindow({
      width: 1500,
      height: 900,
      icon: "./favicon.ico",
      webPreferences: {
        nodeIntegration: true,
        preload: path.join(__dirname, '../build/preload.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: false,
      },
    });

    plotWindow = new BrowserWindow({
      width: 1500,
      height: 600,
      icon: "./favicon.ico",
      webPreferences: {
        nodeIntegration: true,
        preload: path.join(__dirname, '../build/preloadPlot.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: false, 
      },
    });

    fusionWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: "./favicon.ico",
      webPreferences: {
        nodeIntegration: true,
        preload: path.join(__dirname, '../build/preloadFusion.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: false, 
      },
    });

  } else {
    mainWindow = new BrowserWindow({
      width: 1500,
      height: 900,
      icon: "./favicon.ico",
      fullscreen: true,
      webPreferences: {
        nodeIntegration: true,
        preload: path.join(__dirname, '../build/preload.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        webSecurity: false,
      },
    });
  }

  // and load the index.html of the app.
  const startUrl =
    process.env.ELECTRON_START_URL ?? `file://${path.join(__dirname, "../build/index.html")}`;
  log.info(startUrl);
  mainWindow.loadURL(startUrl);

  const startPlotURL =
  process.env.ELECTRON_START_URL
    ? `${process.env.ELECTRON_START_URL}/indexPlot.html` // Append manually for dev mode
    : `file://${path.join(__dirname, "../build/indexPlot.html")}`;

  if (plotWindow) {plotWindow.loadURL(startPlotURL)};

  const startFusionURL =
  process.env.ELECTRON_START_URL
    ? `${process.env.ELECTRON_START_URL}/fusionPlot.html` // Append manually for dev mode
    : `file://${path.join(__dirname, "../build/fusionPlot.html")}`;

  if (fusionWindow) {fusionWindow.loadURL(startFusionURL)};


  // Open the DevTools.
  process.env.ELECTRON_START_URL && mainWindow.webContents.openDevTools();
  process.env.ELECTRON_START_URL && plotWindow?.webContents.openDevTools();
  process.env.ELECTRON_START_URL && fusionWindow?.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });

  // Emitted when the window is closed.
  if (plotWindow) {
    plotWindow.on("closed", function () {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      plotWindow = null;
    });
  }

  // Emitted when the fusion window is closed.
  if (fusionWindow) {
    fusionWindow.on("closed", function () {
      fusionWindow = null;
    });
  }
}

async function initializeDevices(ipc) {
  // Initialize BLE LED Controller (for Arduino LED trigger)
  bleController = new BLEController();
  
  try {
    const bleConnected = await bleController.initialize();
    if (bleConnected) {
      console.log('[Electron] BLE LED Controller connected successfully');
    } else {
      console.warn('[Electron] BLE LED Controller not found');
    }
  } catch (err) {
    console.error('[Electron] BLE LED Controller initialization error:', err);
  }

  // Create BLE trigger callback
  const bleTrigger = bleController ? () => bleController.flashLED(500) : null;

  // Initialize DeviceManager for multi-device support
  deviceManager = new DeviceManager(settings, mainWindow, plotWindow, bleTrigger, fusionWindow);
  
  // Set fusion window after it loads (non-blocking)
  if (fusionWindow) {
    fusionWindow.webContents.once('did-finish-load', () => {
      console.log('[Electron] Fusion window ready');
      deviceManager.setFusionWindow(fusionWindow);
    });
  }

  // Scan for all devices (Serial and BLE)
  const deviceScanner = new DeviceScanner();
  const devices = await deviceScanner.scanAll(5000);  // 5 second BLE scan
  
  console.log('[Electron] Device scan complete. Found devices:', devices.map(d => ({
    type: d.type,
    path: d.path,
    name: d.name || d.manufacturer
  })));

  let devicesInitialized = 0;

  // Initialize ALL matching devices (not just first one)
  for (const deviceInfo of devices) {
    const path = deviceInfo.path;

    // Check if we have a driver for this device in the registry
    const DriverClass = deviceRegistry[path];

    if (DriverClass) {
      try {
        console.log(`[Electron] Initializing ${DriverClass.name} for ${deviceInfo.type} device: ${path}`);
        
        // Create driver instance
        const deviceDriver = new DriverClass(deviceInfo, settings, mainWindow, plotWindow, bleTrigger);
        
        // Extract device ID from path
        const deviceId = extractDeviceId(deviceInfo.path, deviceInfo.name);
        
        // Add to device manager
        deviceManager.addDevice(deviceId, deviceDriver);
        
        // Keep first device as 'driver' for backwards compatibility
        if (!driver) {
          driver = deviceDriver;
          selectedDevice = { 
            port: deviceInfo, 
            driver: DriverClass.name,
            type: deviceInfo.type 
          };
        }
        
        devicesInitialized++;
        console.log(`[Electron] ✓ ${deviceId} initialized (${DriverClass.name})`);
      } catch (error) {
        console.error(`[Electron] Error initializing driver for ${path}:`, error);
      }
    }
  }

  // Register multi-device data callback
  if (devicesInitialized > 0) {
    deviceManager.onData((deviceId, data) => {
      console.log(`[Electron] Data from ${deviceId}: ${data.substring(0, 60)}${data.length > 60 ? '...' : ''}`);
    });

    console.log(`[Electron] ✅ Initialized ${devicesInitialized} device(s) successfully`);
    console.log(`[Electron] Active devices:`, deviceManager.getActiveDevices());

    // Set up settings handler for all devices
    ipc.on("set-settings", (event, settings, config, saveToFile) => handleSetSettings(event, settings, config, saveToFile, driver));
  } else {
    console.warn('[Electron] ⚠️  No devices initialized');
  }
}

/**
 * Extract meaningful device ID from path/name
 * @param {string} path - Device path (e.g., "BLE:XIAO-IMU-1")
 * @param {string} name - Device name
 * @returns {string} - Device ID for tracking
 */
function extractDeviceId(path, name) {
  if (path.startsWith('BLE:XIAO-IMU-')) {
    // Extract suffix: "BLE:XIAO-IMU-1" -> "IMU_1"
    const suffix = path.replace('BLE:XIAO-IMU-', '');
    return `IMU_${suffix}`;
  } else if (path.startsWith('BLE:')) {
    return name || path.replace('BLE:', 'BLE_DEVICE');
  } else {
    // Serial device - use manufacturer or path
    return name || path.split('/').pop();
  }
}

// TRIGGER PORT HELPERS
let triggerPort;
let portAvailable;
let SKIP_SENDING_DEV = false;

const setUpPort = async () => {
  let p;
  if (activeProductId) {
    p = await getPort(vendorId, activeProductId);
  } else {
    p = await getPort(activeComName);
  }
  if (p) {
    triggerPort = p;
    portAvailable = true;

    triggerPort.on("error", (err) => {
      log.error(err);
      const buttons = ["OK"];
      if (process.env.ELECTRON_START_URL) {
        buttons.push("Continue Anyway");
      }
      dialog
        .showMessageBox(mainWindow, {
          type: "error",
          message: "Error communicating with event marker.",
          title: "Task Error",
          buttons,
          defaultId: 0,
        })
        .then((opt) => {
          if (opt.response === 0) {
            app.exit();
          } else {
            SKIP_SENDING_DEV = true;
            portAvailable = false;
            triggerPort = false;
          }
        });
    });
  } else {
    triggerPort = false;
    portAvailable = false;
  }
};

const handleEventSend = (code) => {
  if (!portAvailable && !SKIP_SENDING_DEV) {
    const message = "Event Marker not connected";
    log.warn(message);

    const buttons = ["Quit", "Retry"];
    if (process.env.ELECTRON_START_URL) {
      buttons.push("Continue Anyway");
    }
    dialog
      .showMessageBox(mainWindow, {
        type: "error",
        message,
        title: "Task Error",
        buttons,
        defaultId: 0,
      })
      .then((resp) => {
        const opt = resp.response;
        if (opt === 0) {
          // quit
          app.exit();
        } else if (opt === 1) {
          // retry
          setUpPort().then(() => handleEventSend(code));
        } else if (opt === 2) {
          SKIP_SENDING_DEV = true;
        }
      });
  } else if (!SKIP_SENDING_DEV) {
    sendToPort(triggerPort, code);
  }
};

// Update env variables with buildtime values from frontend
ipc.on("updateEnvironmentVariables", (event, args) => {
  USE_EEG = args.USE_EEG;
  VIDEO = args.USE_CAMERA;
  if (USE_EEG) {
    setUpPort().then(() => handleEventSend(eventCodes.test_connect));
  }
});

// EVENT TRIGGER

ipc.on("trigger", (event, args) => {
  const code = args;
  if (code !== undefined) {
    log.info(`Event: ${_.invert(eventCodes)[code]}, code: ${code}`);
    if (USE_EEG) {
      handleEventSend(code);
    }
  }
});

// <studyID> will be created on Desktop and used as root folder for saving data.
// data save format is ~/Desktop/<studyID>/<participantID>/<date>/<filename>.json
// it is also incrementally saved to the user's app data folder (logged to console)

// INCREMENTAL FILE SAVING
let stream = false;
let fileCreated = false;
let preSavePath = "";
let savePath = "";
let participantID = "";
let studyID = "";
const images = [];
let startTrial = -1;
const today = new Date();

/**
 * Abstracts constructing the filepath for saving data for this participant and study.
 * @returns {string} The filepath.
 */
const getSavePath = (studyID, participantID) => {
  if (studyID !== "" && participantID !== "") {
    const desktop = app.getPath("desktop");
    const name = app.getName();
    const date = today.toISOString().slice(0, 10);
    return path.join(desktop, studyID, participantID, date, name);
  }
};

const getFullPath = (fileName) => {
  return path.join(savePath, fileName);
};

// Read version file (git sha and branch)
const git = JSON.parse(fs.readFileSync(path.resolve(__dirname, "config/version.json")));

// Get Participant Id and Study Id from environment
ipc.on("syncCredentials", (event) => {
  event.returnValue = {
    envParticipantId: process.env.REACT_APP_PARTICIPANT_ID,
    envStudyId: process.env.REACT_APP_STUDY_ID,
  };
});

// listener for new data
ipc.on("data", (event, args) => {
  // initialize file - we got a participant_id to save the data to
  if (args.study_id && args.participant_id && !fileCreated) {
    const dir = app.getPath("userData");
    participantID = args.participant_id;
    studyID = args.study_id;
    preSavePath = path.resolve(dir, `pid_${participantID}_${today.getTime()}.json`);
    startTrial = args.trial_index;
    log.warn(preSavePath);
    stream = fs.createWriteStream(preSavePath, { flags: "ax+" });
    stream.write("[");
    fileCreated = true;
  }

  if (savePath === "") {
    savePath = getSavePath(studyID, participantID);
  }

  // we have a set up stream to write to, write to it!
  if (stream) {
    // write intermediate commas
    if (args.trial_index > startTrial) {
      stream.write(",");
    }

    // write the data
    stream.write(JSON.stringify({ ...args, git }));

    // Copy provocation images to participant's data folder
    if (args.trial_type === "image-keyboard-response") images.push(args.stimulus.slice(7));
  }
});

// Save Video
ipc.on("save_video", (event, videoFileName, buffer) => {
  if (savePath === "") {
    savePath = getSavePath(studyID, participantID);
  }

  if (VIDEO) {
    const fullPath = getFullPath(videoFileName);
    fs.outputFile(fullPath, buffer, (err) => {
      if (err) {
        event.sender.send("ERROR", err.message);
      } else {
        event.sender.send("SAVED_FILE", fullPath);
        console.log(fullPath);
      }
    });
  }
});


// EXPERIMENT END
ipc.on("end", () => {
  // quit app
  app.quit();
});

// Error state sent from front end to back end (e.g. wrong number of images)
ipc.on("error", (event, args) => {
  log.error(args);
  const buttons = ["OK"];
  if (process.env.ELECTRON_START_URL) {
    buttons.push("Continue Anyway");
  }
  const opt = dialog.showMessageBoxSync(mainWindow, {
    type: "error",
    message: args,
    title: "Task Error",
    buttons,
  });

  if (opt === 0) app.exit();
});

// log uncaught exceptions
process.on("uncaughtException", (error) => {
  // Handle the error
  log.error(error);

  // this isn't dev, throw up a dialog
  if (!process.env.ELECTRON_START_URL) {
    dialog.showMessageBoxSync(mainWindow, { type: "error", message: error, title: "Task Error" });
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

const handleSetSettings = (event, newSettings, config, saveToFile, driver) => {
  settings = newSettings;

  if (config != "default-settings" && saveToFile) {
    const jsonString = JSON.stringify(newSettings, null, 2);

    let filePath, configPath;
    if (!process.env.ELECTRON_START_URL) {
      configPath = path.join(app.getPath('userData'), 'configs')
      filePath = path.join(configPath, `${config}.json`);
    } 
    else {
      configPath = path.join(__dirname, "settings")
      filePath = path.join(configPath, `${config}.json`);
    }
    
    try {
      if (!fs.existsSync(configPath)) {
        fs.mkdirSync(configPath, { recursive: true });
      }
    } catch (err) {
      log.error(`Error creating directory: ${err.stack || err}`);
    }
    
    fs.writeFile(filePath, jsonString, (err) => {
      if (err) {
        log.info("Error writing file", err);
      }
    });
  }

  if (driver) {
    driver.updateSettings(settings);
}

}

const handleIncrementStage = (event, currentStage, totalStages) => {
  newTolerance = settings.balloonToleranceStart + (settings.balloonToleranceEnd - settings.balloonToleranceStart) * (currentStage / totalStages);
  driver.updateTolerance(newTolerance)
}

const handleFetchSettings = (event, configName) => {
  fetchedSettings = {}
  if (configName == "default-settings") {
    return defaultSettings
  }

  let settingsPath;
  if (!process.env.ELECTRON_START_URL) {
    settingsPath = path.join(app.getPath('userData'), "configs");;

    if (!fs.existsSync(settingsPath)) {
      fs.mkdirSync(settingsPath, { recursive: true });
    }

  }
  else {
    settingsPath = path.join(__dirname, "settings");;
  }

  try {
      const data = fs.readFileSync(path.join(settingsPath, `${configName}.json`), "utf-8");
      fetchedSettings = JSON.parse(data);
      return fetchedSettings;
  } catch (e) {
    log.info("Error loading settings:", e);
    return {}; 
  }
}

const handleFetchDevice = (event) => {
  return selectedDevice
}

const handleFetchCurrentSettings = (event) => {
  return settings;
}

const handleFetchProjects = () => {
  projects = []
  let settingsPath;
  
  if (!process.env.ELECTRON_START_URL) {
    settingsPath = path.join(app.getPath('userData'), "configs");;
  }
  else {
    settingsPath = path.join(__dirname, "settings");;
  }

  try {
    fs.readdirSync(settingsPath).forEach(projectDir => {
      if(projectDir != "default"){
        projects.push(projectDir)
      }
    });
    return projects;
  } catch (e) {
    log.info("Error loading projects:", e);
    return {}; 
  }
}
const handleSetTolerance = async (event, game) => {

  const toleranceSettings = {
    balloon: settings.balloonToleranceStart,
    fixation: settings.fixationTolerance,
    video: settings.videoTolerance,
  };

  const newSettings = toleranceSettings[game];
  if (newSettings) {
    driver.updateTolerance(newSettings)
    return {success: true};
  } else {
    return {success: false};
  }

}

const handleFetchVideoFiles = async () => {
  try {
    let videosDir;
    if (!process.env.ELECTRON_START_URL) {
      videosDir = path.join(app.getPath('userData'), 'assets', 'videos');
    }
    else {
      videosDir = path.join(__dirname, 'assets', 'videos');
    }
    const files = fs.readdirSync(videosDir);
    
    // Optionally, filter out non-video files
    const videoFiles = files.filter(file =>
      ['.mp4'].includes(path.extname(file).toLowerCase())
    );

    return videoFiles;
  } catch (error) {
    console.error('Error reading video files:', error);
    return [];
  }
};

const handleLoadConfig =  async () => {
  const defaultPath = process.env.ELECTRON_START_URL ? path.join(__dirname, 'settings') : path.join(app.getPath('userData'), "configs")

  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Choose a Configuration File",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
    defaultPath: defaultPath
  });

  if (canceled || filePaths.length === 0) return null;

  try {
    const contents = await fs.readFile(filePaths[0], "utf8");
    return { contents, name: path.parse(filePaths[0]).name };
  } catch (err) {
    console.error("Error reading file:", err);
    return { error: err.message };
  }
}

const handleFetchConfigNames = async () => {
  const defaultPath = process.env.ELECTRON_START_URL ? path.join(__dirname, 'settings') : path.join(app.getPath('userData'), "configs")

  let configNames = []
  try {
    fs.readdirSync(defaultPath).forEach((file) => {
      configNames.push(path.parse(file).name)
    })
    return configNames
  } catch (err) {
    console.error("Error reading configuration names: ", err)
    return []
  }
}

const handleBuildUserDataPath = (event, segments = []) => {
  if (!Array.isArray(segments)) {
    throw new TypeError("Expected an array of segments");
  }
  return path.join(app.getPath("userData"), ...segments);
};

app.whenReady().then(async () => {
  log.info("App Ready: ", app.name);

  if (!process.env.ELECTRON_START_URL) {
    copyAssetsToUserData();
  }

  // Handle ipcRenderer events (on is renderer -> main, handle is renderer <--> main)
  ipc.on("increment-stage", handleIncrementStage);
  ipc.handle("get-settings", handleFetchSettings);
  ipc.handle('get-device', handleFetchDevice);
  ipc.handle("get-current-settings", handleFetchCurrentSettings);
  ipc.handle("get-videos", handleFetchVideoFiles);
  ipc.handle("get-projects", handleFetchProjects);
  ipc.handle("set-tolerance", handleSetTolerance);
  ipc.handle("dialog:openConfig", handleLoadConfig);
  ipc.handle("get-config-names", handleFetchConfigNames);
  ipc.handle("get-user-data-path", handleBuildUserDataPath);

  // Create the Electron window
  createWindow();
  log.info("Before initializeDevices is awaited")
  await initializeDevices(ipc);
  log.info("After initializeDevices is awaited")

  /**
   * Executed when the app is launched (e.g. clicked on from the taskbar)
   * @windows Creates a new window if there are none (note this shouldn't happen because the app is quit when there are no Windows)
   * @mac Creates a new window if there are none
   */
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and reqxuire them here.
// EXPERIMENT END
app.on("will-quit", () => {
  if (fileCreated) {
    // finish writing file
    stream.write("]");
    stream.end();
    stream = false;

    // copy file to config location
    const fullPath = getFullPath(`pid_${participantID}_${today.getTime()}.json`);
    try {
      fs.mkdirSync(savePath, { recursive: true });
      fs.copyFileSync(preSavePath, fullPath);
    } catch (e) {
      console.error("Unable to save file: ", fullPath);
      console.error(e);
      log.error(e);
    }
  }
});
