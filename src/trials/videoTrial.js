// Import jsPsych funcitons
import { VideoSerialDataPlugin } from "../plugins/plugin-serial-position-video.ts";

const createVideoTrial = async (jsPsych) => {

  const currentSettings = await window.electronAPI.fetchCurrentSettings();

  let videoPath;

  if (
    currentSettings.videoFile &&
    !currentSettings.videoFile.includes('/') &&
    !currentSettings.videoFile.includes('\\')
  ) {
    videoPath = await window.electronAPI.getUserDataPath(["assets", "videos", currentSettings.videoFile]);
  } else {
    videoPath = `file://${currentSettings.videoFile}`;
  }

  return {
    timeline: [
      {
          type: VideoSerialDataPlugin,
          stimulus: [videoPath],
          width: 1280,
          height: 720,
          autoplay: true,
          trial_ends_after_video: true,
          rate: 1.5,
          timeout: currentSettings.videoTimeout * 1000,
      },
    ]
  };
};


export { createVideoTrial } ;