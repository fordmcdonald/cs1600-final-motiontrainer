const PolhemusDriver = require("./drivers/polhemusDriver");
const FastTrakDriver = require("./drivers/fastTrakDriver");

module.exports = {
    // To register a device, add "<path>": DriverClass for each device
    "/dev/tty.usbserial-A10NW3TT": PolhemusDriver, 
    "COM6": FastTrakDriver,
    // Add more devices as needed
};