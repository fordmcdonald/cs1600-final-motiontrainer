import { enterFullscreen, exitFullscreen } from "../trials/fullscreen";
import {
  createDebriefTrial,
  finishTrial,
  welcomeTrial,
} from "../trials/honeycombTrials";
//import { createHoneycombBlock } from "./honeycombBlock";
import { createBalloonTrial } from "../trials/balloonTrial";
import { createFixationTrial } from "../trials/fixationTrial";
import { createVideoTrial } from "../trials/videoTrial";

/**
 * This timeline builds the example reaction time task from the jsPsych tutorial.
 * Take a look at how the code here compares to the jsPsych documentation!
 *
 * See the jsPsych documentation for more: https://www.jspsych.org/7.3/tutorials/rt-task/
 */
async function createHoneycombTimeline(jsPsych, selectedGame) {
  //const honeycombTrials = createHoneycombBlock(jsPsych); // The first block repeats 5 times
  const debriefTrial = createDebriefTrial(jsPsych);
  const balloonTrial = await createBalloonTrial(jsPsych);
  const fixationTrail = createFixationTrial(jsPsych);
  const videoTrial = await createVideoTrial(jsPsych);

  const games = [balloonTrial, fixationTrail, videoTrial];

  const timeline = [
    games[selectedGame],
    finishTrial,
    exitFullscreen,
  ];
  return timeline;
}

export { createHoneycombTimeline };