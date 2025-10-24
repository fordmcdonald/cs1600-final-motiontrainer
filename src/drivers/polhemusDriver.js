const { SerialPort } = require("serialport");
const BaseDriver = require("./baseDriver");


class PolhemusDriver extends BaseDriver {

  parseData(data, plotWindow) {
    // Parse Polhemus-specific data, e.g., position (x, y, z)
    const values = data.trim().split(/\s+/).map(Number);

    const positionData = {
      type: "position",
      id: values[0],
      x: values[1] * 10,
      y: values[2] * 10,
      z: values[3] * 10,
      angleX: values[4],
      angleY: values[5],
      angleZ: values[6],
    };

    this.positionBuffer.push(positionData);
    if (this.positionBuffer.length > this.positionBufferSize) {
      this.positionBuffer.shift();
    }

    if (this.positionBuffer.length < this.positionBufferSize) {
      return false; 
    }

    if (plotWindow) {
      // Send the position data to the plot window
      plotWindow.webContents.send("plot-serial-data", {
        x: positionData.x,
        y: positionData.y,
        z: positionData.z,
      });
    }

    const start = this.positionBuffer.length - 1 - (this.settings.lagDelta + this.settings.windowSize);
    const end = start + this.settings.windowSize;
    this.previousWindow = this.positionBuffer.slice(start, end);

    // Calculate the average position of the previous window
    const avgX =
      this.previousWindow.reduce((sum, point) => sum + point.x, 0) /
        this.previousWindow.length || positionData.x; 
    const avgY =
      this.previousWindow.reduce((sum, point) => sum + point.y, 0) /
        this.previousWindow.length || positionData.y;
    const avgZ =
      this.previousWindow.reduce((sum, point) => sum + point.z, 0) /
        this.previousWindow.length || positionData.z;

    // Calculate displacement magnitude relative to the average
    const deltaX = positionData.x - avgX;
    const deltaY = positionData.y - avgY;
    const deltaZ = positionData.z - avgZ;
    const displacementMagnitude = Math.sqrt(
      deltaX ** 2 + deltaY ** 2 + deltaZ ** 2
    );

    // Log the new data for debugging
    if (process.env.ELECTRON_START_URL) {
      console.log("Displacement Magnitude:", displacementMagnitude, {
        avgX,
        avgY,
        avgZ,
        x: positionData.x,
        y: positionData.y,
        z: positionData.z,
        windowLength: this.previousWindow.length,
        window: this.previousWindow,
      });
    }

    // Check if displacement magnitude exceeds the threshold
    if (displacementMagnitude > this.tolerance) {
      return {brokeThreshold: true, thresholdPct: 1}; 
    }

    return {brokeThreshold: false, thresholdPct: displacementMagnitude / this.tolerance };
  }

  initializeDevice() {

    this.port = new SerialPort({ 
              path: this.portInfo.path, 
              baudRate: 115200,
              dataBits: 8,
              parity: 'none',
              stopBits: 1,
              flowControl: false})

    this.port.write("l1,1\r", (err) => {
      if (err) {
        return console.log("Error on setting units:", err.message);
      }
    });

    this.port.write("O1,2,1\r", (err) => {
      if (err) {
        return console.log("Error on setting units:", err.message);
      }
    });

    
    this.port.write("I1,0.0\r", (err) => {
      if (err) {
        return console.log("Error on setting units:", err.message);
      }
    });

    // Send the 'C' command to start continuous print output
    this.port.write("C\r", (err) => {
      if (err) {
        return console.log("Error on write:", err.message);
      }
    });

    // Send the 'U' command to set units (0=inches, 1=centimeters)
    this.port.write("U1\r", (err) => {
      if (err) {
        return console.log("Error on setting units:", err.message);
      }
    });
  }
}

module.exports = PolhemusDriver;
