// #define TESTING

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
