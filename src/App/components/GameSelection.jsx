import React, { useState, useEffect } from "react";
import { Container, Row, Col, Button, Card, Alert } from "react-bootstrap";


export default function GameSelection({ onSelect }) {

    const [readyToPlay, setReadyToPlay] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState({});
    const [isDataSending, setIsDataSending] = useState(false);
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
      const fetchDevices = async () => {
        const serialDevice = await window.electronAPI.fetchSerialDevice();
        setSelectedDevice(serialDevice);
        
        // If no device is connected, show banner immediately
        if (!serialDevice?.port?.path) {
          setShowBanner(true);
        } else {
          // If device is connected, wait a short time to see if data starts streaming
          const timer = setTimeout(() => {
            // If we haven't received data after a brief delay, show the banner
            setShowBanner(true);
          }, 1000); 
          
          return () => clearTimeout(timer);
        }
      }
      fetchDevices()
    }, []);
  
    useEffect(() => {
      const handleSendData = () => {
        setIsDataSending(true);
        setReadyToPlay(true);
        setShowBanner(false); // Hide banner when data starts streaming
      };
  
      // Set up the listener regardless of device state to catch when data starts
      window.electronAPI.isSendingData(handleSendData);
      
      // Cleanup function
      return () => {
        window.electronAPI.removeisDataSendingListener(); 
      };
    }, [selectedDevice]);


  const handleGameSelection = async (game) => {
    try {
      const games = {0: "balloon", 1: "fixation", 2: "video"};
      const success = await window.electronAPI.setGameTolerance(games[game]);
      if (success) {
        onSelect(game);
      } else {
        console.error("Failed to update tolerance settings.");
      }
    } catch (e) {
      console.error("Error setting tolerance: ", e);
    }
  };

  return (
    <Container className="selection-container selection-list">
      <div className="selection-content">
        <h1>Motion Trainer</h1>
        <p>Select the game you would like to play</p>
        
        {/* Device Connection Warning */}
        {showBanner && !readyToPlay && (
          <Alert variant="warning" className="d-flex align-items-center mb-4">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            <span>
              <strong>
                {!selectedDevice?.port?.path 
                  ? "Device Not Connected:" 
                  : "No Data Streaming:"
                }
              </strong>{" "}
              {!selectedDevice?.port?.path 
                ? "Please connect and configure your motion tracking device before starting a game."
                : "Device is connected but not sending data."
              }
            </span>
          </Alert>
        )}
        
        <ul className='game-list'>
          <div>
            <Button 
              onClick={() => handleGameSelection(0)} 
              className="splash-button" 
              variant="primary" 
              size="lg"
              disabled={!readyToPlay}
            >
              Blow Up the Balloon
            </Button>
          </div>
          <div>
            <Button 
              onClick={() => handleGameSelection(1)} 
              className="splash-button" 
              variant="primary" 
              size="lg"
              disabled={!readyToPlay}
            >
              Stay Still
            </Button>
          </div>
          <div>
            <Button 
              onClick={() => handleGameSelection(2)} 
              className="splash-button" 
              variant="primary" 
              size="lg"
              disabled={!readyToPlay}
            >
              Watch Video
            </Button>
          </div>
          <div>
          <Button onClick={() => onSelect(-1)} className="splash-button" variant="secondary" size="lg">
            Settings
          </Button>
        </div>
        </ul>
      </div>
    </Container>
  );
}
