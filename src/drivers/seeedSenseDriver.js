const { SerialPort } = require("serialport");
const BaseDriver = require("./baseDriver");

class SeeedSenseDriver extends BaseDriver {
  constructor(deviceInfo, settings, mainWindow, plotWindow, bleTriggerCallback) {
    super(deviceInfo, settings, mainWindow, plotWindow, bleTriggerCallback);
    
    // BLE-specific properties
    this.bleCharacteristic = null;
    this.bleDataBuffer = '';  // Buffer for incomplete BLE packets
    
    // Data buffer for parsing (used by both Serial and BLE)
    this.dataBuffer = {
      accel: { x: null, y: null, z: null },
      gyro: { x: null, y: null, z: null }
    };
    
    // Motion detection properties
    this.previousMagnitude = null;
    this.baselineMagnitude = 9.8;  // ~1g, will be calibrated
    this.isCalibrated = false;
    this.calibrationSamples = [];
    this.calibrationSampleCount = 100;  // 100 samples for calibration
    this.magnitudeThreshold = 0.2;  // Default: 0.2 m/s² change
  }

  parseData(data, plotWindow) {
    try {
      const line = data.trim();
      console.log('[SeeedSense] parseData called with:', line);
      
      // New BLE format: "ACC,x,y,z"
      if (line.startsWith('ACC,')) {
        const parts = line.split(',');
        console.log('[SeeedSense] Parsing ACC format, parts:', parts);
        if (parts.length === 4) {
          this.dataBuffer.accel.x = parseFloat(parts[1]);
          this.dataBuffer.accel.y = parseFloat(parts[2]);
          this.dataBuffer.accel.z = parseFloat(parts[3]);
          console.log('[SeeedSense] Parsed accel values:', this.dataBuffer.accel);
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
      
      console.log('[SeeedSense] Has complete data:', hasCompleteData);
      
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
          this.magnitudeThreshold = Math.max(0.15, 10 * stdDev);  // Minimum 0.15 m/s²
          
          this.isCalibrated = true;
          console.log(`[SeeedSense] Calibrated: baseline=${this.baselineMagnitude.toFixed(2)} m/s², threshold=${this.magnitudeThreshold.toFixed(3)} m/s²`);
        } else {
          console.log(`[SeeedSense] Calibrating... ${this.calibrationSamples.length}/${this.calibrationSampleCount}`);
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
      
      console.log('[SeeedSense] Position data created:', { x: positionData.x.toFixed(4), y: positionData.y.toFixed(4), z: positionData.z.toFixed(4) });
      
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

  // if (this.positionBuffer.length < this.positionBufferSize) {
  //   // Buffer not full yet, but still return motion metrics for fusion
  //   console.log('[SeeedSense] Buffering... returning motion metrics:', {
      //     deltaMagnitude: deltaMagnitude.toFixed(3),
      //     magnitude: magnitude.toFixed(3),
      //     isCalibrated: this.isCalibrated
      //   });
      //   return { 
      //     brokeThreshold: false, 
      //     thresholdPct: 0,
      //     deltaMagnitude,
      //     magnitude,
      //     isCalibrated: this.isCalibrated
      //   }; 
      // }

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
      console.log("[SeeedSense] Motion Mag:", motionMagnitude.toFixed(4), "Threshold: 2, Current tolerance:", this.tolerance);

      // NEW METHOD: Use deltaMagnitude for threshold detection
      const brokeThreshold = deltaMagnitude > this.magnitudeThreshold;
      const thresholdPct = (deltaMagnitude / this.magnitudeThreshold) * 100;
      
      if (brokeThreshold) {
        console.log(`[SeeedSense] MOTION DETECTED! ΔMagnitude: ${deltaMagnitude.toFixed(3)} m/s² (threshold: ${this.magnitudeThreshold.toFixed(3)} m/s²)`);
      }

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

  async initializeDevice() {
    if (this.deviceType === 'ble') {
      await this.initializeBLE();
    } else {
      this.initializeSerial();
    }
  }

  async initializeBLE() {
    try {
      console.log('[SeeedSense] Initializing BLE connection...');
      const peripheral = this.deviceInfo.peripheral;
      
      return new Promise((resolve, reject) => {
        peripheral.connect((err) => {
          if (err) {
            console.error('[SeeedSense] BLE connection error:', err);
            return reject(err);
          }
          
          console.log('[SeeedSense] Connected to', this.deviceInfo.name);

          peripheral.discoverSomeServicesAndCharacteristics(
            [this.deviceInfo.serviceUUID],
            [this.deviceInfo.txCharUUID],
            (err, services, characteristics) => {
              if (err) {
                console.error('[SeeedSense] BLE service discovery error:', err);
                return reject(err);
              }

              this.bleCharacteristic = characteristics[0];
              if (!this.bleCharacteristic) {
                return reject(new Error('[SeeedSense] TX characteristic not found'));
              }

              console.log('[SeeedSense] TX characteristic found, subscribing to notifications...');

              // Subscribe to notifications (incoming data)
              this.bleCharacteristic.subscribe((err) => {
                if (err) {
                  console.error('[SeeedSense] Subscription error:', err);
                  return reject(err);
                }
                console.log('[SeeedSense] Subscribed to accelerometer data');
              });

              // Handle incoming data
              this.bleCharacteristic.on('data', (buffer) => {
                const data = buffer.toString('utf8');
                console.log('[SeeedSense] BLE data received:', data);
                
                // Buffer data
                this.bleDataBuffer += data;
                
                // Look for complete ACC packets (pattern: ACC,x.xxxx,y.yyyy,z.zzzz)
                // Regex matches: optional negative, required digits, optional decimal + digits
                // This ensures we DON'T match incomplete numbers like just "-"
                const accPattern = /ACC,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*/g;
                const matches = this.bleDataBuffer.match(accPattern);
                
                if (matches && matches.length > 0) {
                  console.log('[SeeedSense] Found', matches.length, 'complete ACC packets');
                  
                  // Process each complete packet
                  matches.forEach((packet) => {
                    this.handleData(packet);
                  });
                  
                  // Remove processed packets from buffer
                  // Keep any incomplete data at the end
                  const lastMatch = matches[matches.length - 1];
                  const lastIndex = this.bleDataBuffer.lastIndexOf(lastMatch);
                  this.bleDataBuffer = this.bleDataBuffer.substring(lastIndex + lastMatch.length);
                  
                  console.log('[SeeedSense] Buffer remainder:', this.bleDataBuffer.length, 'chars');
                } else {
                  console.log('[SeeedSense] No complete packets yet, buffer size:', this.bleDataBuffer.length);
                }
                
                // Prevent buffer from growing too large
                if (this.bleDataBuffer.length > 500) {
                  console.log('[SeeedSense] Buffer overflow, resetting');
                  this.bleDataBuffer = '';
                }
              });

              resolve();
            }
          );
        });

        // Handle disconnect
        peripheral.on('disconnect', () => {
          console.log('[SeeedSense] BLE device disconnected');
          this.bleCharacteristic = null;
        });
      });
    } catch (err) {
      console.error("[SeeedSense] Failed to initialize BLE:", err);
      throw err;
    }
  }

  initializeSerial() {
    try {
      console.log('[SeeedSense] Initializing Serial connection...');
      
      // Initialize serial port for Seeed Sense MCU
      this.port = new SerialPort({ 
        path: this.deviceInfo.path, 
        baudRate: 115200,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: false
      });

      // Listen for port open event
      this.port.on('open', () => {
        console.log(`[SeeedSense] Serial connected on ${this.deviceInfo.path}`);
      });

      // Listen for port errors
      this.port.on('error', (err) => {
        console.error('[SeeedSense] Serial port error:', err);
      });

    } catch (err) {
      console.error("[SeeedSense] Failed to initialize Serial:", err);
      throw err;
    }
  }
}

module.exports = SeeedSenseDriver;
