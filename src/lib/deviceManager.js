/**
 * DeviceManager - Manages multiple device drivers simultaneously
 * Handles multiple SeeedSense IMU devices for multi-sensor motion tracking
 */

class DeviceManager {
  constructor(settings, mainWindow, plotWindow, bleTriggerCallback, fusionWindow = null) {
    this.settings = settings;
    this.mainWindow = mainWindow;
    this.plotWindow = plotWindow;
    this.bleTriggerCallback = bleTriggerCallback;
    this.fusionWindow = fusionWindow;
    
    // Map of device ID -> driver instance
    this.drivers = new Map();
    
    // Map of device ID -> latest sensor data
    this.latestData = new Map();
    
    // Callback for when data is received from any device
    this.onDataCallback = null;
    
    // Fusion settings
    this.fusionMode = 'maximum';  // 'maximum', 'average', or 'consensus'
    this.fusionThreshold = 0.2;   // m/s² for fusion detection
    
    // Calibration tracking
    this.allDevicesCalibrated = false;
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
      
      // Perform fusion calculation
      this.performFusion();
      
      // Notify callback if registered
      if (this.onDataCallback) {
        this.onDataCallback(deviceId, data);
      }
    };
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
  }
}

module.exports = DeviceManager;
