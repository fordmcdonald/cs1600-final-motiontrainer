#include <Wire.h>
#include "Adafruit_DRV2605.h"
#include <ArduinoBLE.h>

// -------------------- HAPTIC (DRV2605) --------------------
Adafruit_DRV2605 drv;

// -------------------- BLE --------------------
// Keeping same UUIDs so your phone app doesn't need to change
BLEService hapticService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic hapticChar(
  "19B10001-E8F2-537E-4F6C-D104768A1214",
  BLEWrite | BLERead,
  1  // 1 byte
);

// -------------------- SETUP --------------------
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("Setting up BLE + Haptics (no LED)...");

  // ---- HAPTIC SETUP ----
  if (!drv.begin()) {
    Serial.println("Could not find DRV2605, check wiring!");
    while (1) {
      delay(10);
    }
  }

  drv.selectLibrary(1);
  // Internal trigger when sending GO command
  drv.setMode(DRV2605_MODE_INTTRIG);

  // ---- BLE SETUP ----
  if (!BLE.begin()) {
    Serial.println("starting BLE failed!");
    while (1) {
      Serial.println("BLE failed, check board/lib");
      delay(2000);
    }
  }

  BLE.setLocalName("UnoR4-Haptic");
  BLE.setAdvertisedService(hapticService);

  hapticService.addCharacteristic(hapticChar);
  BLE.addService(hapticService);

  // Default value
  uint8_t v = 0;
  hapticChar.writeValue(&v, 1);

  BLE.advertise();
  Serial.println("BLE peripheral advertising as UnoR4-Haptic");
}

// -------------------- HAPTIC HELPER --------------------
void playHapticEffect(uint8_t effect) {

  Serial.print("Playing haptic effect #");
  Serial.println(effect);

  // Set first waveform slot to our effect
  drv.setWaveform(0, effect);  // effect index
  drv.setWaveform(1, 0);       // end of sequence

  // Fire it
  drv.go();
}

// -------------------- LOOP --------------------
void loop() {
  // Wait for a central device
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to central: ");
    Serial.println(central.address());

    while (central.connected()) {
      // Keep BLE stack serviced
      BLE.poll();

      if (hapticChar.written()) {
        uint8_t value = 0;
        hapticChar.readValue(&value, 1);

        Serial.print("Got BLE value: ");
        Serial.println(value);

        // Trigger haptic effect only
        playHapticEffect(53);
      }
    }

    Serial.print("Disconnected from central: ");
    Serial.println(central.address());
  }

  // If no central, still poll so we continue advertising/responding
  BLE.poll();
}
