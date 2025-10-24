import { JsPsych, JsPsychPlugin, ParameterType, TrialType } from "jspsych";

const info = <const>{
    name: "serial-position-input",
    parameters: {
      stimulus: {
        type: ParameterType.HTML_STRING,
        pretty_name: "Stimulus",
        default: undefined,
      }
    }
}

type Info = typeof info;

class SerialPositionInputPlugin implements JsPsychPlugin<Info> {
    static info = info;

    constructor(private JsPsych: JsPsych) {
        this.JsPsych = JsPsych;
    }

    trial(display_element: HTMLElement, trial: TrialType<Info> ) {

      this.escapeHandler = this.escapeTimeline.bind(this)
      window.addEventListener("keydown", this.escapeHandler.bind(this));

      // Bind the event handler so that the same instance is used for adding and removing listeners
      this.serialDataHandler = (data) => this.checkSerialPosition(data);
      window.electronAPI.onSendData(this.serialDataHandler);
        
      display_element.innerHTML = trial.stimulus
    }

    checkSerialPosition(data) {
      this.result = false

      const userLostAudioPath = window.electronAPI.getPath(["assets", "cartoon-fail-trumpet-278822.mp3"])
      const audio = new Audio(userLostAudioPath);
      audio.currentTime = 0; 
      audio.play().catch((error) => console.error("Audio playback failed:", error));

      // Record result in jsPsych data and end the trial
      window.electronAPI.removeSendDataListeners(); 
      this.JsPsych.finishTrial({ result: this.result });
    }

    escapeTimeline(e) {
      if (e.key === "Escape"){
        window.removeEventListener("keydown", this.escapeHandler);
        window.electronAPI.removeSendDataListeners(); 
        this.JsPsych.endExperiment();
      }
    }

    
}


export { SerialPositionInputPlugin };