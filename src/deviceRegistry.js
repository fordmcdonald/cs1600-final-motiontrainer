const PolhemusDriver = require("./drivers/polhemusDriver");
const FastTrakDriver = require("./drivers/fastTrakDriver");
const SeeedSenseDriver = require("./drivers/seeedSenseDriver");

module.exports = {
    // To register a device, add "<path>": DriverClass for each device
    "/dev/tty.usbserial-A10NW3TT": PolhemusDriver, 
    "COM6": FastTrakDriver,
    "/dev/tty.usbmodem2101": SeeedSenseDriver,
    // Add more devices as needed
};