//#define TESTING

// -------------------- FSM DEFINITIONS --------------------
enum HapticState {
  S_INIT = 1,
  S_ADVERTISING = 2,
  S_CONNECTED_OFF = 3,
  S_CONNECTED_ON = 4
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
