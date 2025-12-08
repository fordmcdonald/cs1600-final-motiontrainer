#include <Wire.h>
#include <ArduinoBLE.h>

#include "arduino_fsm.h"

#ifndef TESTING
#include "Adafruit_DRV2605.h"
#endif

// -------------------- HAPTIC (DRV2605) --------------------
#ifndef TESTING
Adafruit_DRV2605 drv;
#endif

// -------------------- BLE --------------------
BLEService hapticService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic hapticChar(
  "19B10001-E8F2-537E-4F6C-D104768A1214",
  BLEWrite | BLERead,
  1 
);

// -------------------- FSM Static Variables --------------------
static HapticFSMState fsmState = {
  S_INIT,
  false,   // bleInitialized
  false,   // advertising
  false,   // centralConnected
  false,   // motorOn
  false,   // thresholdActive
  String("")
};

static bool gServiceConfigured = false;
static bool prevCentralConnected = false;

// -------------------- HELPERS --------------------
void playHapticEffect(uint8_t effect) {
  Serial.print("Playing haptic effect #");
  Serial.println(effect);

  #ifndef TESTING
  drv.setWaveform(0, effect);  // effect index
  drv.setWaveform(1, 0);       // end of sequence
  drv.go();
  #endif
}

void stopHapticEffect() {
  #ifndef TESTING
  drv.setWaveform(0, 0);
  drv.setWaveform(1, 0);
  drv.go();
  #endif
}

bool configureBLEStack() {
  if (gServiceConfigured) {
    return true;
  }

  BLE.setLocalName("UnoR4-Haptic");
  BLE.setAdvertisedService(hapticService);

  hapticService.addCharacteristic(hapticChar);
  BLE.addService(hapticService);

  uint8_t defaultValue = 0;
  hapticChar.writeValue(&defaultValue, 1);

  gServiceConfigured = true;
  return true;
}

bool tryInitializeBLE(HapticFSMState &state) {
  #ifdef TESTING
  // Use centralAddress variable to mock tryInitializeBLE behavior in FSM unit test
  if (state.centralAddress == "") {
    state.bleInitialized = true;
    return true;
  } else {
    return false;
  }

  #else
  
  if (state.bleInitialized) {
    return true;
  }

  Serial.println("Attempting BLE initialization...");
  if (!BLE.begin()) {
    Serial.println("BLE initialization failed, will retry...");
    return false;
  }

  configureBLEStack();

  state.bleInitialized = true;
  Serial.println("BLE initialization successful");
  return true;
  #endif
}

void ensureAdvertising(HapticFSMState &state) {
  if (!state.bleInitialized) {
    return;
  }
  if (!state.advertising) {
    #ifndef TESTING
    BLE.advertise();
    #endif
    state.advertising = true;
    Serial.println("BLE peripheral advertising as UnoR4-Haptic");
  }
}

void handleConnectionEstablished(HapticFSMState &state, const BLEDevice &central) {
  state.centralConnected = true;
  state.advertising = false;
  if (central) {
    state.centralAddress = central.address();
    Serial.print("Connected to central: ");
    Serial.println(state.centralAddress);
  } else {
    state.centralAddress = String("");
    Serial.println("Connected to central (unknown address)");
  }
}

void handleDisconnection(HapticFSMState &state) {
  if (state.centralConnected) {
    Serial.print("Disconnected from central: ");
    Serial.println(state.centralAddress);
  }
  state.centralConnected = false;
  state.centralAddress = String("");
  state.thresholdActive = false;
  if (state.motorOn) {
    state.motorOn = false;
    stopHapticEffect();
    Serial.println("Motor OFF");
  }
  state.state = S_ADVERTISING;
  state.advertising = false;
  ensureAdvertising(state);
}

// -------------------- FSM UPDATE --------------------
HapticFSMState updateFSM(HapticFSMState currState, const HapticInputs &inputs) {
  HapticFSMState ret = currState;

  if (inputs.thresholdUpdated) {
    ret.thresholdActive = inputs.thresholdActive;
  }

  switch (currState.state) {
    case S_INIT: {
      if (tryInitializeBLE(ret)) {
        ret.state = S_ADVERTISING;
        ensureAdvertising(ret);
      }
      break;
    }

    case S_ADVERTISING: {
      ensureAdvertising(ret);
      if (inputs.centralJustConnected) {
        ret.state = S_CONNECTED_OFF;
        handleConnectionEstablished(ret, inputs.central);
      }
      break;
    }

    case S_CONNECTED_OFF: {
      if (inputs.centralJustDisconnected || (!inputs.centralConnected && currState.centralConnected)) {
        handleDisconnection(ret);
        break;
      }

      if (inputs.thresholdUpdated && inputs.thresholdActive) {
        ret.state = S_CONNECTED_ON;
        ret.motorOn = true;
        Serial.println("Motor ON");
        playHapticEffect(53);
      }
      break;
    }

    case S_CONNECTED_ON: {
      if (inputs.centralJustDisconnected || (!inputs.centralConnected && currState.centralConnected)) {
        handleDisconnection(ret);
        break;
      }

      if (inputs.thresholdUpdated && !inputs.thresholdActive) {
        ret.state = S_CONNECTED_OFF;
        ret.motorOn = false;
        Serial.println("Motor OFF");
        stopHapticEffect();
      } else if (inputs.thresholdUpdated && inputs.thresholdActive) {
        // reinforce motor command when new high signal arrives
        playHapticEffect(53);
      }
      break;
    }

    default:
      Serial.println("Invalid FSM state encountered, resetting to INIT.");
      ret = {S_INIT, false, false, false, false, false, String("")};
      break;
  }

  ret.centralConnected = inputs.centralConnected &&
                         (ret.state == S_CONNECTED_OFF || ret.state == S_CONNECTED_ON);

  return ret;
}

// -------------------- ARDUINO LIFECYCLE --------------------
void setup() {
  #ifdef TESTING
  Serial.begin(9600);
  #else
  Serial.begin(115200);
  #endif
  while (!Serial && millis() < 5000) {
    delay(10);
  }
  Serial.println("Setting up BLE + Haptics with FSM...");

  #ifdef TESTING
  testAll();
  while(true);
  
  #else

  if (!drv.begin()) {
    Serial.println("Could not find DRV2605, check wiring!");
    while (1) {
      delay(10);
    }
  }

  drv.selectLibrary(1);
  drv.setMode(DRV2605_MODE_INTTRIG);
  #endif
}

void loop() {
  if (fsmState.bleInitialized) {
    BLE.poll();
  }

  BLEDevice central;
  bool centralConnected = false;
  bool centralJustConnected = false;
  bool centralJustDisconnected = false;

  if (fsmState.bleInitialized) {
    central = BLE.central();
    centralConnected = central;
    centralJustConnected = centralConnected && !prevCentralConnected;
    centralJustDisconnected = !centralConnected && prevCentralConnected;
    prevCentralConnected = centralConnected;
  } else {
    prevCentralConnected = false;
  }

  bool thresholdActive = fsmState.thresholdActive;
  bool thresholdUpdated = false;

  if (fsmState.bleInitialized && hapticChar.written()) {
    uint8_t value = 0;
    hapticChar.readValue(&value, 1);

    Serial.print("Got BLE value: ");
    Serial.println(value);

    thresholdActive = value > 0;
    thresholdUpdated = true;
  }

  HapticInputs inputs = {
    centralConnected,
    centralJustConnected,
    centralJustDisconnected,
    thresholdActive,
    thresholdUpdated,
    central
  };

  fsmState = updateFSM(fsmState, inputs);

  delay(10);
}
