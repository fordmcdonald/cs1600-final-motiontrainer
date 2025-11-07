const path = require("path")
const fs = require("fs-extra")
const { ReadlineParser } = require('@serialport/parser-readline');

class BaseDriver {
    constructor(portInfo, settings, mainWindow, plotWindow, bleTriggerCallback = null) {
      this.settings = settings;
      this.port = null;
      this.portInfo = portInfo;
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
          this.initializeDevice()

          this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
          this.parser.on('data', (data) => this.handleData(data));
      } catch (err) {
          console.error('Error initalizing device driver:', err);
      }
  }

    handleData(data) {
        this.renderer.webContents.send('sending-data');
        const {brokeThreshold, thresholdPct } = this.parseData(data, this.plotRenderer);
        if (brokeThreshold && this.renderer) {
            console.log("BROKE THRESHOLD! Motion Mag: ", thresholdPct);
            this.renderer.webContents.send('serial-data', brokeThreshold)
            console.log("Attempting to trigger BLE device1 ...", this.bleTriggerCallback);
            // Trigger BLE if callback is available and cooldown has elapsed
            if (this.bleTriggerCallback) {
                console.log("Attempting to trigger BLE device...");
                const now = Date.now();
                if (now - this.lastTriggerTime >= this.triggerCooldown) {
                    console.log("Triggering BLE device...");
                    this.lastTriggerTime = now;
                    this.bleTriggerCallback()
                        .then(() => console.log('[Driver] BLE trigger sent successfully'))
                        .catch(err => console.error('[Driver] BLE trigger failed:', err));
                }
            }
        }
        this.renderer.webContents.send('threshold-pct', thresholdPct)
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