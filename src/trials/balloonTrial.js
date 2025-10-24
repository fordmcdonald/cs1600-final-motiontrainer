import htmlKeyboardResponse from "@jspsych/plugin-html-keyboard-response";
import { SerialPositionInputPlugin } from "../plugins/plugin-serial-position-balloon.ts"


const generateBalloonAndNailSVG = (balloonSize) => {
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
      style="filter: hue-rotate(120deg);" />
  `;

  // Nail image
  const nailSVG = `
    <image 
      href="${nailPath}" 
      x="${nailX - 25}" 
      y="${nailY}" 
      width="50" 
      height="50" 
      preserveAspectRatio="xMidYMid meet" />
  `;

  return `
    <svg id="balloon-game" height="${svgHeight}" width="${svgWidth}">
      ${nailSVG}
      ${balloonSVG}
    </svg>
  `;
};


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



let balloonSize = 50;
let currentStage = 0;

let tryAgain = false;

const createBalloonTrial = async (jsPsych) => {

  const currentSettings = await window.electronAPI.fetchCurrentSettings();  
  return {

    timeline: [
    {
      type: SerialPositionInputPlugin,
      stimulus: generateBalloonAndNailSVG(balloonSize),
      balloonSize: balloonSize,
      currentStage: currentStage,
      balloonFeedback: currentSettings.balloonFeedback,
    },
    {
      type: htmlKeyboardResponse,
      choices: "NO_KEYS", // Disable all key responses initially
      trial_duration: null, // Remove automatic trial end
      stimulus: () => {
        // Retrieve the result of the previous trial
        const lastTrialData = jsPsych.data.getLastTrialData().values()[0];
        const resultMessage = provideFeedback(lastTrialData.result);

        tryAgain = !lastTrialData.result;

        const displayElement = jsPsych.getDisplayElement();

        // HTML for the balloon animation
        const balloonHTML = `
        <div>
          ${resultMessage}
        </div>
      `;

      if (lastTrialData.result) {
        // Append this HTML to the DOM
        displayElement.innerHTML = balloonHTML;

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

      } else {
        // For failure case, also enforce 5-second minimum display
        displayElement.innerHTML = balloonHTML;
        
        // Play failure sound
        const buzzerPath = window.electronAPI.getPath(["assets", "buzzer-227217.mp3"]);
        const audio = new Audio(buzzerPath);
        audio.play().catch((error) => console.error("Audio playback failed:", error));
        
        // Finish trial after 5 seconds minimum
        setTimeout(() => {
          jsPsych.finishTrial();
        }, 5000);
      }

      // Return the feedback HTML
      return balloonHTML;
      },
      response_ends_trial: false, 
    }
    ],

    loop_function: () => {
      window.electronAPI.setGameTolerance("balloon")
      return tryAgain;
    },
  }};

export { createBalloonTrial } ;