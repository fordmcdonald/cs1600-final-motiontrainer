console.log("Rendering plot window");

// Initialize global variables
const rawData = [];
const labels = []; 
const previousWindow = [];
const rawPositionData = [];
let movementThreshold = 5;
let windowSize = 3;
let count = 0; 
let lagSize = 20;
let movementCounts = 0;
let trippedWire = false; 


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

// Chart.js instance
const ctx = document.getElementById("displacementChart").getContext("2d");
const displacementChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: labels, // X-axis labels
    datasets: [
      {
        label: "Raw Displacement",
        data: rawData,
        borderColor: "rgba(255, 99, 132, 0.8)",
        borderWidth: 1,
        fill: false,
        pointRadius: 2,
      },
      {
        label: `Moving Average (Window: ${windowSize})`,
        data: movingAverage(rawData, windowSize),
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
  const { x, y, z } = dataPoint;

  const start = rawPositionData.length - 1 - (lagSize + windowSize);
  const end = start + windowSize;
  const previousWindow = rawPositionData.slice(start, end);


  // Calculate the average position of the previous window
  const avgX =
    previousWindow.reduce((sum, point) => sum + point.x, 0) / previousWindow.length;
  const avgY =
    previousWindow.reduce((sum, point) => sum + point.y, 0) / previousWindow.length;
  const avgZ =
    previousWindow.reduce((sum, point) => sum + point.z, 0) / previousWindow.length;

  // Calculate displacement magnitude relative to the average of the previous window
  const deltaX = x - avgX;
  const deltaY = y - avgY;
  const deltaZ = z - avgZ;
  const displacementMagnitude = Math.sqrt(deltaX ** 2 + deltaY ** 2 + deltaZ ** 2);


  // Update the chart data
  rawData.push(displacementMagnitude);
  labels.push(count++); 

  if (displacementMagnitude > movementThreshold){
    brokeThreshold()
  }

  // Limit data points to avoid performance issues
  if (rawData.length > 500) {
    rawData.shift();
    labels.shift();
  }

  // Update the moving average dataset
  displacementChart.data.datasets[1].data = movingAverage(rawData, windowSize);

  // Update the chart
  displacementChart.update();

};

// Handle slider updates
const windowSlider = document.getElementById("window-size");
windowSlider.addEventListener("input", (e) => {
  windowSize = parseInt(e.target.value);
  document.getElementById("window-value").textContent = windowSize;

  // Update moving average dataset
  displacementChart.data.datasets[1].data = movingAverage(rawData, windowSize);
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
  rawPositionData.push(data);

  if (rawPositionData.length > 600 ) {
    rawPositionData.shift();
  }

  if (rawPositionData.length >= lagSize + windowSize + 1) {
    updateChartWithNewData(data);
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
