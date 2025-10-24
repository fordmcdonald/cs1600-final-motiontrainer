import React from "react";
import "@fortawesome/fontawesome-free/css/all.css";
import "bootstrap/dist/css/bootstrap.css";
import "jspsych/css/jspsych.css";
import "./index.css";
import "./App.css";

import { config, taskSettings, turkUniqueId } from "../config/main";
import { getProlificId, getSearchParam } from "../lib/utils";

import { addToFirebase, validateParticipant } from "./deployments/firebase";

import Error from "./components/Error";
import JsPsychExperiment from "./components/JsPsychExperiment";
import SplashPage from "./components/SplashPage";
import GameSelection from "./components/GameSelection";
import GameSettings from "./components/GameSettings"; 
import About from './components/About';

const VIEWS = {
  ERROR: "ERROR",
  SPLASH: "SPLASH",
  ABOUT: "ABOUT",
  LOGIN: "LOGIN",
  SETTINGS: "SETTINGS", 
  SELECTION: "SELECTION",
  EXPERIMENT: "EXPERIMENT",
};

export default function App() {
  const [ipcRenderer, setIpcRenderer] = React.useState();
  const [psiturk, setPsiturk] = React.useState(false);
  const [participantID, setParticipantID] = React.useState("");
  const [studyID, setStudyID] = React.useState("");
  const [currentMethod, setMethod] = React.useState("default");
  const [view, setView] = React.useState(VIEWS.SPLASH);
  const [selectedGameIdx, setSelectedGameIdx] = React.useState("");


  React.useEffect(() => {
    localStorage.removeItem("settings");        
    localStorage.removeItem("selectedConfig");  
    localStorage.removeItem("savedSnapshot");
  }, []);

  React.useEffect(() => {
    console.log({
      "Honeycomb Configuration": config,
      "Task Settings": taskSettings,
    });

    if (config.USE_ELECTRON) {
      const { ipcRenderer } = window.require("electron");
      setIpcRenderer(ipcRenderer);
      ipcRenderer.send("updateEnvironmentVariables", config);
      const credentials = ipcRenderer.sendSync("syncCredentials");
      if (credentials.participantID) setParticipantID(credentials.participantID);
      if (credentials.studyID) setStudyID(credentials.studyID);
      setMethod("desktop");
    } else {
      if (config.USE_MTURK) {
        window.lodash = _.noConflict();
        setPsiturk(new PsiTurk(turkUniqueId, "/complete"));
        setMethod("mturk");
        handleLogin("mturk", turkUniqueId);
      } else if (config.USE_PROLIFIC) {
        const pID = getProlificId();
        if (config.USE_FIREBASE && pID) {
          setMethod("firebase");
          handleLogin("prolific", pID);
        } else {
          setView(VIEWS.ERROR);
        }
      } else if (config.USE_FIREBASE) {
        const maybeStudyID = getSearchParam("studyID");
        const maybeParticipantID = getSearchParam("participantID");
        if (maybeStudyID !== null) setStudyID(maybeStudyID);
        if (maybeParticipantID !== null) setParticipantID(maybeParticipantID);
        setMethod("firebase");
      } else {
        setMethod("default");
      }
    }
  }, []);

  /** VALIDATION FUNCTIONS */

  const defaultValidation = async () => true;
  const firebaseValidation = (studyId, participantId) => {
    return validateParticipant(studyId, participantId);
  };

  /** DATA WRITE FUNCTIONS */

  const defaultFunction = () => {};
  const firebaseUpdateFunction = (data) => {
    addToFirebase(data);
  };
  const desktopUpdateFunction = (data) => {
    ipcRenderer.send("data", data);
  };
  const psiturkUpdateFunction = (data) => {
    psiturk.recordTrialData(data);
  };

  /** EXPERIMENT FINISH FUNCTIONS */

  const defaultFinishFunction = (data) => {
    data.localSave("csv", "neuro-task.csv");
  };
  const desktopFinishFunction = () => {
    ipcRenderer.send("end", "true");
  };
  const psiturkFinishFunction = () => {
    const completePsiturk = async () => {
      psiturk.saveData({
        success: () => psiturk.completeHIT(),
        error: () => setView(VIEWS.ERROR),
      });
    };
    completePsiturk();
  };

  /** CALLBACK FUNCTIONS */

  const handleLogin = React.useCallback((studyId, participantId) => {
    setStudyID(studyId);
    setParticipantID(participantId);
    setView(VIEWS.SETTINGS); 
  }, []);

  const handleContinue = () => {
    setView(VIEWS.SELECTION);
  };

  const handleSettingsComplete = () => {
    setView(VIEWS.SELECTION); 
  };

  const handleSelect = (game) => {
    if (game == -1) {
      setView(VIEWS.SETTINGS);
    } else {
      setSelectedGameIdx(game);
      setView(VIEWS.EXPERIMENT);
    }
  };

  const handleExperimentFinish = () => {
    setSelectedGameIdx(0);
    setView(VIEWS.SELECTION);
  };

  const handleShowAbout = () => setView(VIEWS.ABOUT);
  const handleBackToSplash = () => setView(VIEWS.SPLASH);

  switch (view) {
    case VIEWS.ERROR:
      return <Error />;
    case VIEWS.SPLASH:
      return <SplashPage onContinue={handleContinue} onAbout={handleShowAbout} />;
    case VIEWS.ABOUT:
      return <About onBack={handleBackToSplash} />;
    case VIEWS.SETTINGS: 
      return <GameSettings onComplete={handleSettingsComplete} />;
    case VIEWS.SELECTION:
      return <GameSelection onSelect={handleSelect} />;
    case VIEWS.EXPERIMENT:
      return (
        <JsPsychExperiment
          studyID={studyID}
          participantID={participantID}
          selectedGameIdx={selectedGameIdx}
          onFinish={handleExperimentFinish}
          dataUpdateFunction={
            {
              desktop: desktopUpdateFunction,
              firebase: firebaseUpdateFunction,
              mturk: psiturkUpdateFunction,
              default: defaultFunction,
            }[currentMethod]
          }
          dataFinishFunction={
            {
              desktop: desktopFinishFunction,
              mturk: psiturkFinishFunction,
              firebase: defaultFunction,
              default: defaultFinishFunction,
            }[currentMethod]
          }
        />
      );
    default:
      console.error("Invalid view state", view);
      return null;
  }
}
