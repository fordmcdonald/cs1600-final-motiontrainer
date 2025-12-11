#include "LSM6DS3.h"
#include "Wire.h"
#include <bluefruit.h>

// IMU instance
LSM6DS3 myIMU(I2C_MODE, 0x6A);    // I2C device address 0x6A

// BLE UART service
BLEUart bleuart;

// Forward declaration
void startAdv();

// setup(): Initialize Serial, IMU (LSM6DS3), BLE stack, UART service, and start advertising.
// Inputs: none
// Outputs: none
// Side effects: Configures Bluefruit name/tx power, begins BLEUart.

void setup() {
  // Debug serial
  Serial.begin(115200);
  while (!Serial) { }

  Serial.println("XIAO nRF52840: IMU + BLE UART");
  Serial.println("-----------------------------");

  // ----- IMU INIT -----
  if (myIMU.begin() != 0) {
    Serial.println("IMU Device error");
  } else {
    Serial.println("IMU Device OK!");
  }

  // ----- BLE INIT -----
  Bluefruit.begin();
  Bluefruit.setName("XIAO-IMU-1");  // Name that shows up in device registry
  Bluefruit.setTxPower(4);        

  // Start BLE UART service
  bleuart.begin();

  // Configure advertising
  startAdv();
}

void startAdv() {
  // Advertising packet
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.Advertising.addName();

  Bluefruit.ScanResponse.addName();  // put device name in scan response

  // Start advertising
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244); // 20 ms to ~152.5 ms
  Bluefruit.Advertising.setFastTimeout(30);   // fast mode for 30s
  Bluefruit.Advertising.start(0);             // 0 = advertise forever

  Serial.println("Advertising as XIAO-IMU (BLE UART)...");
}

// startAdv(): Configure advertising and scan response for BLE UART and device name, then start.
// Inputs: none
// Outputs: none
// Side effects: Starts advertising indefinitely with restart on disconnect.

void loop() {
  // Read accelerometer
  float ax = myIMU.readFloatAccelX();
  float ay = myIMU.readFloatAccelY();
  float az = myIMU.readFloatAccelZ();

  // (Optional) still print to Serial for debugging
  // Serial.print("Accel: ");
  // Serial.print(ax, 4);
  // Serial.print(", ");
  // Serial.print(ay, 4);
  // Serial.print(", ");
  // Serial.println(az, 4);

  // Only send over BLE if connected
  if (Bluefruit.connected()) {
    char buf[64];
    snprintf(buf, sizeof(buf), "ACC,%.4f,%.4f,%.4f\r\n", ax, ay, az);

    // Send over BLE UART
    bleuart.write((uint8_t*)buf, strlen(buf));
  }

  delay(100); 
}

// loop(): Sample accel at ~10 Hz and stream over BLE UART when connected.
// Inputs: none
// Outputs: none
// Side effects: Sends formatted ACC CSV lines via BLE UART.
