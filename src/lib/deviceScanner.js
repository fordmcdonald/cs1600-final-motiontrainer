const { SerialPort } = require("serialport");
const noble = require('@abandonware/noble');

/**
 * Device Scanner - Scans for both Serial and BLE devices
 * Returns a unified list of available devices
 */

// BLE device configurations
const BLE_DEVICES = {
  'XIAO-IMU-1': {
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',  // Nordic UART Service
    txCharUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',   // TX Characteristic (device -> app)
    rxCharUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',   // RX Characteristic (app -> device)
  },
  // Multiple IMU sensors - each with unique suffix
  'XIAO-IMU-2': {
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    txCharUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    rxCharUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  }
};

class DeviceScanner {
  constructor() {
    this.devices = [];
    this.bleReady = false;
    this.bleScanning = false;
  }

  /**
   * Scan for all available devices (Serial and BLE)
   * @param {number} bleScanTimeout - How long to scan for BLE devices (ms)
   * @returns {Promise<Array>} - Array of device info objects
   */
  async scanAll(bleScanTimeout = 5000) {
    console.log('[DeviceScanner] Starting device scan...');
    this.devices = [];

    // Scan BLE devices FIRST (takes precedence over Serial)
    const bleDevices = await this.scanBLEDevices(bleScanTimeout);
    console.log(`[DeviceScanner] Found ${bleDevices.length} BLE device(s)`);
    this.devices.push(...bleDevices);

    // Scan serial ports SECOND
    const serialDevices = await this.scanSerialPorts();
    console.log(`[DeviceScanner] Found ${serialDevices.length} serial device(s)`);
    this.devices.push(...serialDevices);

    console.log(`[DeviceScanner] Total devices found: ${this.devices.length}`);
    console.log('[DeviceScanner] Priority order: BLE devices will be selected first if available');
    return this.devices;
  }

  /**
   * Scan for serial port devices
   * @returns {Promise<Array>} - Array of serial device info
   */
  async scanSerialPorts() {
    try {
      const ports = await SerialPort.list();
      
      return ports.map(port => ({
        type: 'serial',
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        vendorId: port.vendorId,
        productId: port.productId,
        raw: port,  // Keep original port info
      }));
    } catch (err) {
      console.error('[DeviceScanner] Error scanning serial ports:', err);
      return [];
    }
  }

  /**
   * Scan for BLE devices
   * @param {number} timeout - Scan timeout in ms
   * @returns {Promise<Array>} - Array of BLE device info
   */
  async scanBLEDevices(timeout = 5000) {
    return new Promise((resolve) => {
      const foundDevices = [];
      let scanTimeout;

      // Remove all previous 'discover' listeners to avoid conflicts
      noble.removeAllListeners('discover');

      // Wait for BLE to be ready
      noble.on('stateChange', (state) => {
        if (state === 'poweredOn') {
          this.bleReady = true;
          startScan();
        } else {
          console.log(`[DeviceScanner] BLE state: ${state}`);
          if (state === 'poweredOff' || state === 'unsupported') {
            resolve([]);
          }
        }
      });

      const startScan = () => {
        if (this.bleScanning) return;
        
        console.log('[DeviceScanner] Scanning for BLE devices...');
        this.bleScanning = true;
        
        // Scan with ACTIVE scanning (allowDuplicates=true gets scan response)
        // Empty array = scan for all devices
        noble.startScanning([], true);  // true = allow duplicates (gets more data)

        // Set timeout to stop scanning
        scanTimeout = setTimeout(() => {
          stopScan();
          resolve(foundDevices);
        }, timeout);
      };

      const stopScan = () => {
        if (this.bleScanning) {
          noble.stopScanning();
          this.bleScanning = false;
          console.log('[DeviceScanner] BLE scan stopped');
        }
      };

      // Handle discovered devices
      noble.on('discover', (peripheral) => {
        const localName = peripheral.advertisement.localName;
        const scanResponseName = peripheral.advertisement.scanResponse?.localName;
        const deviceName = localName || scanResponseName;
        const serviceUUIDs = peripheral.advertisement.serviceUuids || [];
        const rssi = peripheral.rssi;
        
        // Don't spam logs with undefined devices
        if (deviceName) {
          console.log(`[BLE] Discovered: name="${deviceName}", rssi=${rssi}, services=[${serviceUUIDs.join(', ')}]`);
        }
        
        // Check if this device has the Nordic UART service
        const hasNordicUART = serviceUUIDs.some(uuid => 
          uuid.toLowerCase() === '6e400001-b5a3-f393-e0a9-e50e24dcca9e' ||
          uuid.toLowerCase() === '6e40'  // Short form
        );
        
        // Match by exact name first (XIAO-IMU)
        if (deviceName === 'XIAO-IMU') {
          if (!foundDevices.find(d => d.id === peripheral.id)) {
            console.log(`[DeviceScanner] ✓ Found XIAO-IMU by name! (RSSI: ${rssi}, id: ${peripheral.id})`);
            
            foundDevices.push({
              type: 'ble',
              path: `BLE:XIAO-IMU`,
              name: deviceName,
              peripheral: peripheral,
              serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
              txCharUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
              rxCharUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
              rssi: peripheral.rssi,
              address: peripheral.address,
              id: peripheral.id,
            });
          }
        }
        // Match by other registered device names
        else if (deviceName && BLE_DEVICES[deviceName]) {
          const config = BLE_DEVICES[deviceName];
          
          const alreadyFound = foundDevices.find(d => d.id === peripheral.id);
          if (alreadyFound) {
            console.log(`[DeviceScanner] ⚠️  ${deviceName} already in list (id: ${peripheral.id}, existing: ${alreadyFound.name})`);
          } else {
            console.log(`[DeviceScanner] ✓ Found BLE device by name: ${deviceName} (RSSI: ${rssi}, id: ${peripheral.id})`);
            
            foundDevices.push({
              type: 'ble',
              path: `BLE:${deviceName}`,
              name: deviceName,
              peripheral: peripheral,
              serviceUUID: config.serviceUUID,
              txCharUUID: config.txCharUUID,
              rxCharUUID: config.rxCharUUID,
              rssi: peripheral.rssi,
              address: peripheral.address,
              id: peripheral.id,
            });
          }
        }
        // If service UUID is advertised (rare on macOS)
        else if (hasNordicUART) {
          const deviceKey = deviceName || `Nordic-UART-${peripheral.address.slice(-8)}`;
          
          if (!foundDevices.find(d => d.id === peripheral.id)) {
            console.log(`[DeviceScanner] ✓ Found Nordic UART device: ${deviceKey} (RSSI: ${rssi}, id: ${peripheral.id})`);
            
            foundDevices.push({
              type: 'ble',
              path: `BLE:XIAO-IMU`,
              name: deviceKey,
              peripheral: peripheral,
              serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
              txCharUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
              rxCharUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
              rssi: peripheral.rssi,
              address: peripheral.address,
              id: peripheral.id,
            });
          }
        }
      });

      // If BLE is already powered on, start immediately
      if (noble.state === 'poweredOn') {
        this.bleReady = true;
        startScan();
      }
    });
  }

  /**
   * Get all discovered devices
   * @returns {Array}
   */
  getDevices() {
    return this.devices;
  }

  /**
   * Get devices by type
   * @param {string} type - 'serial' or 'ble'
   * @returns {Array}
   */
  getDevicesByType(type) {
    return this.devices.filter(d => d.type === type);
  }

  /**
   * Find a device by path
   * @param {string} path - Device path
   * @returns {Object|null}
   */
  findDeviceByPath(path) {
    return this.devices.find(d => d.path === path) || null;
  }
}

module.exports = DeviceScanner;
