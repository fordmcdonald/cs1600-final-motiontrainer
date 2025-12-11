const path = require("path")
const fs = require("fs-extra")
const { ReadlineParser } = require('@serialport/parser-readline');

class BaseDriver {
    constructor(deviceInfo, settings, mainWindow, plotWindow, bleTriggerCallback = null) {
      this.settings = settings;
      this.port = null;
      this.deviceInfo = deviceInfo;  // Changed from portInfo to deviceInfo
      this.deviceType = deviceInfo.type;  // 'serial' or 'ble'
      this.renderer = mainWindow;
      this.plotRenderer = plotWindow;
      this.positionBuffer = [];
      this.positionBufferSize = 300;
      this.previousWindow = [];
      this.bleTriggerCallback = bleTriggerCallback;
      this.lastTriggerTime = 0;
      this.triggerCooldown = 1000; // Minimum 1 second between triggers

      // Initialize in an async method
      this.init();
    }

    async init() {
      try {
          // Initialize tolerance after settings are loaded
          this.tolerance = this.settings.balloonToleranceStart;

          // Initialize the device and parser
          await this.initializeDevice()

          // Only set up serial parser for serial devices
          // BLE devices will handle data differently
          if (this.deviceType === 'serial' && this.port) {
            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
            this.parser.on('data', (data) => this.handleData(data));
          }
      } catch (err) {
          console.error('Error initializing device driver:', err);
      }
  }

    handleData(data) {
        console.log('[BaseDriver] handleData called with:', data.substring(0, 50));
        this.renderer.webContents.send('sending-data');
        const parseResult = this.parseData(data, this.plotRenderer);
        const {brokeThreshold, thresholdPct } = parseResult;
        console.log('[BaseDriver] parseData returned - brokeThreshold:', brokeThreshold, 'thresholdPct:', thresholdPct);
        if (brokeThreshold && this.renderer) {
            console.log("[BaseDriver] THRESHOLD BROKEN! Triggering callbacks...");
            this.renderer.webContents.send('serial-data', brokeThreshold)
            console.log("[BaseDriver] BLE callback available:", !!this.bleTriggerCallback);
            // Trigger BLE if callback is available and cooldown has elapsed
            if (this.bleTriggerCallback) {
                const now = Date.now();
                const cooldownElapsed = now - this.lastTriggerTime >= this.triggerCooldown;
                console.log("[BaseDriver] Cooldown check - elapsed:", cooldownElapsed, "ms since last:", now - this.lastTriggerTime);
                if (cooldownElapsed) {
                    console.log("[BaseDriver] Triggering BLE LED flash...");
                    this.lastTriggerTime = now;
                    this.bleTriggerCallback()
                        .then(() => console.log('[BaseDriver] BLE trigger sent successfully'))
                        .catch(err => console.error('[BaseDriver] BLE trigger failed:', err));
                } else {
                    console.log("[BaseDriver] Skipping trigger - cooldown active");
                }
            }
        }
        this.renderer.webContents.send('threshold-pct', thresholdPct)
        
        // Return motion metrics for DeviceManager fusion
        return parseResult;
    }

    updateSettings(settings) {
        this.settings = settings;
    }

    updateTolerance(tolerance) {
        this.tolerance = tolerance;
    }

    parseData(data) {
        throw new Error("parseData method must be implemented by subclass");
    }

    initializeDevice() {
        throw new Error("initializeDevice method must be implemented by subclass");
    }
}

module.exports = BaseDriver;