const PolhemusDriver = require("./drivers/polhemusDriver");
const FastTrakDriver = require("./drivers/fastTrakDriver");
const SeeedSenseDriver = require("./drivers/seeedSenseDriver");

module.exports = {
    // To register a device, add "<path>": DriverClass for each device
    "/dev/tty.usbserial-A10NW3TT": PolhemusDriver, 
    "COM6": FastTrakDriver,
    "/dev/tty.usbmodem2101": SeeedSenseDriver,  // Serial connection
    
    // Multiple BLE IMU sensors - each with unique name
    "BLE:XIAO-IMU-1": SeeedSenseDriver,      // Sensor 1
    "BLE:XIAO-IMU-2": SeeedSenseDriver,     // Sensor 2
    // Add more IMU devices as needed
};