const PolhemusDriver = require("./drivers/polhemusDriver");
const FastTrakDriver = require("./drivers/fastTrakDriver");
const SeeedSenseDriver = require("./drivers/seeedSenseDriver");
const RandomizedMockDriver = require("./drivers/randomizedMockDriver");
const TriggeredMockDriver = require("./drivers/triggeredMockDriver");

module.exports = {
    // To register a device, add "<path>": DriverClass for each device
    // Multiple BLE IMU sensors - each with unique name
    "BLE:XIAO-IMU-1": SeeedSenseDriver,      // Sensor 1
    "BLE:XIAO-IMU-2": SeeedSenseDriver,     // Sensor 2
    // "mockPath": RandomizedMockDriver,
    // "triggeredMockPath": TriggeredMockDriver,
    // "/dev/tty.usbmodem2101": SeeedSenseDriver,  // Serial connection
};