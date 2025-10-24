// src/App/components/SplashPage.jsx
import React from 'react';
import { Container, Button } from 'react-bootstrap';
import { MdArrowForward } from 'react-icons/md';
import packageJson from '../../../package.json';

export default function SplashPage({ onContinue, onAbout }) {
  return (
    <Container className="splash-container">
      <div className="splash-content text-start">
        <h1 className="mb-2">Motion Trainer</h1>
        <p className="mb-3">v{packageJson.version}</p>
        {onAbout && (
          <Button
            variant="outline-light"
            size="sm"
            className="about-button mb-4"
            onClick={onAbout}
            aria-label="About Motion Trainer"
          >
            About
          </Button>
        )}
      </div>
      <div className="button-wrapper position-absolute end-0 bottom-0 p-4">
        <Button onClick={onContinue} className="splash-button" variant="primary" size="lg" aria-label="Start">
          <MdArrowForward />
        </Button>
      </div>
    </Container>
  );
}