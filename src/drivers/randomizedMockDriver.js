const BaseDriver = require("./baseDriver");

class RandomizedMockDriver extends BaseDriver {
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

        // Motion detection properties
        this.previousMagnitude = null;
        this.baselineMagnitude = 9.8;  // ~1g, will be calibrated
        this.isCalibrated = false;
        this.calibrationSamples = [];
        this.calibrationSampleCount = 100;  // 100 samples for calibration
        this.magnitudeThreshold = 0.2;  // Default: 0.2 m/s² change
    }

    // use same data parsing as seedsensedriver
    parseData(data, plotWindow) {
    try {
      const line = data.trim();
      
      // New BLE format: "ACC,x,y,z"
      if (line.startsWith('ACC,')) {
        const parts = line.split(',');
        if (parts.length === 4) {
          this.dataBuffer.accel.x = parseFloat(parts[1]);
          this.dataBuffer.accel.y = parseFloat(parts[2]);
          this.dataBuffer.accel.z = parseFloat(parts[3]);
          // For BLE format, we have complete data immediately
        }
      }
      // Old Serial format: Multi-line with "X1 = value"
      else if (line.includes('X1 =')) {
        this.dataBuffer.accel.x = parseFloat(line.split('=')[1].trim());
      } else if (line.includes('Y1 =')) {
        this.dataBuffer.accel.y = parseFloat(line.split('=')[1].trim());
      } else if (line.includes('Z1 =')) {
        this.dataBuffer.accel.z = parseFloat(line.split('=')[1].trim());
      }
      
      // Check if we have complete data
      const hasCompleteData = 
        this.dataBuffer.accel.x !== null &&
        this.dataBuffer.accel.y !== null &&
        this.dataBuffer.accel.z !== null;
      
      
      if (!hasCompleteData) {
        return { brokeThreshold: false, thresholdPct: 0 };
      }
      
      // Calculate acceleration magnitude (total acceleration including gravity)
      const accelX_mss = this.dataBuffer.accel.x * 9.8;  // Convert g to m/s²
      const accelY_mss = this.dataBuffer.accel.y * 9.8;
      const accelZ_mss = this.dataBuffer.accel.z * 9.8;
      const magnitude = Math.sqrt(accelX_mss * accelX_mss + accelY_mss * accelY_mss + accelZ_mss * accelZ_mss);
      
      // Calibration mode: collect samples
      if (!this.isCalibrated && this.calibrationSamples.length < this.calibrationSampleCount) {
        this.calibrationSamples.push(magnitude);
        
        if (this.calibrationSamples.length === this.calibrationSampleCount) {
          // Calculate baseline and threshold
          const sum = this.calibrationSamples.reduce((a, b) => a + b, 0);
          this.baselineMagnitude = sum / this.calibrationSampleCount;
          
          // Calculate standard deviation for noise threshold
          const variance = this.calibrationSamples.reduce((sum, val) => {
            return sum + Math.pow(val - this.baselineMagnitude, 2);
          }, 0) / this.calibrationSampleCount;
          const stdDev = Math.sqrt(variance);
          
          // Set threshold at 3x standard deviation (captures 99.7% of noise)
          this.magnitudeThreshold = Math.max(0.15, 3 * stdDev);  // Minimum 0.15 m/s²
          
          this.isCalibrated = true;
        } else {
        }
      }
      
      // Calculate change in magnitude (motion detection)
      let deltaMagnitude = 0;
      if (this.previousMagnitude !== null) {
        deltaMagnitude = Math.abs(magnitude - this.previousMagnitude);
      }
      this.previousMagnitude = magnitude;
      
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
        // Motion detection metrics
        magnitude: magnitude,
        deltaMagnitude: deltaMagnitude,
        isCalibrated: this.isCalibrated,
        baselineMagnitude: this.baselineMagnitude,
      };
      
      // Reset buffer for next reading
      this.dataBuffer = {
        accel: { x: null, y: null, z: null },
        gyro: { x: null, y: null, z: null }
      };

      
      // Add to position buffer for motion tracking
      this.positionBuffer.push(positionData);
      if (this.positionBuffer.length > this.positionBufferSize) {
        this.positionBuffer.shift();
      }


      if (this.positionBuffer.length < this.positionBufferSize) {
        // Buffer not full yet, but still return motion metrics for fusion
        return { 
          brokeThreshold: false, 
          thresholdPct: 0,
          deltaMagnitude,
          magnitude,
          isCalibrated: this.isCalibrated
        }; 
      }

      if (plotWindow) {
        // Send the motion data to the plot window
        plotWindow.webContents.send("plot-pos-data", {
            name: this.deviceInfo.name ?? this.deviceType,
          x: positionData.x,
          y: positionData.y,
          z: positionData.z,
        });
      }

      const start = this.positionBuffer.length - 1 - (this.settings.lagDelta + this.settings.windowSize);
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

      // Check if motion magnitude exceeds the threshold (OLD METHOD - kept for compatibility)

      // NEW METHOD: Use deltaMagnitude for threshold detection
      const brokeThreshold = deltaMagnitude > this.magnitudeThreshold;
      const thresholdPct = (deltaMagnitude / this.magnitudeThreshold) * 100;

      return { 
        brokeThreshold, 
        thresholdPct,
        deltaMagnitude,
        magnitude: positionData.magnitude,
        isCalibrated: this.isCalibrated
      };
    } catch (err) {
      console.error("Error parsing Seeed Sense data:", err, "Data:", data);
      return { brokeThreshold: false, thresholdPct: 0 };
    }
  }

    // override base driver method to initialize this "device"
    async initializeDevice() {
        await this.initializeMockBLE();
    }

    // function to randomly generate mock data
    generateMockData() {
        // Generate random motion data (simulating accelerometer readings)
        // goes from -1 to 1
        const mockAccelX = Math.random() * (this.high - this.low) + this.low;
        const mockAccelY = Math.random() * (this.high - this.low) + this.low;

        // add 1g for gravity
        const mockAccelZ = (Math.random() - 0.5) * 2 + 1;

        const mockPacket = `ACC,${mockAccelX.toFixed(4)},${mockAccelY.toFixed(
            4
        )},${mockAccelZ.toFixed(4)}`;

        // Process the mock data as if it came from BLE
        this.handleData(mockPacket);
    }

    // mock the initialization of the ble
    async initializeMockBLE() {
        try {

            return new Promise((resolve) => {
                // Simulate connection delay
                setTimeout(() => {

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

module.exports = RandomizedMockDriver;
