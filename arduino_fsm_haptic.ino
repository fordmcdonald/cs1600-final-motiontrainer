#include <Wire.h>
#include "Adafruit_DRV2605.h"
#include <ArduinoBLE.h>

// -------------------- WATCHDOG SUPPORT (ADDED) --------------------
extern "C" void wdtISR(void);
extern "C" void ourISR(void);

void initWDT();
void petWDT();
void updateWarningIndicator();

constexpr uint8_t WATCHDOG_HEARTBEAT_CMD = 0x48;  // 'H'
constexpr unsigned long WARNING_BLINK_INTERVAL_MS = 250;
constexpr int WARNING_LED_PIN = LED_BUILTIN;
constexpr uint8_t WDT_CLOCK_DIV = 0b1000;   // LOCO/4 ≈ 8.192 kHz
constexpr uint8_t WDT_TIMEOUT_SEL = 0b11;   // 8192 cycles ≈ 1.0 s at LOCO/4

volatile bool gWatchdogFault = false;
volatile bool gWatchdogPrimed = false;
unsigned long gWarningBlinkLastToggle = 0;
bool gWarningBlinkState = false;


const unsigned int WDT_INT = 30;


const unsigned int D3_PORT = 1;
const unsigned int D3_PIN = 5;


const unsigned int D3_IRQ = 0; 

const unsigned int CPU_INT_1 = 31;


// -------------------- HAPTIC (DRV2605) --------------------
Adafruit_DRV2605 drv;

// -------------------- BLE --------------------
BLEService hapticService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic hapticChar(
  "19B10001-E8F2-537E-4F6C-D104768A1214",
  BLEWrite | BLERead,
  1  // 1 byte command channel
);

// -------------------- FSM DEFINITIONS --------------------
enum HapticState {
  S_INIT = 0,
  S_ADVERTISING,
  S_CONNECTED_OFF,
  S_CONNECTED_ON
};

struct HapticFSMState {
  HapticState state;
  bool bleInitialized;
  bool advertising;
  bool centralConnected;
  bool motorOn;
  bool thresholdActive;
  String centralAddress;
};

struct HapticInputs {
  bool centralConnected;
  bool centralJustConnected;
  bool centralJustDisconnected;
  bool thresholdActive;
  bool thresholdUpdated;
  BLEDevice central;
};

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

  drv.setWaveform(0, effect);  // effect index
  drv.setWaveform(1, 0);       // end of sequence
  drv.go();
}

void stopHapticEffect() {
  drv.setWaveform(0, 0);
  drv.setWaveform(1, 0);
  drv.go();
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
}

void ensureAdvertising(HapticFSMState &state) {
  if (!state.bleInitialized) {
    return;
  }
  if (!state.advertising) {
    BLE.advertise();
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
      petWDT();
      break;
    }

    case S_ADVERTISING: {
      ensureAdvertising(ret);
      if (inputs.centralJustConnected) {
        ret.state = S_CONNECTED_OFF;
        handleConnectionEstablished(ret, inputs.central);
      }
      petWDT();
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
  Serial.begin(115200);
  while (!Serial && millis() < 5000) {
    delay(10);
  }

  // Setting up IRQ on D3

  R_PFS->PORT[D3_PORT].PIN[D3_PIN].PmnPFS = R_PFS->PORT[D3_PORT].PIN[D3_PIN].PmnPFS & (~R_PFS_PORT_PIN_PmnPFS_ISEL_Msk) | R_PFS_PORT_PIN_PmnPFS_ISEL_Msk;

  R_ICU->IRQCR[D3_IRQ] = 1;

  R_ICU->IELSR[CPU_INT_1] = 1;


   NVIC_SetVector((IRQn_Type) CPU_INT_1, (uint32_t) &ourISR);
   NVIC_SetPriority((IRQn_Type) CPU_INT_1, 13);
   NVIC_EnableIRQ((IRQn_Type) CPU_INT_1);


  Serial.println("Setting up BLE + Haptics with FSM...");

  if (!drv.begin()) {
    Serial.println("Could not find DRV2605, check wiring!");
    while (1) {
      delay(10);
    }
  }

  drv.selectLibrary(1);
  drv.setMode(DRV2605_MODE_INTTRIG);

  pinMode(WARNING_LED_PIN, OUTPUT);          // WATCHDOG ADDITION
  digitalWrite(WARNING_LED_PIN, LOW);        // WATCHDOG ADDITION
  initWDT();                                 // WATCHDOG ADDITION
  Serial.println("init done");
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

    if (value == WATCHDOG_HEARTBEAT_CMD) {       // WATCHDOG ADDITION
      petWDT();                                  // WATCHDOG ADDITION
      thresholdUpdated = false;                  // WATCHDOG ADDITION
      thresholdActive = fsmState.thresholdActive;  // WATCHDOG ADDITION
    } else {
      thresholdActive = value > 0;
      thresholdUpdated = true;
    }
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

// -------------------- WATCHDOG IMPLEMENTATION --------------------
void initWDT() {
  // Configure Watchdog Timer (interrupt on underflow, ~1.0 s periodd

  R_WDT->WDTCR =
    (0b1000 << R_WDT_WDTCR_CKS_Pos) |   // PCLKB/8192
    (0b11   << R_WDT_WDTCR_TOPS_Pos) |  // 8192 cycles
    (0b11   << R_WDT_WDTCR_RPSS_Pos) |
    (0b11   << R_WDT_WDTCR_RPES_Pos);

  Serial.print("WDTCR = 0x");
  Serial.println(R_WDT->WDTCR, HEX);

  R_WDT->WDTSR = 0;                       // Clear status flags
  R_WDT->WDTRCR = 0;                      // Disable hardware reset on underflow

  R_ICU->IELSR[WDT_INT] = 0x025;          // Map WDT to ICU interrupt line
  NVIC_SetVector((IRQn_Type)WDT_INT, (uint32_t)wdtISR);
  NVIC_SetPriority((IRQn_Type)WDT_INT, 14);
  NVIC_EnableIRQ((IRQn_Type)WDT_INT);

  petWDT();
}

void petWDT() {


  R_WDT->WDTRR = 0x00;
  R_WDT->WDTRR = 0xFF;
}


extern "C" void ourISR(void) {

  Serial.println("ourISR running...");
  // Drive built-in LED LOW immediately
  analogWrite(WARNING_LED_PIN, 0);

  static int timesPushed = 0; // static means value persists between function calls
  Serial.println(timesPushed++);

  // TODO: Clear the pending interrupt flag (Prelab Q4.8) on the MCU side
  R_ICU->IELSR_b[CPU_INT_1].IR = 0;
  // Clear the pending interrupt on the CPU side
  NVIC_ClearPendingIRQ((IRQn_Type) CPU_INT_1);

  while(true) {
  }

}

extern "C" void wdtISR(void) {
  // petWDT(); 
  // gWatchdogFault = true;
  Serial.println("WOOF");
  while(true) {
    for (int i = 0; i < 256; i+= 10) {
      analogWrite(WARNING_LED_PIN, i);
      delay(100);
    }
  }
}
