const PolhemusDriver = require("./drivers/polhemusDriver");
const FastTrakDriver = require("./drivers/fastTrakDriver");
const SeeedSenseDriver = require("./drivers/seeedSenseDriver");
const MockDriver = require("./drivers/mockDriver");

module.exports = {
    // To register a device, add "<path>": DriverClass for each device
    "/dev/tty.usbserial-A10NW3TT": PolhemusDriver, 
    "COM6": FastTrakDriver,
    "/dev/tty.usbmodem2101": SeeedSenseDriver,  // Serial connection
    "BLE:XIAO-IMU": SeeedSenseDriver,           // BLE connection
    "mockPath": MockDriver,
    // Add more devices as needed
};