const { SerialPort } = require("serialport");
const BaseDriver = require("./baseDriver");

class SeeedSenseDriver extends BaseDriver {
  constructor(portInfo, settings, mainWindow, plotWindow, bleTriggerCallback) {
    super(portInfo, settings, mainWindow, plotWindow, bleTriggerCallback);
    // Buffer to accumulate multi-line sensor data
    this.dataBuffer = {
      accel: { x: null, y: null, z: null },
      gyro: { x: null, y: null, z: null }
    };
  }

  parseData(data, plotWindow) {
    try {
      // Parse Seeed Sense MCU data format:
      // Accelerometer:
      //  X1 = -0.1923
      //  Y1 = -0.3714
      //  Z1 = -0.8945
      // Gyroscope:
      //  X1 = -0.0700
      //  Y1 = -3.2900
      //  Z1 = 0.9100
      
      const line = data.trim();
      
      // Parse accelerometer values
      if (line.includes('X1 =')){
        this.dataBuffer.accel.x = parseFloat(line.split('=')[1].trim());
      } else if (line.includes('Y1 =')) {
        this.dataBuffer.accel.y = parseFloat(line.split('=')[1].trim());
      } else if (line.includes('Z1 =')) {
        this.dataBuffer.accel.z = parseFloat(line.split('=')[1].trim());
      }
      
      
      // Check if we have complete data (all accelerometer and gyroscope values)
      const hasCompleteData = 
        this.dataBuffer.accel.x !== null &&
        this.dataBuffer.accel.y !== null &&
        this.dataBuffer.accel.z !== null;
      
      if (!hasCompleteData) {
        return { brokeThreshold: false, thresholdPct: 0 };
      }
      
      // Log complete sensor reading
    //   console.log("Seeed Sense Data:", {
    //     accel: this.dataBuffer.accel,
    //     gyro: this.dataBuffer.gyro
    //   });
      
      // Combine accelerometer and gyroscope data
      // Scale values appropriately (adjust multiplier as needed)
      const positionData = {
        type: "motion",
        // Accelerometer data (in g)
        accelX: this.dataBuffer.accel.x * 10,
        accelY: this.dataBuffer.accel.y * 10,
        accelZ: this.dataBuffer.accel.z * 10,
        // Gyroscope data (in deg/s)
        gyroX: this.dataBuffer.gyro.x,
        gyroY: this.dataBuffer.gyro.y,
        gyroZ: this.dataBuffer.gyro.z,
        // Combined motion metric (can adjust weighting)
        x: this.dataBuffer.accel.x * 10,
        y: this.dataBuffer.accel.y * 10,
        z: this.dataBuffer.accel.z * 10,
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

      console.log(`Buffer filling: ${this.positionBuffer.length}/${this.positionBufferSize}`);

      if (this.positionBuffer.length < this.positionBufferSize) {
        return { brokeThreshold: false, thresholdPct: 0 }; 
      }

      if (plotWindow) {
        // Send the motion data to the plot window
        plotWindow.webContents.send("plot-serial-data", {
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

      // Always log motion detection results
    //   console.log("Motion Magnitude:", motionMagnitude.toFixed(4), {
    //     threshold: this.tolerance,
    //     thresholdPct: (motionMagnitude / this.tolerance * 100).toFixed(2) + '%',
    //     accel: { 
    //       x: positionData.accelX.toFixed(4), 
    //       y: positionData.accelY.toFixed(4), 
    //       z: positionData.accelZ.toFixed(4) 
    //     }
    //   });

      // Check if motion magnitude exceeds the threshold
      console.log("Motion Mag: ", motionMagnitude.toFixed(4));

      if (motionMagnitude > 5) {
        console.log("BROKE THRESHOLD! Motion Mag: ", motionMagnitude.toFixed(4));
        return { brokeThreshold: true, thresholdPct: 1 }; 
      }

      return { brokeThreshold: false, thresholdPct: motionMagnitude / this.tolerance };
    } catch (err) {
      console.error("Error parsing Seeed Sense data:", err, "Data:", data);
      return { brokeThreshold: false, thresholdPct: 0 };
    }
  }

  initializeDevice() {
    try {
      // Initialize serial port for Seeed Sense MCU
      // Common baud rates for Seeed devices: 9600, 115200
      this.port = new SerialPort({ 
        path: this.portInfo.path, 
        baudRate: 115200,  // Adjust if needed based on MCU configuration
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: false
      });

      // Listen for port open event
      this.port.on('open', () => {
        console.log(`Seeed Sense MCU connected on ${this.portInfo.path}`);
        
        // Send any initialization commands to the MCU if needed
        // Example: this.port.write("START\n");
      });

      // Listen for port errors
      this.port.on('error', (err) => {
        console.error('Seeed Sense MCU port error:', err);
      });

    } catch (err) {
      console.error("Failed to initialize Seeed Sense MCU:", err);
    }
  }
}

module.exports = SeeedSenseDriver;
