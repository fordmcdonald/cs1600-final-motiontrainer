const { SerialPort } = require("serialport");
const BaseDriver = require("./baseDriver");

class SeeedSenseDriver extends BaseDriver {
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
    }

    // use same data parsing as seedsensedriver
    parseData(data, plotWindow) {
        const line = data.trim();
        console.log("[MockSeeedSense] parseData called with:", line);

        // New BLE format: "ACC,x,y,z"
        if (line.startsWith("ACC,")) {
            const parts = line.split(",");
            console.log("[MockSeeedSense] Parsing ACC format, parts:", parts);
            if (parts.length === 4) {
                this.dataBuffer.accel.x = parseFloat(parts[1]);
                this.dataBuffer.accel.y = parseFloat(parts[2]);
                this.dataBuffer.accel.z = parseFloat(parts[3]);
                console.log(
                    "[MockSeeedSense] Parsed accel values:",
                    this.dataBuffer.accel
                );
                // For BLE format, we have complete data immediately
            }
        }
        // Old Serial format: Multi-line with "X1 = value"
        else {
            console.error(
                "[MockSeeedSense] Data did not have expected format. Data is",
                line
            );
        }

        // Check if we have complete data
        const hasCompleteData =
            this.dataBuffer.accel.x !== null &&
            this.dataBuffer.accel.y !== null &&
            this.dataBuffer.accel.z !== null;

        console.log("[MockSeeedSense] Has complete data:", hasCompleteData);

        if (!hasCompleteData) {
            return { brokeThreshold: false, thresholdPct: 0 };
        }

        // Create position data from accelerometer readings
        const positionData = {
            type: "motion",
            // Accelerometer data (in g)
            accelX: this.dataBuffer.accel.x * 10,
            accelY: this.dataBuffer.accel.y * 10,
            accelZ: this.dataBuffer.accel.z * 10,
            // Gyroscope data (in deg/s) - may be null for BLE
            gyroX: this.dataBuffer.gyro.x,
            gyroY: this.dataBuffer.gyro.y,
            gyroZ: this.dataBuffer.gyro.z,
            // Combined motion metric (can adjust weighting)
            x: this.dataBuffer.accel.x * 10,
            y: this.dataBuffer.accel.y * 10,
            z: this.dataBuffer.accel.z * 10,
        };

        console.log("[MockSeeedSense] Position data created:", {
            x: positionData.x.toFixed(4),
            y: positionData.y.toFixed(4),
            z: positionData.z.toFixed(4),
        });

        // Reset buffer for next reading
        this.dataBuffer = {
            accel: { x: null, y: null, z: null },
            gyro: { x: null, y: null, z: null },
        };

        // Add to position buffer for motion tracking
        this.positionBuffer.push(positionData);
        if (this.positionBuffer.length > this.positionBufferSize) {
            this.positionBuffer.shift();
        }

        console.log(
            `Buffer filling: ${this.positionBuffer.length}/${this.positionBufferSize}`
        );

        if (this.positionBuffer.length < this.positionBufferSize) {
            return { brokeThreshold: false, thresholdPct: 0 };
        }

        if (plotWindow) {
            // Send the motion data to the plot window
            plotWindow.webContents.send("plot-pos-data", {name: this.deviceInfo.name ?? this.deviceType, ...positionData});
        }

        const start =
            this.positionBuffer.length -
            1 -
            (this.settings.lagDelta + this.settings.windowSize);
        const end = start + this.settings.windowSize;
        this.previousWindow = this.positionBuffer.slice(start, end);

        // Calculate the average motion of the previous window
        const avgX =
            this.previousWindow.reduce((sum, point) => sum + point.x, 0) /
                this.previousWindow.length || positionData.x;
        const avgY =
            this.previousWindow.reduce((sum, point) => sum + point.y, 0) /
                this.previousWindow.length || positionData.y;
        const avgZ =
            this.previousWindow.reduce((sum, point) => sum + point.z, 0) /
                this.previousWindow.length || positionData.z;

        // Calculate motion magnitude relative to the average
        const deltaX = positionData.x - avgX;
        const deltaY = positionData.y - avgY;
        const deltaZ = positionData.z - avgZ;
        const motionMagnitude = Math.sqrt(
            deltaX ** 2 + deltaY ** 2 + deltaZ ** 2
        );

        // Check if motion magnitude exceeds the threshold
        console.log(
            "[MockSeeedSense] Motion Mag:",
            motionMagnitude.toFixed(4),
            "Threshold: 2, Current tolerance:",
            this.tolerance
        );

        if (motionMagnitude > 2) {
            console.log(
                "[MockSeeedSense] ⚡ BROKE THRESHOLD! Motion Mag:",
                motionMagnitude.toFixed(4)
            );
            return { brokeThreshold: true, thresholdPct: 1 };
        }

        return {
            brokeThreshold: false,
            thresholdPct: motionMagnitude / this.tolerance,
        };
    }

    // override base driver method to initialize this "device"
    async initializeDevice() {
        await this.initializeMockBLE();
    }

    // function to randomly generate mock data
    generateMockData() {
        // Generate random motion data (simulating accelerometer readings)
        // goes from -1 to 1
        const mockAccelX = (Math.random() - 0.5) * 2;
        const mockAccelY = (Math.random() - 0.5) * 2;

        // add 1g for gravity
        const mockAccelZ = (Math.random() - 0.5) * 2 + 1;

        const mockPacket = `ACC,${mockAccelX.toFixed(4)},${mockAccelY.toFixed(
            4
        )},${mockAccelZ.toFixed(4)}`;

        console.log("[MockSeeedSense] MOCK data generated:", mockPacket);

        // Process the mock data as if it came from BLE
        this.handleData(mockPacket);
    }

    // mock the initialization of the ble
    async initializeMockBLE() {
        try {
            console.log(
                "[MockSeeedSense] Initializing MOCK BLE (no real Bluetooth)"
            );

            return new Promise((resolve) => {
                // Simulate connection delay
                setTimeout(() => {
                    console.log("[MockSeeedSense] MOCK: Connected to device");

                    // Start generating mock data every 100ms
                    this.mockDataInterval = setInterval(() => {
                        this.generateMockData();
                    }, 100);

                    resolve();
                }, 500);
            });
        } catch (err) {
            console.error(
                "[MockSeeedSense] Failed to initialize mock BLE:",
                err
            );
            throw err;
        }
    }
}

module.exports = SeeedSenseDriver;
