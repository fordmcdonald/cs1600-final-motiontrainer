const noble = require('@abandonware/noble');

// BLE UUIDs - must match the Arduino sketch
const SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CHAR_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';
const DEVICE_NAME = 'UnoR4-Haptic';

class BLEController {
  constructor() {
    this.peripheral = null;
    this.hapticCharacteristic = null;
    this.isConnected = false;
    this.isScanning = false;
  }

  /**
   * Initialize BLE scanning and connection
   * @returns {Promise<boolean>} - True if connected successfully
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      noble.on('stateChange', async (state) => {
        if (state === 'poweredOn') {
          console.log('[BLE] Scanning for Arduino devices...');
          this.isScanning = true;
          noble.startScanning([SERVICE_UUID], false);
        } else {
          console.log('[BLE] Bluetooth not powered on:', state);
          noble.stopScanning();
          this.isScanning = false;
        }
      });

      noble.on('discover', async (peripheral) => {
        const localName = peripheral.advertisement.localName;
        if (localName === DEVICE_NAME || localName === "Arduino") {
          console.log('[BLE] Found device:', localName);
          noble.stopScanning();
          this.isScanning = false;

          try {
            await this.connectToDevice(peripheral);
            resolve(true);
          } catch (err) {
            console.error('[BLE] Connection error:', err);
            reject(err);
          }
        } else {
            console.log('[BLE] Discovered device, but name does not match:', localName);
        }
      });

      // Timeout after 10 seconds if device not found
      setTimeout(() => {
        if (!this.isConnected) {
          noble.stopScanning();
          this.isScanning = false;
          console.warn('[BLE] Device not found within timeout period');
          resolve(false);
        }
      }, 45000);
    });
  }

  /**
   * Connect to the BLE peripheral and discover characteristics
   * @param {Object} peripheral - Noble peripheral object
   * @returns {Promise<void>}
   */
  connectToDevice(peripheral) {
    return new Promise((resolve, reject) => {
      this.peripheral = peripheral;

      peripheral.connect((err) => {
        if (err) return reject(err);
        console.log('[BLE] Connected to', peripheral.advertisement.localName);

        peripheral.discoverSomeServicesAndCharacteristics(
          [SERVICE_UUID],
          [CHAR_UUID],
          (err, services, characteristics) => {
            if (err) return reject(err);

            this.hapticCharacteristic = characteristics[0];
            if (!this.hapticCharacteristic) {
              return reject(new Error('[BLE] Haptic characteristic not found'));
            }

            this.isConnected = true;
            console.log('[BLE] Haptic characteristic discovered and ready');
            resolve();
          }
        );
      });

      // Handle disconnect
      peripheral.on('disconnect', () => {
        console.log('[BLE] Device disconnected');
        this.isConnected = false;
        this.hapticCharacteristic = null;
        this.peripheral = null;
      });
    });
  }

  /**
   * Write a value to the Haptic characteristic
   * @param {number} value - Value to write (0-255 for PWM control)
   * @returns {Promise<boolean>} - True if write successful
   */
  async writeHaptic(value = 0xff) {
    const buf = Buffer.from([value]);
    return this.writeCharacteristic(buf, `value ${value}`);
  }

  /**
   * Trigger Haptic (turn on full, can be extended for patterns)
   * @returns {Promise<boolean>}
   */
  async triggerHaptic() {
    return await this.writeHaptic(0xff);
  }

  /**
   * Turn off Haptic
   * @returns {Promise<boolean>}
   */
  async turnOffHaptic() {
    return await this.writeHaptic(0x00);
  }

  /**
   * Flash LED pattern
   * @param {number} duration - Duration in ms to keep LED on
   * @returns {Promise<void>}
   */
  async flashHaptic(duration = 500) {
    await this.triggerHaptic();
    setTimeout(async () => {
      await this.turnOffHaptic();
    }, duration);
  }

  /**
   * Send watchdog heartbeat command
   * @param {number} command - Byte to send for heartbeat (default 'H')
   * @returns {Promise<boolean>}
   */
  async sendWatchdogHeartbeat(command = 0x48) {
    const buf = Buffer.from([command]);
    return this.writeCharacteristic(buf, 'watchdog heartbeat');
  }

  /**
   * Low-level helper to write buffer to haptic characteristic
   * @param {Buffer} buffer
   * @param {string} debugLabel
   * @returns {Promise<boolean>}
   */
  async writeCharacteristic(buffer, debugLabel = 'payload') {
    if (!this.isConnected || !this.hapticCharacteristic) {
      console.warn('[BLE] Not connected, cannot write characteristic');
      return false;
    }

    return new Promise((resolve, reject) => {
      this.hapticCharacteristic.write(buffer, false, (err) => {
        if (err) {
          console.error(`[BLE] Error writing ${debugLabel}:`, err);
          reject(err);
        } else {
          console.log(`[BLE] Wrote ${debugLabel} (${buffer.toString('hex')})`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Disconnect from the peripheral
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.peripheral && this.isConnected) {
      return new Promise((resolve) => {
        this.peripheral.disconnect(() => {
          console.log('[BLE] Manually disconnected');
          resolve();
        });
      });
    }
  }

  /**
   * Get connection status
   * @returns {boolean}
   */
  isDeviceConnected() {
    return this.isConnected;
  }
}

module.exports = BLEController;
