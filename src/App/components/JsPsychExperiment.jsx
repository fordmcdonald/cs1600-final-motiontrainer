import { initJsPsych } from "jspsych";
import React from "react";
import jsPsychExtensionMouseTracking from "@jspsych/extension-mouse-tracking"
import { config, taskVersion } from "../../config/main";
import { initParticipant } from "../deployments/firebase";
import { buildTimeline, jsPsychOptions } from "../../timelines/main";

// ID used to identify the DOM element that holds the experiment.
const EXPERIMENT_ID = "experimentWindow";

export default function JsPsychExperiment({
  studyID,
  participantID,
  selectedGameIdx,
  onFinish,
  dataUpdateFunction,
  dataFinishFunction,
}) {
  /**
   * Create the instance of JsPsych whenever the studyID or participantID changes, which occurs then the user logs in.
   *
   * This instance of jsPsych is passed to any trials that need it when the timeline is built.
   */
  const jsPsych = React.useMemo(() => {
    // TODO #169: JsPsych has a built in timestamp function
    // Start date of the experiment - used as the UID of the session
    const startDate = new Date().toISOString();

    // Write the initial record to Firestore
    if (config.USE_FIREBASE) initParticipant(studyID, participantID, startDate);

    const jsPsych = initJsPsych({
      // Combine necessary Honeycomb options with custom ones (src/timelines/main.js)
      ...jsPsychOptions,
      display_element: EXPERIMENT_ID,
      on_data_update: (data) => {
        jsPsychOptions.on_data_update && jsPsychOptions.on_data_update(data); // Call custom on_data_update function (if provided)
        dataUpdateFunction(data); // Call Honeycomb's on_data_update function
      },
      on_finish: (data) => {
       jsPsychOptions.on_finish && jsPsychOptions.on_finish(data); // Call custom on_finish function (if provided)
       //dataFinishFunction(data); // TODO: Uncomment this line when you want to send data to Firebase.  Prematurely tears down the experiment.
       onFinish(); 
      },
      extensions: [
        {type: jsPsychExtensionMouseTracking, params: {minimum_sample_time: 5}}
      ],
    });

    // Adds experiment data into jsPsych directly. These properties will be added to all trials
    jsPsych.data.addProperties({
      study_id: studyID,
      participant_id: participantID,
      start_date: startDate,
      task_version: taskVersion,
    });

    return jsPsych;
  }, [studyID, participantID]);

  /** Build and run the experiment timeline */
  React.useEffect(() => {
    async function buildJsPsychTimeline() {
      const timeline = await buildTimeline(jsPsych, studyID, participantID, selectedGameIdx);
      jsPsych.run(timeline);
    }
    buildJsPsychTimeline()
  }, [jsPsych]);

  return <div id={EXPERIMENT_ID} className="App" />;
}
