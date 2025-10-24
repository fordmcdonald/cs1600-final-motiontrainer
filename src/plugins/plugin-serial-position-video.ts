import { JsPsych, JsPsychPlugin, ParameterType, TrialType } from "jspsych";

const info = <const>{
  name: "video-keyboard-response",
  parameters: {
    stimulus: {
      type: ParameterType.VIDEO,
      pretty_name: "Video",
      default: undefined,
      array: true,
    },
    prompt: {
      type: ParameterType.HTML_STRING,
      pretty_name: "Prompt",
      default: null,
    },
    width: {
      type: ParameterType.INT,
      pretty_name: "Width",
      default: "",
    },
    height: {
      type: ParameterType.INT,
      pretty_name: "Height",
      default: "",
    },
    autoplay: {
      type: ParameterType.BOOL,
      pretty_name: "Autoplay",
      default: true,
    },
    controls: {
      type: ParameterType.BOOL,
      pretty_name: "Controls",
      default: false,
    },
    start: {
      type: ParameterType.FLOAT,
      pretty_name: "Start",
      default: null,
    },
    stop: {
      type: ParameterType.FLOAT,
      pretty_name: "Stop",
      default: null,
    },
    rate: {
      type: ParameterType.FLOAT,
      pretty_name: "Rate",
      default: 1,
    },
    trial_ends_after_video: {
      type: ParameterType.BOOL,
      pretty_name: "End trial after video finishes",
      default: false,
    },
    trial_duration: {
      type: ParameterType.INT,
      pretty_name: "Trial duration",
      default: null,
    },
    timeout: {
      type: ParameterType.INT,
      pretty_name: "Video Timeout",
      default: 3000,
    }
  },
};

type Info = typeof info;

class VideoSerialDataPlugin implements JsPsychPlugin<Info> {
  static info = info;
  private debounceTimeout: NodeJS.Timeout | null = null; 

  constructor(private jsPsych: JsPsych) {}

  /** END TRIAL METHOD **/
  end_trial(display_element: HTMLElement, trial: TrialType<Info>, response: any) {
    this.jsPsych.pluginAPI.clearAllTimeouts();
    this.jsPsych.pluginAPI.cancelAllKeyboardResponses();
    window.electronAPI.removeSendDataListeners(); 

    const video_element = display_element.querySelector<HTMLVideoElement>(
      "#jspsych-video-keyboard-response-stimulus"
    );
    if (video_element) {
      video_element.pause();
      video_element.onended = null;
    }

    const trial_data = {
      rt: response.rt,
      stimulus: trial.stimulus,
      response: response.key,
    };

    display_element.innerHTML = "";
    this.jsPsych.finishTrial(trial_data);
  }

  trial(display_element: HTMLElement, trial: TrialType<Info>) {

    this.escapeHandler = this.escapeTimeline.bind(this)
    window.addEventListener("keydown", this.escapeHandler.bind(this));

    // Validate stimulus
    if (!Array.isArray(trial.stimulus)) {
      throw new Error("The stimulus property must be an array of files.");
    }

    this.serialDataHandler = (data) => this.checkSerialPosition(data, trial);
    window.electronAPI.onSendData(this.serialDataHandler);

    // Set up video HTML
    let video_html = `
    <div style="position: relative; display: inline-block;">
      <video id="jspsych-video-keyboard-response-stimulus"
        ${trial.width ? `width="${trial.width}"` : ""}
        ${trial.height ? `height="${trial.height}"` : ""}
        ${trial.autoplay && trial.start == null ? "autoplay" : ""}
        ${trial.controls ? "controls" : ""}
        ${trial.start !== null ? 'style="visibility: hidden;"' : ""}
      >
        ${trial.stimulus.map(file => `<source src="${file}" type="video/${file.split(".").pop()?.toLowerCase()}">`).join("")}
      </video>
      
      <!-- Stay Still Message Overlay -->
      <div id="jspsych-stay-still-message" 
        style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
               background: white; color: black; font-size: 112px; padding: 40px; 
               border-radius: 10px; display: none; text-align: center;
               font-weight: bold;">
        Stay still!
      </div>
    </div>
  `;

    if (trial.prompt) video_html += trial.prompt;

    display_element.innerHTML = video_html;

    const video_element = display_element.querySelector<HTMLVideoElement>(
      "#jspsych-video-keyboard-response-stimulus"
    );

    let response = { rt: null, key: null };

    /** Event Handlers **/
    const after_response = (info) => {
      if (response.key == null) response = info;
      if (trial.response_ends_trial) {
        this.end_trial(display_element, trial, response);
      }
    };

    const check_stop = () => {
      if (video_element.currentTime >= trial.stop) {
        video_element.pause();
        this.end_trial(display_element, trial, response);
      }
    };

    // Configure video
    if (trial.start !== null) {
      video_element.onseeked = () => {
        video_element.style.visibility = "visible";
        video_element.play();
      };
      video_element.currentTime = trial.start;
    }
    video_element.playbackRate = trial.rate;

    if (trial.stop !== null) {
      video_element.addEventListener("timeupdate", check_stop);
    }

    video_element.onended = () => {
      if (trial.trial_ends_after_video) {
        this.end_trial(display_element, trial, response);
      }
    };

    // Response listener
    if (trial.choices !== "NO_KEYS") {
      this.jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: after_response,
        valid_responses: trial.choices,
        rt_method: "performance",
        persist: false,
        allow_held_key: false,
      });
    }

    if (trial.trial_duration !== null) {
      this.jsPsych.pluginAPI.setTimeout(() => {
        this.end_trial(display_element, trial, response);
      }, trial.trial_duration);
    }
  }
  

  checkSerialPosition(data, trial: TrialType<Info>) {
    const video_element = document.querySelector<HTMLVideoElement>("#jspsych-video-keyboard-response-stimulus");
    const message_element = document.querySelector<HTMLElement>("#jspsych-stay-still-message");
  
    // Pause video and show message immediately
    if (video_element) {
      video_element.pause();
      video_element.style.visibility = "hidden";
    }
  
    if (message_element) {
      message_element.style.display = "flex";
    }
  
    // Clear previous timeout if it exists
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
  
    // Start a new timeout
    this.debounceTimeout = setTimeout(() => {
      if (video_element) {
        video_element.style.visibility = "visible";
        video_element.play();
      }
      if (message_element) {
        message_element.style.display = "none"; 
      }
  
      this.debounceTimeout = null;
    }, trial.timeout);
  }
  


  escapeTimeline(e) {
    if (e.key === "Escape"){
      window.removeEventListener("keydown", this.escapeHandler);
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout)
        this.debounceTimeout = null
      }
      window.electronAPI.removeSendDataListeners(); 
      this.jsPsych.endExperiment();
    }
  }
  
}

export { VideoSerialDataPlugin };
