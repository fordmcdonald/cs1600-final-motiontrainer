const RandomizedMockDriver = require("./randomizedMockDriver");

class TriggeredMockDriver extends RandomizedMockDriver {
    constructor(
        deviceInfo,
        settings,
        mainWindow,
        plotWindow,
        bleTriggerCallback
    ) {
        super(deviceInfo, settings, mainWindow, plotWindow, bleTriggerCallback);

        // Data buffer for parsing (used by both Serial and BLE)
        this.dataBuffer = {
            accel: { x: null, y: null, z: null },
            gyro: { x: null, y: null, z: null },
        };

        // lower bound of random movement
        this.low = -1;

        // upper bound of random movement
        this.high = 1;

        // magnitude of acceleration trigger when in trigger mdoe
        this.triggerMagnitude = 100;

        // Motion detection properties
        this.previousMagnitude = null;
        this.baselineMagnitude = 9.8;  // ~1g, will be calibrated
        this.isCalibrated = false;
        this.calibrationSamples = [];
        this.calibrationSampleCount = 100;  // 100 samples for calibration
        this.magnitudeThreshold = 0.2;  // Default: 0.2 m/s² change
    }

    // override function to randomly generate mock data to only send 0s
    generateMockData() {
        // Generate only zero acceleration because no trigger
        const mockAccelX = 0;
        const mockAccelY = 0;

        // add 1g for gravity
        const mockAccelZ = 1;

        const mockPacket = `ACC,${mockAccelX.toFixed(4)},${mockAccelY.toFixed(
            4
        )},${mockAccelZ.toFixed(4)}`;

        // Process the mock data as if it came from BLE
        this.handleData(mockPacket);
    }

    // function that triggers acceleration passed threshold
    triggerAcceleration() {
        const mockPacket = `ACC,${this.triggerMagnitude.toFixed(
            4
        )},${this.triggerMagnitude.toFixed(4)},${(
            this.triggerMagnitude + 1
        ).toFixed(4)}`;

        console.log("TRIGGERING ACCEL with", mockPacket)

        // Process the mock data as if it came from BLE
        this.handleData(mockPacket);
    }
}

module.exports = TriggeredMockDriver;
