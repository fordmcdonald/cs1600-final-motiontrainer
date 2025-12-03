console.log("Rendering plot window");

// Initialize global variables

// map of device names to an array of their data
const rawData = {};
const labels = []; 
const previousWindow = [];
const displacementData = [];
const deviceOptions = new Set();
let movementThreshold = 5;
let windowSize = 3;
let count = 0; 
let lagSize = 20;
let movementCounts = 0;
let trippedWire = false; 

const mockDevices = ["testDevice1", "testDevice2"];


let thresholdCooldown = false; 

function brokeThreshold() {
  // If the function is in cooldown, do nothing
  if (thresholdCooldown) return;

  movementCounts++;

  // Update the label with the current movement count
  const breakCountElement = document.getElementById('break-count');
  breakCountElement.textContent = movementCounts;

  // Play buzzer audio
  const buzzerAudio = new Audio('/assets/wrong-47985.mp3');
  buzzerAudio.play();

  // Set trippedWire and start cooldown
  trippedWire = true;
  thresholdCooldown = true;

  // Reset cooldown after 250ms
  setTimeout(() => {
    thresholdCooldown = false;
  }, 250);
}

// Function to calculate the moving average
function movingAverage(data, windowSize) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((acc, val) => acc + val, 0) / slice.length;
    result.push(avg);
  }
  return result;
}


// Update devices dropdown with options
function updateDevicesDropdownOptions(options) {
  const select = document.getElementById('data-source');

  // clear any options
  select.innerHTML = '';

  select.size=options.length

  
  // for every device, add a select option
  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    opt.style.textAlign = "center";
    select.appendChild(opt);
  });
}

// Chart.js instance
const ctx = document.getElementById("displacementChart").getContext("2d");
const displacementChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: labels, // X-axis labels
    datasets: [
      {
        label: "Raw Displacement",
        data: displacementData,
        borderColor: "rgba(255, 99, 132, 0.8)",
        borderWidth: 1,
        fill: false,
        pointRadius: 2,
      },
      {
        label: `Moving Average (Window: ${windowSize})`,
        data: movingAverage(displacementData, windowSize),
        borderColor: "rgba(54, 162, 235, 0.8)",
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
      },
      {
        label: `Movement Threshold ${movementThreshold}`,
        data: Array(500).fill(movementThreshold),
        borderColor: "rgba(0, 0, 0, 0.8)",
        borderWidth: 3,
        fill: false,
        pointRadius: 0,
      }
    ],
  },
  options: {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: true },
      chartAreaBackground: {
        color: "rgba(240, 240, 240, 0.5)", 
      },
    },
    scales: {
      x: { title: { display: true, text: "Time / Index" } },
      y: { title: { display: true, text: "Displacement Magnitude" } },
    },
  },
  plugins: [
    {
      id: "chartAreaBackground",
      beforeDraw: (chart) => {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;

        // Check the `trippedWire` flag
        if (trippedWire) {
          // Set the background to red
          ctx.save();
          ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
          ctx.fillRect(
            chartArea.left,
            chartArea.top,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
          );
          ctx.restore();

          // Reset `trippedWire` after half a second
          setTimeout(() => {
            trippedWire = false; 
            chart.update(); 
          }, 500);
        } else {
          // Default background color
          ctx.save();
          ctx.fillStyle = chart.options.plugins.chartAreaBackground.color;
          ctx.fillRect(
            chartArea.left,
            chartArea.top,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
          );
          ctx.restore();
        }
      },
    },
  ],
});

// Function to handle new data from the serial device driver
const updateChartWithNewData = (dataPoint) => {
    // get selected devices
    const selectedDevices = Array.from(
        document.getElementById("data-source").selectedOptions
    ).map((opt) => opt.value);

    if (selectedDevices.length === 0) {
        return;
    }

    // calculate number of points based combined data from selected devices
    // if there's a distinction, use minimum number of points
    const numObservations = Math.min(
        ...selectedDevices.map((device) => rawData[device].length)
    );

    // data for each variable as an average of each sensor
    averagedDatapoints = {};

    for (let [key, value] of Object.entries(dataPoint)) {
        // for numerical categories, take average
        if (typeof value === "number") {
            // initialize each field as list of zeros for each observation
            if (!(key in averagedDatapoints)) {
                averagedDatapoints[key] = new Array(numObservations).fill(0);
            }

            // add sum of all datapoints and divide to take average
            for (let i = 0; i < numObservations; i++) {
                for (let device of selectedDevices) {
                    averagedDatapoints[key][i] += rawData[device][i][key];
                }
                averagedDatapoints[key][i] /= selectedDevices.length;
            }

            
        }
    }


    const start = numObservations - 1 - (lagSize + windowSize);
    const end = start + windowSize;


    // Calculate the average position of the previous window
    const avgX =
        averagedDatapoints.x.slice(start, end).reduce((sum, point) => sum + point, 0) /
        (end-start+1);
    const avgY =
        averagedDatapoints.y.slice(start, end).reduce((sum, point) => sum + point, 0) /
        (end-start+1);
    const avgZ =
        averagedDatapoints.z.slice(start, end).reduce((sum, point) => sum + point, 0) /
        (end-start+1);

    // Calculate displacement magnitude relative to the average of the previous window
    // TODO: change this to use the averaged value across devices
    // get most recent averaged datapoint across all devices

    const currX = selectedDevices.reduce((prevSum, currDevice) => prevSum + rawData[currDevice][rawData[currDevice].length-1].x , 0) / selectedDevices.length;
    const currY = selectedDevices.reduce((prevSum, currDevice) => prevSum + rawData[currDevice][rawData[currDevice].length-1].y , 0) / selectedDevices.length;
    const currZ = selectedDevices.reduce((prevSum, currDevice) => prevSum + rawData[currDevice][rawData[currDevice].length-1].z , 0) / selectedDevices.length;

    const deltaX = currX - avgX;
    const deltaY = currY - avgY;
    const deltaZ = currZ - avgZ;
    const displacementMagnitude = Math.sqrt(
        deltaX ** 2 + deltaY ** 2 + deltaZ ** 2
    );


    // Update the chart data
    displacementData.push(displacementMagnitude);
    labels.push(count++);

    if (displacementMagnitude > movementThreshold) {
        brokeThreshold();
    }

    // Limit data points to avoid performance issues
    for (let [device, data] of Object.entries(rawData)) {
        if (data.length> 500) {
            rawData[device].shift();
            labels.shift();
        }
    }

    // Update the moving average dataset
    displacementChart.data.datasets[1].data = movingAverage(
        displacementData,
        windowSize
    );

    // Update the chart
    displacementChart.update();
};

// Handle slider updates
const windowSlider = document.getElementById("window-size");
windowSlider.addEventListener("input", (e) => {
  windowSize = parseInt(e.target.value);
  document.getElementById("window-value").textContent = windowSize;

  // Update moving average dataset
  displacementChart.data.datasets[1].data = movingAverage(displacementData, windowSize);
  displacementChart.data.datasets[1].label = `Moving Average (Window: ${windowSize})`;

  displacementChart.update();
});


// Handle slider updates
const thresholdSlider = document.getElementById("movement-threshold");
thresholdSlider.addEventListener("input", (e) => {
  movementThreshold = parseInt(e.target.value);
  document.getElementById("threshold-value").textContent = movementThreshold;

  displacementChart.data.datasets[2].data = Array(500).fill(movementThreshold);;
  displacementChart.data.datasets[2].label = `Movement Threshold: ${movementThreshold}`;

  displacementChart.update();
});


// Handle slider updates
const lagSlider = document.getElementById("lag-size");
lagSlider.addEventListener("input", (e) => {
  lagSize = parseInt(e.target.value);
  document.getElementById("lag-value").textContent = lagSize;
  
});

// Electron API callback for receiving new serial data
window.electronAPI.onSendData((data) => {
    if (!(data.name in rawData)) {
        rawData[data.name] = [];
    }
    rawData[data.name].push(data);

    if (rawData[data.name].length > 600) {
        rawData[data.name].shift();
    }

    // get selected devices
    const selectedDevices = Array.from(
        document.getElementById("data-source").selectedOptions
    ).map((opt) => opt.value);

    // if we have enough data for calculations
    if (
        rawData[data.name].length >= lagSize + windowSize + 1 &&
        // current device is a selected one for data
        selectedDevices.includes(data.name) &&
        // we have an even amount of data from each selected device
        selectedDevices.every((device) => rawData[device].length === rawData[data.name].length)
    ) {
        updateChartWithNewData(data);
    }

    // update options for devices
    if (!(deviceOptions.has(data.name))) {
        deviceOptions.add(data.name);
        updateDevicesDropdownOptions(Array.from(deviceOptions));
    }
    
});




// Emulated Data 
// setInterval(() => {
//   updateChartWithNewData({
//     x: Math.floor(Math.random() * 10),
//     y: Math.floor(Math.random() * 10),
//     z: Math.floor(Math.random() * 10),
//   })
// }, 16)
