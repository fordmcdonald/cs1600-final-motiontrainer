const { contextBridge, ipcRenderer } = require('electron')

/** Load bridges between the main and renderer processes for the fusion plot window */
process.once("loaded", () => {
  contextBridge.exposeInMainWorld('electronAPI', {
    onFusionData: (callback) => ipcRenderer.on('fusion-data', (_event, value) => callback(value)),
  });
});
let eventCount = 0;
let motionTimeout = null;

// Chart configuration
const maxDataPoints = 100;
const chartData = {
  delta: {
    labels: [],
    datasets: []
  },
  magnitude: {
    labels: [],
    datasets: []
  }
};

// Device colors
const deviceColors = [
  'rgba(74, 222, 128, 1)',   // Green
  'rgba(59, 130, 246, 1)',   // Blue
  'rgba(251, 146, 60, 1)',   // Orange
  'rgba(236, 72, 153, 1)',   // Pink
  'rgba(168, 85, 247, 1)',   // Purple
  'rgba(34, 211, 238, 1)',   // Cyan
];

// Initialize charts when page loads
window.addEventListener('DOMContentLoaded', () => {
  console.log('[FusionPlot] Initializing charts...');
  
  // Delta Magnitude Chart
  const deltaCtx = document.getElementById('deltaChart').getContext('2d');
  deltaChart = new Chart(deltaCtx, {
    type: 'line',
    data: chartData.delta,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'ΔMagnitude (m/s²)',
            color: 'white'
          },
          ticks: { color: 'white' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        x: {
          display: false
        }
      },
      plugins: {
        legend: {
          labels: { color: 'white' }
        }
      }
    }
  });
  
  // Total Magnitude Chart
  const magCtx = document.getElementById('magnitudeChart').getContext('2d');
  magnitudeChart = new Chart(magCtx, {
    type: 'line',
    data: chartData.magnitude,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Total Magnitude (m/s²)',
            color: 'white'
          },
          ticks: { color: 'white' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        x: {
          display: false
        }
      },
      plugins: {
        legend: {
          labels: { color: 'white' }
        }
      }
    }
  });
  
  console.log('[FusionPlot] Charts initialized');
});

// Listen for fusion data from main process
if (window.electronAPI) {
  window.electronAPI.onFusionData((fusionData) => {
    updateVisualization(fusionData);
  });
} else {
  console.warn('[FusionPlot] electronAPI not available, using fallback');
  // Fallback for development
  window.addEventListener('message', (event) => {
    if (event.data.type === 'fusion-data') {
      updateVisualization(event.data.payload);
    }
  });
}

function updateVisualization(fusionData) {
  console.log('[FusionPlot] Received fusion data:', fusionData);
  
  // Update status bar
  document.getElementById('device-count').textContent = fusionData.deviceCount;
  document.getElementById('fusion-mode').textContent = fusionData.mode.charAt(0).toUpperCase() + fusionData.mode.slice(1);
  
  const calibrationEl = document.getElementById('calibration-status');
  if (fusionData.calibrated) {
    calibrationEl.textContent = '✅';
    calibrationEl.classList.remove('inactive');
    calibrationEl.classList.add('active');
  } else {
    calibrationEl.textContent = '⏳';
    calibrationEl.classList.remove('active');
    calibrationEl.classList.add('inactive');
  }
  
  // Update motion indicator
  const motionCircle = document.getElementById('motion-circle');
  const motionText = document.getElementById('motion-text');
  const fusedDelta = document.getElementById('fused-delta');
  
  fusedDelta.textContent = fusionData.fusedDeltaMagnitude.toFixed(3);
  
  if (fusionData.fusedBrokeThreshold && fusionData.calibrated) {
    eventCount++;
    document.getElementById('event-count').textContent = eventCount;
    
    motionCircle.textContent = '🎯';
    motionCircle.classList.add('triggered');
    motionText.textContent = 'MOTION DETECTED!';
    motionText.style.color = '#4ade80';
    motionText.style.fontWeight = 'bold';
    
    // Clear previous timeout
    if (motionTimeout) clearTimeout(motionTimeout);
    
    // Reset after 1 second
    motionTimeout = setTimeout(() => {
      motionCircle.textContent = '👁️';
      motionCircle.classList.remove('triggered');
      motionText.textContent = 'Monitoring...';
      motionText.style.color = 'white';
      motionText.style.fontWeight = 'normal';
    }, 1000);
  }
  
  // Update device list
  updateDeviceList(fusionData.devices);
  
  // Update charts
  updateCharts(fusionData);
}

function updateDeviceList(devices) {
  const deviceList = document.getElementById('device-list');
  
  // Clear existing
  deviceList.innerHTML = '';
  
  devices.forEach((device, index) => {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.style.borderLeft = `4px solid ${deviceColors[index % deviceColors.length]}`;
    
    const statusIcon = device.isCalibrated ? '✅' : '⏳';
    const thresholdIcon = device.brokeThreshold ? '🔴' : '🟢';
    
    card.innerHTML = `
      <div class="device-name">${device.deviceId} ${statusIcon}</div>
      <div class="device-status">${thresholdIcon} ${device.isCalibrated ? 'Calibrated' : 'Calibrating...'}</div>
      <div class="device-delta">${(device.deltaMagnitude || 0).toFixed(3)}</div>
      <div style="font-size: 10px; opacity: 0.7;">m/s²</div>
    `;
    
    deviceList.appendChild(card);
  });
}

function updateCharts(fusionData) {
  const timestamp = new Date().toLocaleTimeString();
  
  // Initialize datasets if needed
  if (chartData.delta.datasets.length === 0) {
    // Add fused line
    chartData.delta.datasets.push({
      label: 'Fused',
      data: [],
      borderColor: 'rgba(255, 255, 255, 1)',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 3,
      tension: 0.4
    });
    
    chartData.magnitude.datasets.push({
      label: 'Avg Magnitude',
      data: [],
      borderColor: 'rgba(255, 255, 255, 1)',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 3,
      tension: 0.4
    });
    
    // Add individual device lines
    fusionData.devices.forEach((device, index) => {
      const color = deviceColors[index % deviceColors.length];
      
      chartData.delta.datasets.push({
        label: device.deviceId,
        data: [],
        borderColor: color,
        backgroundColor: color.replace('1)', '0.1)'),
        borderWidth: 2,
        tension: 0.4
      });
      
      chartData.magnitude.datasets.push({
        label: device.deviceId,
        data: [],
        borderColor: color,
        backgroundColor: color.replace('1)', '0.1)'),
        borderWidth: 2,
        tension: 0.4
      });
    });
  }
  
  // Add new data points
  chartData.delta.labels.push(timestamp);
  chartData.magnitude.labels.push(timestamp);
  
  // Fused delta
  chartData.delta.datasets[0].data.push(fusionData.fusedDeltaMagnitude);
  chartData.magnitude.datasets[0].data.push(fusionData.avgMagnitude);
  
  // Individual devices
  fusionData.devices.forEach((device, index) => {
    chartData.delta.datasets[index + 1].data.push(device.deltaMagnitude || 0);
    chartData.magnitude.datasets[index + 1].data.push(device.magnitude || 0);
  });
  
  // Limit data points
  if (chartData.delta.labels.length > maxDataPoints) {
    chartData.delta.labels.shift();
    chartData.magnitude.labels.shift();
    chartData.delta.datasets.forEach(ds => ds.data.shift());
    chartData.magnitude.datasets.forEach(ds => ds.data.shift());
  }
  
  // Update charts
  deltaChart.update();
  magnitudeChart.update();
}
