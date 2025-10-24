import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App/App.jsx";

/** Root of the application.
 *
 * This file renders the React application inside the given location (the browser or Electron)
 */

const root = createRoot(document.querySelector('#root'));
root.render(<App />);