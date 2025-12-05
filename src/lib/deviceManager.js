/**
 * DeviceManager - Manages multiple device drivers simultaneously
 * Handles multiple SeeedSense IMU devices for multi-sensor motion tracking
 */

class DeviceManager {
  constructor(settings, mainWindow, plotWindow, bleTriggerCallback, fusionWindow = null, bleHeartbeatCallback = null) {
    this.settings = settings;
    this.mainWindow = mainWindow;
    this.plotWindow = plotWindow;
    this.bleTriggerCallback = bleTriggerCallback;
    this.fusionWindow = fusionWindow;
    this.bleHeartbeatCallback = bleHeartbeatCallback;
    
    // Map of device ID -> driver instance
    this.drivers = new Map();
    
    // Map of device ID -> latest sensor data
    this.latestData = new Map();

    // Map of device ID -> last packet timestamp (ms)
    this.deviceLastPacket = new Map();
    
    // Callback for when data is received from any device
    this.onDataCallback = null;
    
    // Fusion settings
    this.fusionMode = 'maximum';  // 'maximum', 'average', or 'consensus'
    this.fusionThreshold = 0.2;   // m/s² for fusion detection
    
    // Calibration tracking
    this.allDevicesCalibrated = false;

    // Watchdog / heartbeat configuration
    this.watchdogSettings = {
      enabled: Boolean(this.bleHeartbeatCallback),
      intervalMs: settings?.watchdog?.heartbeatIntervalMs ?? 250,
      timeoutMs: settings?.watchdog?.timeoutMs ?? 750,
      warmupMs: settings?.watchdog?.warmupMs ?? 5000,
    };
    this.watchdogTimer = null;
    this.watchdogLastState = 'unknown';
    this.watchdogArmedAt = Date.now();
    this.pendingHeartbeat = null;

    // Begin watchdog loop immediately so the Arduino stays alive while devices connect
    if (this.watchdogSettings.enabled) {
      this.startWatchdogIfNeeded();
    }
  }

  /**
   * Add a device driver to the manager
   * @param {string} deviceId - Unique identifier (e.g., "LEFT_ARM", "RIGHT_ARM")
   * @param {BaseDriver} driver - Driver instance
   */
  addDevice(deviceId, driver) {
    console.log(`[DeviceManager] Adding device: ${deviceId}`);
    this.drivers.set(deviceId, driver);
    this.latestData.set(deviceId, null);
    this.deviceLastPacket.set(deviceId, Date.now());

    // Re-arm watchdog warmup window whenever a new device comes online
    this.watchdogArmedAt = Date.now();
    
    // Wrap the driver's handleData to track which device sent data
    const originalHandleData = driver.handleData.bind(driver);
    driver.handleData = (data) => {
      // Call original handler
      const result = originalHandleData(data);
      
      console.log(`[DeviceManager] 📊 Motion metrics from ${deviceId}:`, result);
      
      // Store latest data from this device with motion metrics
      this.latestData.set(deviceId, {
        deviceId,
        timestamp: Date.now(),
        rawData: data,
        ...result  // Includes deltaMagnitude, magnitude, brokeThreshold, etc.
      });

      // Track last packet receipt for watchdog heartbeat
      this.deviceLastPacket.set(deviceId, Date.now());
      
      // Perform fusion calculation
      this.performFusion();
      
      // Notify callback if registered
      if (this.onDataCallback) {
        this.onDataCallback(deviceId, data);
      }
    };

    // Ensure watchdog loop is running when enabled
    this.startWatchdogIfNeeded();
  }
  
  /**
   * Perform multi-device sensor fusion
   * Combines data from all devices to detect overall motion
   */
  performFusion() {
    const deviceData = Array.from(this.latestData.values()).filter(d => d !== null);
    
    if (deviceData.length === 0) return;
    
    console.log(`[DeviceManager] 🔗 Fusion input (${deviceData.length} devices):`, 
      deviceData.map(d => ({
        id: d.deviceId,
        delta: d.deltaMagnitude,
        mag: d.magnitude,
        cal: d.isCalibrated
      }))
    );
    
    // Check if all devices are calibrated
    const allCalibrated = deviceData.every(d => d.isCalibrated);
    if (allCalibrated && !this.allDevicesCalibrated) {
      this.allDevicesCalibrated = true;
      console.log('[DeviceManager] ✅ All devices calibrated! Fusion active.');
    }
    
    // Extract motion metrics from each device
    const deltas = deviceData.map(d => d.deltaMagnitude || 0);
    const magnitudes = deviceData.map(d => d.magnitude || 0);
    const individualThresholds = deviceData.map(d => d.brokeThreshold || false);
    
    // Fusion calculations
    let fusedDeltaMagnitude = 0;
    let fusedBrokeThreshold = false;
    
    switch (this.fusionMode) {
      case 'maximum':
        // Use the maximum delta from any sensor (most sensitive)
        fusedDeltaMagnitude = Math.max(...deltas);
        fusedBrokeThreshold = fusedDeltaMagnitude > this.fusionThreshold;
        break;
        
      case 'average':
        // Use average delta (balanced, reduces noise)
        fusedDeltaMagnitude = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        fusedBrokeThreshold = fusedDeltaMagnitude > this.fusionThreshold;
        break;
        
      case 'consensus':
        // Require multiple sensors to agree (most robust)
        fusedDeltaMagnitude = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const agreementCount = individualThresholds.filter(t => t).length;
        fusedBrokeThreshold = agreementCount >= Math.ceil(deviceData.length / 2);
        break;
    }
    
    const fusedThresholdPct = (fusedDeltaMagnitude / this.fusionThreshold) * 100;
    
    // Create fused data packet
    const fusedData = {
      timestamp: Date.now(),
      mode: this.fusionMode,
      deviceCount: deviceData.length,
      calibrated: allCalibrated,
      
      // Individual device data
      devices: deviceData.map(d => ({
        deviceId: d.deviceId,
        deltaMagnitude: d.deltaMagnitude,
        magnitude: d.magnitude,
        brokeThreshold: d.brokeThreshold,
        isCalibrated: d.isCalibrated
      })),
      
      // Fused metrics
      fusedDeltaMagnitude,
      fusedBrokeThreshold,
      fusedThresholdPct,
      
      // Statistics
      maxDelta: Math.max(...deltas),
      minDelta: Math.min(...deltas),
      avgDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      avgMagnitude: magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length,
    };
    
    // Send to fusion window if available
    if (this.fusionWindow && this.fusionWindow.webContents) {
      console.log('[DeviceManager] 📤 Sending fusion data to window:', {
        fusedDelta: fusedData.fusedDeltaMagnitude.toFixed(3),
        devices: fusedData.devices.map(d => ({
          id: d.deviceId,
          delta: d.deltaMagnitude?.toFixed(3) || 'undefined',
          mag: d.magnitude?.toFixed(3) || 'undefined'
        }))
      });
      this.fusionWindow.webContents.send('fusion-data', fusedData);
    }
    
    // Log motion events
    if (fusedBrokeThreshold && allCalibrated) {
      console.log(`[DeviceManager] 🎯 FUSED MOTION DETECTED! ΔMag: ${fusedDeltaMagnitude.toFixed(3)} m/s² (${this.fusionMode} of ${deviceData.length} devices)`);
    }
  }
  
  /**
   * Set fusion mode
   * @param {string} mode - 'maximum', 'average', or 'consensus'
   */
  setFusionMode(mode) {
    if (['maximum', 'average', 'consensus'].includes(mode)) {
      this.fusionMode = mode;
      console.log(`[DeviceManager] Fusion mode set to: ${mode}`);
    }
  }
  
  /**
   * Set fusion window for visualization
   * @param {BrowserWindow} window - Electron BrowserWindow
   */
  setFusionWindow(window) {
    this.fusionWindow = window;
    console.log('[DeviceManager] Fusion window connected');
  }

  /**
   * Start watchdog heartbeat loop if required
   */
  startWatchdogIfNeeded() {
    if (!this.watchdogSettings.enabled) return;
    if (this.watchdogTimer) return;

    console.log('[DeviceManager] 🫀 Watchdog heartbeat enabled', {
      intervalMs: this.watchdogSettings.intervalMs,
      timeoutMs: this.watchdogSettings.timeoutMs,
      warmupMs: this.watchdogSettings.warmupMs,
    });

    this.watchdogArmedAt = Date.now();
    this.watchdogTimer = setInterval(() => this.evaluateWatchdog(), this.watchdogSettings.intervalMs);
  }

  /**
   * Stop watchdog loop (e.g., on shutdown)
   */
  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
      this.watchdogLastState = 'unknown';
      this.pendingHeartbeat = null;
    }
  }

  /**
   * Evaluate sensor health and pet watchdog if all devices are responsive
   */
  evaluateWatchdog() {
    if (!this.watchdogSettings.enabled) return;
    if (this.drivers.size === 0) {
      if (this.watchdogLastState !== 'idle') {
        console.log('[DeviceManager] ⏳ Watchdog waiting for sensors to initialize');
      }
      this.petWatchdog();
      this.watchdogLastState = 'idle';
      return;
    }

    const now = Date.now();
    const staleDevices = [];
    const { timeoutMs, warmupMs } = this.watchdogSettings;
    const warmupActive = now - this.watchdogArmedAt < warmupMs;

    this.drivers.forEach((_, deviceId) => {
      const lastPacket = this.deviceLastPacket.get(deviceId);
      if (!lastPacket) {
        if (!warmupActive) {
          staleDevices.push(deviceId);
        }
        return;
      }

      if (!warmupActive && now - lastPacket > timeoutMs) {
        staleDevices.push(deviceId);
      }
    });

    if (staleDevices.length === 0) {
      if (this.watchdogLastState !== 'healthy') {
        console.log('[DeviceManager] 🟢 Watchdog healthy – petting heartbeat');
      }
      this.petWatchdog();
      this.watchdogLastState = 'healthy';
    } else {
      if (this.watchdogLastState !== 'stale') {
        console.warn('[DeviceManager] 🛑 Watchdog detected stale sensor(s):', staleDevices);
      }
      this.watchdogLastState = 'stale';
    }
  }

  /**
   * Pet the external watchdog via BLE heartbeat callback
   */
  petWatchdog() {
    if (!this.bleHeartbeatCallback) return;
    if (this.pendingHeartbeat) return;

    try {
      const maybePromise = this.bleHeartbeatCallback();
      if (maybePromise && typeof maybePromise.then === 'function') {
        this.pendingHeartbeat = maybePromise
          .catch((err) => {
            console.error('[DeviceManager] Watchdog heartbeat error:', err);
          })
          .finally(() => {
            this.pendingHeartbeat = null;
          });
      }
    } catch (err) {
      console.error('[DeviceManager] Watchdog heartbeat threw synchronously:', err);
    }
  }

  /**
   * Remove a device driver
   * @param {string} deviceId - Device identifier
   */
  removeDevice(deviceId) {
    console.log(`[DeviceManager] Removing device: ${deviceId}`);
    const driver = this.drivers.get(deviceId);
    if (driver && driver.port) {
      driver.port.close();
    }
    this.drivers.delete(deviceId);
    this.latestData.delete(deviceId);
    this.deviceLastPacket.delete(deviceId);

    if (this.drivers.size === 0) {
      this.stopWatchdog();
    }
  }

  /**
   * Get all active devices
   * @returns {Array<string>} Array of device IDs
   */
  getActiveDevices() {
    return Array.from(this.drivers.keys());
  }

  /**
   * Get latest data from a specific device
   * @param {string} deviceId - Device identifier
   * @returns {Object|null} Latest data or null
   */
  getLatestData(deviceId) {
    return this.latestData.get(deviceId);
  }

  /**
   * Get latest data from all devices
   * @returns {Map<string, Object>} Map of deviceId -> latest data
   */
  getAllLatestData() {
    return new Map(this.latestData);
  }

  /**
   * Register a callback for when any device receives data
   * @param {Function} callback - (deviceId, data) => void
   */
  onData(callback) {
    this.onDataCallback = callback;
  }

  /**
   * Update settings for all devices
   * @param {Object} settings - New settings
   */
  updateSettings(settings) {
    this.settings = settings;
    this.drivers.forEach(driver => {
      driver.updateSettings(settings);
    });
  }

  /**
   * Update tolerance for all devices
   * @param {number} tolerance - New tolerance value
   */
  updateTolerance(tolerance) {
    this.drivers.forEach(driver => {
      driver.updateTolerance(tolerance);
    });
  }

  /**
   * Get driver for a specific device
   * @param {string} deviceId - Device identifier
   * @returns {BaseDriver|undefined} Driver instance
   */
  getDriver(deviceId) {
    return this.drivers.get(deviceId);
  }

  /**
   * Close all devices
   */
  closeAll() {
    console.log('[DeviceManager] Closing all devices');
    this.drivers.forEach((driver, deviceId) => {
      this.removeDevice(deviceId);
    });
    this.stopWatchdog();
  }
}

module.exports = DeviceManager;
