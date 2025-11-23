#include <ArduinoBLE.h>

const int LED_PIN = 3;  // PWM pin

// Custom service/characteristic UUIDs
BLEService ledService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic ledChar(
  "19B10001-E8F2-537E-4F6C-D104768A1214",
  BLEWrite | BLERead,
  1  // 1 byte
);

void setup() {
  pinMode(LED_PIN, OUTPUT);

  Serial.begin(115200);
  // DON'T block forever waiting for Serial
  delay(1500);
  Serial.println("Setting up BLE...");

  if (!BLE.begin()) {
    Serial.println("starting BLE failed!");
    // don't lock up silently — keep printing
    while (1) {
      Serial.println("BLE failed, check board/lib");
      delay(2000);
    }
  }

  BLE.setLocalName("UnoR4-LED");
  BLE.setAdvertisedService(ledService);

  ledService.addCharacteristic(ledChar);
  BLE.addService(ledService);

  uint8_t v = 0;
  ledChar.writeValue(&v, 1);

  BLE.advertise();
  Serial.println("BLE LED peripheral, advertising as UnoR4-LED");
}

void loop() {
  // IMPORTANT: keep BLE stack serviced
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to central: ");
    Serial.println(central.address());

    while (central.connected()) {
      // service BLE events
      BLE.poll();

      if (ledChar.written()) {
        uint8_t value = 0;
        ledChar.readValue(&value, 1);

        Serial.print("Got value: ");
        Serial.println(value);

        analogWrite(LED_PIN, value);
      }
    }

    Serial.print("Disconnected from central: ");
    Serial.println(central.address());
  }

  // if no central, you can still poll
  BLE.poll();
}
