#include <ArduinoBLE.h>

BLEService testService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLEDoubleCharacteristic ledCharacteristic("19B10001-E8F2-537E-4F6C-D104768A1214", BLEWrite);

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
  while (!Serial);

  if (!BLE.begin()) {
    Serial.println("Starting BLE failed!");
    while (1);
  }

  BLE.setLocalName("MyArduinoV2");
  BLE.setAdvertisedService(testService);
  testService.addCharacteristic(ledCharacteristic);
  BLE.addService(testService);

  // ledCharacteristic.writeValue("Hello iPhone!");
  BLE.advertise();

  Serial.println("BLE Peripheral now advertising!");
}

void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to central: ");
    Serial.println(central.address());

    while (central.connected()) {
      if (ledCharacteristic.written()) {
        // digitalWrite(LED_BUILTIN, ledCharacteristic.value());
        Serial.print("Received: ");
        Serial.println(ledCharacteristic.value());
      }
    }

    Serial.println("Central disconnected");
  }
}
