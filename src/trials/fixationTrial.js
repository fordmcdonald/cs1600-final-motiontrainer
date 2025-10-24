import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import { SerialPositionInputPlugin } from "../plugins/plugin-serial-position-fixation.ts"

const provideFeedback = (result) => {

  if (result) {    
    return `
    <div id="balloon-container">
      <div id="balloon-area">
        <div id="feedback-win">
          <h1>🏆 You Won! 🏆</h1>
        </div>
      </div>
    </div>
    `;

  } else {
    return `
      <div id="feedback-loss">
        <h1>Try again!</h1>
        <h1>Remember to stay still.</h1>
      </div>
    `;
  }
};

let tryAgain = false;
let fixationTimeoutId;

const createFixationTrial = (jsPsych) => ({
  timeline: [
    {
      type: SerialPositionInputPlugin,
      stimulus: "", // Start with an empty stimulus
      on_load: async function () {
        // Fetch the SVG content asynchronously and set it as the stimulus
        const currentSettings = await window.electronAPI.fetchCurrentSettings();
        const imagePath = window.electronAPI.getFilePath(currentSettings.fixationGraphic);
        const svgContent = await generateFixationSVG(imagePath);
        const displayElement = jsPsych.getDisplayElement();
        displayElement.innerHTML = svgContent;

        fixationTimeoutId = setTimeout(() => {
          fixationTimeoutId = null;
          jsPsych.finishTrial({ result: true });
        }, currentSettings.fixationDuration * 1000);
      },
      on_finish: function () {
        // Cancel any pending timeouts when the trial ends
        if (fixationTimeoutId) {
          clearTimeout(fixationTimeoutId);
          fixationTimeoutId = null;
        }
        window.electronAPI.removeSendDataListeners(); 
      }
    },
    {
      type: htmlKeyboardResponse,
      choices: ['Enter'],
      trial_duration: 5000,
      stimulus: () => {
        // Retrieve the result of the previous trial
        const lastTrialData = jsPsych.data.getLastTrialData().values()[0];
        const resultMessage = provideFeedback(lastTrialData.result);

        tryAgain = !lastTrialData.result;

        const displayElement = jsPsych.getDisplayElement();

        // HTML for the feedback animation
        const feedbackHTML = `
        <div>
          ${resultMessage}
        </div>
      `;

        if (lastTrialData.result) {   
          // Append this HTML to the DOM
          displayElement.innerHTML = feedbackHTML;

          const applausePath = window.electronAPI.getPath(["assets", "applause-cheer-236786.mp3"])
          const audio = new Audio(applausePath);
          audio.play().catch((error) => console.error("Audio playback failed:", error));

          // Define the animation logic
          const createAndAnimateBalloons = () => {
            const balloonContainer = document.getElementById("balloon-area");

            function random(num) {
              return Math.floor(Math.random() * num);
            }

            function getRandomStyles() {
              const r = random(255);
              const g = random(255);
              const b = random(255);
              const mt = random(200);
              const ml = random(50);
              const dur = random(5) + 5;
              return `
                background-color: rgba(${r},${g},${b},0.7);
                box-shadow: inset -7px -3px 10px rgba(${r - 10},${g - 10},${b - 10},0.7);
                margin: ${mt}px 0 0 ${ml}px;
                animation: float ${dur}s ease-in infinite;
              `;
            }

            function createBalloons(num) {
              for (let i = num; i > 0; i--) {
                const balloon = document.createElement("div");
                balloon.className = "balloon";
                balloon.style.cssText = getRandomStyles();
                balloonContainer.appendChild(balloon);
              }
            }

            function removeBalloons() {
              balloonContainer.style.opacity = 0;
              setTimeout(() => {
                balloonContainer.remove();

                jsPsych.finishTrial();
              }, 500);
            }

            // Add balloons on load
            createBalloons(30);

                        // Enable key responses and set up cleanup after 5 seconds minimum
            setTimeout(() => {
              // Set up keydown listener for immediate response after delay
              const keyHandler = () => {
                document.removeEventListener("keydown", keyHandler);
                removeBalloons();
              };
              document.addEventListener("keydown", keyHandler);
            }, 5000);
            
          };

          // Delay execution to allow DOM rendering
          setTimeout(createAndAnimateBalloons, 0);
        }

        // Return the feedback HTML
        return feedbackHTML;
      },
      response_ends_trial: false,
    },
  ],
  loop_function: () => {
    window.electronAPI.setGameTolerance("fixation")
    return tryAgain;
  },
});

async function generateFixationSVG(imagePath){
  return `
    <svg id="target" height="100" width="100">
      <image href="${imagePath}" x="0" y="0" height="100" width="100" preserveAspectRatio="xMidYMid meet" />
    </svg>
  `;
}

export { createFixationTrial };
