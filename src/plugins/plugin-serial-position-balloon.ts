import { JsPsych, JsPsychPlugin, ParameterType, TrialType } from "jspsych";

const info = <const>{
    name: "serial-position-input",
    parameters: {
      stimulus: {
        type: ParameterType.HTML_STRING,
        pretty_name: "Stimulus",
        default: undefined,
      },
      balloonSize: {
        type: ParameterType.INT,
        pretty_name: "Balloon Size",
        default: 50,
      },
      currentStage: {
        type: ParameterType.INT,
        pretty_name: "Current Stage",
        default: 0,
      },
      balloonFeedback: {
        type: ParameterType.BOOL,
        pretty_name: "Balloon Feedback",
        default: false,
      }
    }
}

type Info = typeof info;

class SerialPositionInputPlugin implements JsPsychPlugin<Info> {
  static info = info;
  private hueShift: number = 120; 
  private saturationShift: number = 100;
  private brightnessShift: number = 1  ;
  private balloonSize: number = 50;  
  private currentStage: number = 0;  
  private balloonFeedback: boolean = false;

  constructor(private JsPsych: JsPsych) {}

  trial(display_element: HTMLElement, trial: TrialType<Info>) {

    this.escapeHandler = this.escapeTimeline.bind(this)
    window.addEventListener("keydown", this.escapeHandler.bind(this));

    this.balloonSize = trial.balloonSize;  
    this.currentStage = trial.currentStage;  
    this.balloonFeedback = trial.balloonFeedback;
    display_element.innerHTML = generateBalloonAndNailSVG(this.balloonFeedback, this.balloonSize, this.hueShift);

    // Delay adding keydown listener to prevent event propagation triggering inflateBalloon
    setTimeout(() => {
      this.keydownHandler = this.inflateBalloon(display_element).bind(this);
      window.addEventListener("keydown", this.keydownHandler);
    }, 50);

    this.serialDataHandler = (data) => this.checkSerialPosition(data);
    window.electronAPI.onSendData(this.serialDataHandler);

    if (this.balloonFeedback) {
      window.electronAPI.onThresholdPct((value) => {
    
          value = Math.max(0, Math.min(1, value));

          // Linearly interpolate hue from 120° (green) to 0° (red)
          this.hueShift = 120 * (1 - value);

          // Brightness peaks at hue = 60, drops off toward 30 and 90
          if (this.hueShift <= 90 && this.hueShift >= 30) {
            const center = 60;
            const range = 30; // 60 - 30 or 90 - 60
            const distanceFromCenter = (this.hueShift - center) / range; // -1 to 1
            this.brightnessShift = 1.25 + (1 - distanceFromCenter ** 2) * (2.5 - 1.25);
          } else {
            this.brightnessShift = 1.25;
          }
    
          display_element.innerHTML = generateBalloonAndNailSVG(this.balloonFeedback, this.balloonSize, this.hueShift, this.saturationShift, this.brightnessShift);
      
      });
    } else {
      this.hueShift = 0;
      this.saturationShift = 100 ;
      this.brightnessShift = 1;
    }
  }

  escapeTimeline(e) {
    if (e.key === "Escape"){
      window.removeEventListener("keydown", this.escapeHandler);
      window.removeEventListener("keydown", this.keydownHandler);
      window.electronAPI.removeSendDataListeners(); 
      window.electronAPI.removeSendThresholdListeners();
      this.JsPsych.endExperiment();
    }
  }

  inflateBalloon( display_element) {

    const inflationPath = window.electronAPI.getPath(["assets", "whooshin.wav"]);
    const popPath = window.electronAPI.getPath(["assets", "balloon-pop-48030.mp3"]);

    const inflateAudio = new Audio(inflationPath);
    const popAudio = new Audio(popPath);

    return (event) => {
      this.currentStage += 1;  // Increment current stage
      this.balloonSize += 10;  // Increase balloon size dynamically

      inflateAudio.currentTime = 0; 
      inflateAudio.play().catch((error) => console.error("Audio playback failed:", error));

      // Update balloon display with the new size
      display_element.innerHTML = generateBalloonAndNailSVG(this.balloonFeedback, this.balloonSize, this.hueShift, this.saturationShift, this.brightnessShift);

      window.electronAPI.notifyButtonPress(this.currentStage, 31);

      if (this.balloonSize >= 360 ) {
        this.result = true;

        popAudio.currentTime = 0; 
        popAudio.play().catch((error) => console.error("Audio playback failed:", error));

        // End the trial
        window.removeEventListener("keydown", this.keydownHandler);
        window.electronAPI.removeSendDataListeners(); 
        window.electronAPI.removeSendThresholdListeners();
        this.JsPsych.finishTrial({ result: this.result });
      }
    };
  }


    checkSerialPosition(data) {
      this.result = false

      const deflatePath = window.electronAPI.getPath(["assets", "balloon-deflate-83447.mp3"])
      const audio = new Audio(deflatePath);
      audio.currentTime = 0; 
      audio.play().catch((error) => console.error("Audio playback failed:", error));
      
      // Record result in jsPsych data and end the trial
      window.removeEventListener("keydown", this.keydownHandler);
      window.electronAPI.removeSendDataListeners(); 
      window.electronAPI.removeSendThresholdListeners();
      this.JsPsych.finishTrial({ result: this.result });
    }

    checkMousePosition(event) {
      //console.log("checkMousePosition")
      const svgRect = document.getElementById("jspsych-content").getBoundingClientRect();
    
      const withinX =
        event.clientX >= svgRect.left && event.clientX <= svgRect.right;
      const withinY =
        event.clientY >= svgRect.top && event.clientY <= svgRect.bottom;
    

      if (!withinX || !withinY) {
        // Reset balloon size if mouse is outside the specified area
        window.removeEventListener("mousemove", () => {});
        window.removeEventListener("keydown", () => {});
        this.JsPsych.finishTrial()
      }
    }
    
}


const generateBalloonAndNailSVG = (balloonFeedback, balloonSize, hueShift, saturationShift, brightnessShift) => {
  const svgWidth = 1000;
  const svgHeight = 1000;

  const nailX = svgWidth / 2;
  const nailY = 200;

  const maxBalloonSize = svgHeight - nailY - 50; 
  const adjustedBalloonSize = Math.min(balloonSize, maxBalloonSize);

  // The balloon's bottom should align with the nail's top
  const balloonBottomY = nailY + 50; 
  const balloonTopY = balloonBottomY - adjustedBalloonSize * 1.5; 

  const balloonPath = window.electronAPI.getPath(["assets", "balloon-clipart.svg"])
  const nailPath = window.electronAPI.getPath(["assets", "nail.png"])

  // Balloon clip art
  const balloonSVG = `
    <image 
      href="${balloonPath}" 
      x="${nailX - adjustedBalloonSize / 2}" 
      y="${balloonTopY + 500}" 
      width="${adjustedBalloonSize}" 
      height="${adjustedBalloonSize * 1.5}" 
      preserveAspectRatio="xMidYMid meet"
      style="filter: hue-rotate(${hueShift}deg) saturate(${saturationShift}%) brightness(${brightnessShift});" />`
  ;

  // Nail image
  const nailSVG = `
    <image 
      href="${nailPath}" 
      x="${nailX - 25}" 
      y="${nailY}" 
      width="50" 
      height="50" 
      preserveAspectRatio="xMidYMid meet" />`
  ;

  return `
    <svg id="balloon-game" height="${svgHeight}" width="${svgWidth}">
      ${nailSVG}
      ${balloonSVG}
    </svg>`
  ;
};




export { SerialPositionInputPlugin };