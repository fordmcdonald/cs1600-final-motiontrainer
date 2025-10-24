import React, { useState, useEffect } from "react";
import { Container, Row, Col, Form, Button } from "react-bootstrap";
import Modal from 'react-bootstrap/Modal';


export default function GameSettings({ onComplete }) {
  const [settings, setSettings] = useState({});
  const [selectedConfig, setSelectedConfig] = useState("");
  const [isAdvancedOpen, setAdvancedOpen] = useState(false)
  const [isSaveConfigOpen, setSaveConfigOpen] = useState(false);
  const [readyToPlay, setReadyToPlay] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState({});
  const [isDataSending, setIsDataSending] = useState(false);
  const [videoFiles, setVideoFiles] = useState([]);
  const [validated, setValidated] = useState(false);
  const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);
  const [pendingOverwriteName, setPendingOverwriteName] = useState(""); 
  const [configs, setProjectConfigs] = useState([])
  const [savedSnapshot, setSavedSnapshot] = useState({});



  useEffect(() => {
    const fetchVideoFiles = async () => {
      const files = await window.electronAPI.fetchVideoFiles();
      setVideoFiles(files);
    };
  
    fetchVideoFiles();
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      let projectSettings;
      const saved = localStorage.getItem("settings");
      const snapshot = localStorage.getItem("savedSnapshot");

      if (saved) {
        try {
          projectSettings = JSON.parse(saved);
        } catch (err) {
          console.error("Failed to parse saved settings:", err);
          projectSettings = await window.electronAPI.fetchSettings("default-settings");
        }
      } else {
        projectSettings = await window.electronAPI.fetchSettings("default-settings");
        setSelectedConfig("default-settings");
        localStorage.setItem("selectedConfig", "default-settings");
      }

      setSettings(projectSettings);

      const parsedSnapshot = snapshot ? JSON.parse(snapshot) : projectSettings;
      setSavedSnapshot(parsedSnapshot);
      localStorage.setItem("savedSnapshot", JSON.stringify(parsedSnapshot));    


      const savedConfig = localStorage.getItem("selectedConfig");
      if (savedConfig) {
        setSelectedConfig(savedConfig);
      }
    };
  
    initializeData();
  }, []);
  
  useEffect(() => {
    const fetchConfigs = async () => {
      const configs = await window.electronAPI.fetchConfigNames()
      setProjectConfigs(configs)
    }

    fetchConfigs()
  }, [])

  useEffect(() => {
    const fetchDevices = async () => {
      const serialDevice = await window.electronAPI.fetchSerialDevice();
      setSelectedDevice(serialDevice);
    }
    fetchDevices()
  }, []);

  useEffect(() => {
    const handleSendData = () => {
      setIsDataSending(true);
      if (selectedDevice.port) {
          setReadyToPlay(true);
      }
      window.electronAPI.removeisDataSendingListener(); 
    };

    window.electronAPI.isSendingData(handleSendData);
  }, [selectedDevice]);


  const handleChange = (event) => {
    const { type, name, value } = event.target;
    let parsedValue;
  
    switch (type) {
      case "number":
        parsedValue = parseFloat(value);
        break;
      case "checkbox":
        parsedValue = event.target.checked;
        break;
      default:
        parsedValue = value;
        break;
    }
  
    const updatedConfig = {
      ...settings,
      [name]: parsedValue,
    };
  
    setSettings(updatedConfig);
  };
  

  const handleReloadDefaults = async () => {
    const defaultSettings = await window.electronAPI.fetchSettings("default-settings");

    setSettings(defaultSettings);
    setSelectedConfig('default-settings')
    setSavedSnapshot(defaultSettings)

    localStorage.setItem("selectedConfig", "default-settings")
    localStorage.setItem("savedSnapshot", JSON.stringify(defaultSettings));
  };

  const handleFileChange = (event, key) => {
    const filePath = event.target.files[0]?.path || "";
  
    const updatedConfig = {
      ...settings,
      [key]: filePath,
    };
  
    setSettings(updatedConfig);
  };

  const handleAdvanced = () => {
    setAdvancedOpen(true)
  }

  const handleLoadConfig = () => {
    window.electronAPI.pickConfigFile().then((result) => {
      if (!result || result.error) {
        console.error("Failed to load config:", result?.error);
        return;
      }
      const settings = JSON.parse(result.contents);
      const configName = result.name
      setSettings(settings)
      setSelectedConfig(configName)
      localStorage.setItem("selectedConfig", configName)

      setSavedSnapshot(settings)
      localStorage.setItem("savedSnapshot", JSON.stringify(settings));
    });
  }

  const handleSaveConfig = () => {
    setSaveConfigOpen(true)
  }

  const handleSaveAsConfig = (name) => {
    const newConfigName = name.toLowerCase().replace(/\s+/g, "-");

    setProjectConfigs([...configs, newConfigName])
    setSelectedConfig(newConfigName);
    setSaveConfigOpen(false);

    localStorage.setItem("selectedConfig", newConfigName);
    window.electronAPI.setSettings(settings, newConfigName, true);

    setSavedSnapshot(settings);
    localStorage.setItem("savedSnapshot", JSON.stringify(settings));

  };
 
  const handleDone = () => {
    const form = document.getElementById("gameSettingsForm");
  
    if (!form.checkValidity()) {
      form.reportValidity();
      setValidated(true);
      return;
    }
  
    setValidated(false);
    window.electronAPI.setSettings(settings, selectedConfig, false);
    
    localStorage.setItem("settings", JSON.stringify(settings));
    onComplete();
  };


  const hasUnsavedChanges = !window.electronAPI.isDeepStrictEqual(settings, savedSnapshot);

    
  return (
    <div
      style={{
        backgroundColor: "#000",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        padding: "20px",
      }}
    >
      <Container fluid style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      <Form id="gameSettingsForm" noValidate validated={validated} onSubmit={(e)=> e.preventDefault()}>
        <Row className="align-items-center mb-3">
          <Col>
            <h2 className="mb-4" style={{ textAlign: "left" }}>Game Settings</h2>
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={9} style={{ textAlign: "right" }}>
            <span style={{ fontWeight: "bold" }}>
              Configuration: {selectedConfig || "None"}
            </span>
            {hasUnsavedChanges && (
              <span style={{ marginLeft: "10px", color: "orange", fontStyle: "italic" }}>
                (Unsaved changes)
              </span>
            )}
          </Col>
        </Row>
        {/* Balloon Game */}
        <h4 style={{ textAlign: "left", marginBottom: "15px" }}>Balloon Game</h4>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Movement Tolerance Start (mm)</Form.Label>
          </Col>
          <Col xs={3}>
          <Form.Group controlId="balloonToleranceStart" style={{ width: "100%" }}>
            <Form.Control
              type="number"
              name="balloonToleranceStart"
              value={settings?.balloonToleranceStart ?? ""}
              onChange={handleChange}
              min={settings?.balloonToleranceEnd}
              required
            />
          </Form.Group>
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Movement Tolerance End (mm)</Form.Label>
          </Col>
          <Col xs={3}>
          <Form.Group controlId="balloonToleranceEnd" style={{ width: "100%" }}>
            <Form.Control
              type="number"
              name="balloonToleranceEnd"
              value={settings?.balloonToleranceEnd ?? ""}
              onChange={handleChange}
              max={settings?.balloonToleranceStart}
              required
            />
          </Form.Group>
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Color Feedback</Form.Label>
          </Col>
          <Col xs={3}>
            <Form.Check
              type="switch"
              name="balloonFeedback"
              checked={settings?.balloonFeedback ?? false}
              onChange={handleChange}
              style={{ transform: "scale(1.5)", transformOrigin: "center" }}
            />
          </Col>
        </Row>

        {/* Fixation Game */}
        <h4 style={{ textAlign: "left", marginBottom: "15px" }}>Fixation Game</h4>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Duration for Success (sec)</Form.Label>
          </Col>
          <Col xs={3}>
            <Form.Control
              type="number"
              name="fixationDuration"
              value={settings?.fixationDuration ?? ""}
              onChange={handleChange}
              style={{ width: "100%" }}
              required
            />
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Movement Tolerance (mm)</Form.Label>
          </Col>
          <Col xs={3}>
            <Form.Control
              type="number"
              name="fixationTolerance"
              value={settings?.fixationTolerance ?? ""}
              onChange={handleChange}
              style={{ width: "100%" }}
              required
            />
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Fixation Graphic</Form.Label>
          </Col>
          <Col xs={3}>
            {settings?.fixationGraphic ? (
              <div
                style={{
                  backgroundColor: "white",
                  display: "inline-block",
                  padding: "4px",
                  borderRadius: "4px",
                  maxWidth: "100%",
                }}
              >
                <img
                  src={`file://${settings?.fixationGraphic}`}
                  alt="Fixation Graphic"
                  style={{ maxWidth: "100%", maxHeight: "100px", objectFit: "contain" }}
                />
              </div>
            ) : (
              <span style={{ color: "white" }}>No image selected</span>
            )}
          </Col>
          <Col xs={3}>
            <Form.Control
              type="file"
              onChange={(e) => handleFileChange(e, "fixationGraphic")}
              required={!settings?.fixationGraphic}
            />
          </Col>
        </Row>

        {/* Video Game */}
        <h4 style={{ textAlign: "left", marginBottom: "15px" }}>Video Game</h4>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Timeout Duration (sec)</Form.Label>
          </Col>
          <Col xs={3}>
            <Form.Control
              type="number"
              name="videoTimeout"
              value={settings?.videoTimeout ?? ""}
              onChange={handleChange}
              style={{ width: "100%" }}
              required
            />
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Movement Tolerance (mm)</Form.Label>
          </Col>
          <Col xs={3}>
            <Form.Control
              type="number"
              name="videoTolerance"
              value={settings?.videoTolerance ?? ""}
              onChange={handleChange}
              style={{ width: "100%" }}
              required
            />
          </Col>
        </Row>
        <Row className="align-items-center mb-3">
          <Col xs={3}>
            <Form.Label style={{ fontWeight: "bold" }}>Video File</Form.Label>
          </Col>
          <Col xs={3}>
            <Form.Select
              name="videoFile"
              value={settings?.videoFile ?? ""}
              onChange={handleChange}
              style={{ width: "100%" }}
              required
            >
              <option value="">Select a video</option>
              {videoFiles.map((file, index) => (
                <option key={index} value={`${file}`}>
                  {file.split(".")[0]}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col xs={3}>
            <Form.Control
              type="file"
              onChange={(e) => handleFileChange(e, "videoFile")}
            />
          </Col>
        </Row>
        </Form>
          {/* Buttons */}
          <div style={{ marginTop: "auto" }}>
          <Row className="mt-4" style={{ justifyContent: "left", gap: "0px" }}>
            <Col xs="auto">
              <Button className="me-2 custom-button" variant="primary" onClick={handleDone}>
                Done
              </Button>
            </Col>
            <Col xs="auto">
              <Button variant={"success"}  className="me-2 custom-button" onClick={handleSaveConfig}>
                Save Config
              </Button>
              {isSaveConfigOpen && 
                <SaveConfigModal
                  show={isSaveConfigOpen}
                  onHide={() => setSaveConfigOpen(false)}
                  configs={configs}
                  selectedConfig={selectedConfig}
                  handleSaveAsConfig={handleSaveAsConfig}
                  handleConfirmOverwrite={(name) => {
                    setPendingOverwriteName(name);
                    setSaveConfigOpen(false);
                    setShowConfirmOverwrite(true);
                  }}
                />
              }
              {showConfirmOverwrite && (
                <Modal show={showConfirmOverwrite} onHide={() => setShowConfirmOverwrite(false)} animation={false}>
                  <Modal.Header closeButton>
                    <Modal.Title>Configuration Already Exists</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    A configuration named <strong>{pendingOverwriteName}</strong> already exists. Would you like to overwrite it?
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="danger"
                      onClick={() => {
                        handleSaveAsConfig(pendingOverwriteName);
                        setShowConfirmOverwrite(false);
                        setPendingOverwriteName("");
                      }}
                    >
                      OK
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowConfirmOverwrite(false);
                        setSaveConfigOpen(true)
                        setPendingOverwriteName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </Modal.Footer>
                </Modal>
              )}
            </Col>
            <Col xs="auto">
              <Button variant={"secondary"}  className="me-2 custom-button" onClick={handleLoadConfig}>
                Load Config
              </Button>
            </Col>
            <Col xs="auto">
              <Button
                variant="warning"
                onClick={handleReloadDefaults}
                className="me-2 custom-button"
              >
                Defaults
              </Button>
            </Col>
            <Col xs="auto">
              <Button variant="info" className="me-2 custom-button" onClick={handleAdvanced}>
                Advanced 
              </Button>
              { isAdvancedOpen && <AdvancedSettingsModal show={isAdvancedOpen} onHide={() => setAdvancedOpen(false)} handleChange={handleChange} selectedDevice={selectedDevice} settings={settings} selectedConfig={selectedConfig} isDataSending={isDataSending}/> }
            </Col>
          </Row>
        </div>
      </Container>
    </div>
  );
}


const SaveConfigModal = ({
  show,
  onHide,
  configs,
  selectedConfig,
  handleSaveAsConfig,
  handleConfirmOverwrite
}) => {
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (show) {
      if (selectedConfig === "default-settings") {
        setFileName(""); 
      } else {
        setFileName(selectedConfig);
      }
    }
  }, [show, selectedConfig]);

  const handleSave = () => {

    const form = document.getElementById("saveConfigForm");
  
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const configName = fileName.trim();
    if (!configName) return;

    const nameExists = configs.includes(configName);

    if (nameExists) {
      handleConfirmOverwrite(configName);
    } else {
      handleSaveAsConfig(configName);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault()
    handleSave()
  }

  return (
    <Modal show={show} onHide={onHide} animation={false}>
      <Modal.Header closeButton>
        <Modal.Title>Save Configuration</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form id="saveConfigForm" onSubmit={handleSubmit}>
          <Form.Group className="mb-2" controlId="configName">
            <Form.Label style={{ fontWeight: "bold" }}>Config Name</Form.Label>
            <Form.Control
              type="text"
              name="configName"
              placeholder="Name configuration"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="success" onClick={handleSave}>
          Save
        </Button>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

const AdvancedSettingsModal = ({show, onHide, handleChange, settings, selectedConfig, selectedDevice, isDataSending}) => {

  return (
    <Modal show={show} onHide={onHide} animation={false}>
      <Modal.Header>
        <Modal.Title>Advanced Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
      <Form>
        <Form.Group className="mb-2" controlId="formWindowSize">
          <Form.Label style={{ fontWeight: 'bold', textAlign: 'left', display: 'block' }}>Window Size</Form.Label>  
          <Form.Control
            type="number"
            placeholder="Enter window size"
            onChange={handleChange}
            name="windowSize"
            value={settings?.windowSize ?? ""}
            min="0"
            step="1"
            required
          />
        </Form.Group>
        <Form.Group className="mb-2" controlId="formLagDelta">
          <Form.Label style={{ fontWeight: 'bold', textAlign: 'left', display: 'block' }}>Lag Delta</Form.Label>  
          <Form.Control
            type="number"
            placeholder="Enter lag delta"
            onChange={handleChange}
            name="lagDelta"
            value={settings?.lagDelta ?? ""}
            min="0"
            step="1"
            required
            // disabled={selectedConfig === "default-settings"}
          />
        </Form.Group>
      </Form>
      <Container className="mt-4">
        <Row className="mb-3">
          <Col>
            <h3>Device Information</h3>
          </Col>
        </Row>
        <Row className="mb-3">
        <Col md={12}>
            <Form.Label style={isDataSending ? {color: "green"} : {color: "red"}} className="fw-bold">{isDataSending ? "Device Connected" : "Device Not Connected"}</Form.Label>
          </Col>
          <Col md={6}>
            <Form.Label  className="fw-bold">Serial Device</Form.Label>
            <Form.Control style={{ color: selectedDevice?.port?.path ? "black" : "red" }}  type="text" value={selectedDevice?.port?.path || "No Serial Device Found"} readOnly />
          </Col>
          <Col md={6}>
            <Form.Label className="fw-bold">Driver Class</Form.Label>
            <Form.Control style={{ color: selectedDevice?.driver ? "black" : "red" }}  type="text" value={selectedDevice?.driver || "No Driver Class Found"} readOnly />
          </Col>
        </Row>
      </Container>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
  </Modal>
  )
}