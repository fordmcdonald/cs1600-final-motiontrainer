/*
 * A struct to keep all three state inputs in one place
 */
typedef struct {
  bool tryInitializedBLE;
  bool centralConnected;
  bool centralJustConnected;
  bool centralJustDisconnected;
  bool thresholdUpdated;
  bool thresholdActive;
} state_inputs;

bool testTransition(HapticFSMState start,
                    HapticFSMState end,
                    state_inputs inputs,
                    bool verbos);
/*        
 * Helper function for printing states
 */
char* s2str(HapticState s) {
  switch(s) {
    case S_INIT:
    return "(1) INIT";
    case S_ADVERTISING:
    return "(2) ADVERTISING";
    case S_CONNECTED_OFF:
    return "(3) CONNECTED_OFF";
    case S_CONNECTED_ON:
    return "(4) CONNECTED_ON";
    default:
    return "???";
  }
}

char* bool2str(bool b) {
  if (b) {
    return "TRUE";
  } else {
    return "FALSE";
  }
}

/*
 * Given a start state (including state variables), inputs, tests that
 * updateFSM returns the correct end state and updates the state variables correctly
 * returns true if this is the case (test passed) and false otherwise (test failed)
 * 
 * Need to use "verbos" instead of "verbose" because verbose is apparently a keyword
 */
bool testTransition(HapticFSMState start,
                    HapticFSMState end,
                    state_inputs inputs,
                    bool verbos) {

  HapticInputs input = {
    inputs.centralConnected,
    inputs.centralJustConnected,
    inputs.centralJustDisconnected,
    inputs.thresholdActive,
    inputs.thresholdUpdated,
    BLEDevice()
  };

  HapticFSMState res = updateFSM(start, input);

  bool passedTest =  (res.bleInitialized == end.bleInitialized &&
                      res.advertising == end.advertising &&
                      res.centralConnected == end.centralConnected &&
                      res.motorOn == end.motorOn &&
                      res.thresholdActive == end.thresholdActive &&
                      res.state == end.state);
  if (! verbos) {
    return passedTest;
  } else if (passedTest) {
    char sToPrint[200];
    sprintf(sToPrint, "Test from %s to %s PASSED", s2str(start.state), s2str(end.state));
    Serial.println(sToPrint);
    return true;
  } else {
    char sToPrint[200];
    sprintf(sToPrint, "Test from %s to %s FAILED", s2str(start.state), s2str(end.state));
    Serial.println(sToPrint);
    sprintf(sToPrint, "End state expected: %s | actual: %s", s2str(end.state), s2str(res.state));
    Serial.println(sToPrint);
    sprintf(sToPrint, "Inputs: centralConnected %d | centralJustConnected %d | centralJustDisconnected %d | thresholdActive %d | thresholdUpdated %d", input.centralConnected, input.centralJustConnected, input.centralJustDisconnected, input.thresholdActive, input.thresholdUpdated);
    Serial.println(sToPrint);
    sprintf(sToPrint, "          %14s | %11s | %16s | %7s | %15s", "bleInitialized", "advertising", "centralConnected", "motorOn", "thresholdActive");
    Serial.println(sToPrint);
    sprintf(sToPrint, "starting: %14s | %11s | %16s | %7s | %15s", bool2str(start.bleInitialized), bool2str(start.advertising), bool2str(start.centralConnected), bool2str(start.motorOn), bool2str(start.thresholdActive));
    Serial.println(sToPrint);
    sprintf(sToPrint, "expected: %14s | %11s | %16s | %7s | %15s", bool2str(end.bleInitialized), bool2str(end.advertising), bool2str(end.centralConnected), bool2str(end.motorOn), bool2str(end.thresholdActive));
    Serial.println(sToPrint);
    sprintf(sToPrint, "actual:   %14s | %11s | %16s | %7s | %15s", bool2str(res.bleInitialized), bool2str(res.advertising), bool2str(res.centralConnected), bool2str(res.motorOn), bool2str(res.thresholdActive));
    Serial.println(sToPrint);
    Serial.println("");
    return false;
  }
}

/*
 * REPLACE THE FOLLOWING 4 LINES WITH THE GENERATED TEST CASES
 */
const HapticFSMState testStatesIn[0] = {};

const HapticFSMState testStatesOut[0] = {};

const state_inputs testInputs[0] = {};

const int numTests = 0;


/*
 * Runs through all the test cases defined above
 */
bool testAll() {
  #ifndef TESTING
  Serial.println("Testing not compiled. Need to #define TESTING!");
  return false;
  #else // TESTING defined!
  for (int i = 0; i < numTests; i++) {
    Serial.print("Running test ");
    Serial.print(i + 1);
    Serial.print(" of ");
    Serial.println(numTests);
    if (!testTransition(testStatesIn[i], testStatesOut[i], testInputs[i], true)) {
      return false;
    }
    Serial.println();
  }
  Serial.println("All tests passed!");
  return true;
  #endif // #ifndef TESTING
}