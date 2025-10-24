import React from 'react';
import { Container, Row, Col, Card, Badge, Button, ListGroup } from 'react-bootstrap';
import packageJson from '../../../package.json';

const getRepoUrl = (repository) => {
  if (!repository) return null;
  if (typeof repository === 'string') return repository;
  if (typeof repository === 'object') return repository.url || repository.web || repository.directory || null;
  return null;
};


const About = ({ onBack }) => {
  const name = packageJson.name || 'Motion Trainer';
  const version = packageJson.version;
  const author = packageJson.author || {};
  const repository = packageJson.repository;
  const license = packageJson.license || 'MIT';

  const contributors = author.contributors;
  const contributorList = Array.isArray(contributors) ? contributors : [];
  const repoUrl = getRepoUrl(repository);

  return (
    <Container className="py-4 about-page" data-testid="about-page">
      <Row className="align-items-center mb-3">
        <Col className="d-flex align-items-center gap-3">
          <div>
            <h1 className="display-6 fw-bold mb-1">{name}</h1>
            <div className="d-flex align-items-center gap-2">
              {version && (
                <Badge bg="secondary" pill aria-label={`Version ${version}`}>
                  v{version}
                </Badge>
              )}
            </div>
          </div>
        </Col>
      </Row>

      <Row className="mb-4 g-3 about-cards-row align-items-stretch">
        <Col md={8} lg={7} className="d-flex">
          <Card className="h-100 shadow-sm flex-fill about-equal-card">
            <Card.Body className="d-flex flex-column">
              <Card.Title as="h2" className="h3 mb-2">Overview</Card.Title>
              <Card.Text className="mb-0 text-muted" style={{ fontSize: '1.5rem', lineHeight: '1.5' }}>
                Motion Trainer is an interactive desktop application designed for MRI simulator
                environments. It delivers engaging games and videos and tracks user movement in
                real time to provide immediate feedback in order to help participants learn how 
                to stay still prior to MRI procedures.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        {/* Meta card on the right */}
        <Col md={4} lg={5} className="d-flex">
          <Card className="h-100 shadow-sm flex-fill about-equal-card">
            <Card.Body className="d-flex flex-column">
              <Card.Title as="h2" className="h6 mb-3">Project Details</Card.Title>
              {author && (
                <div className="mt-3">
                  <div className="text-muted small">Sponsors</div>
                  <div className="fw-semibold mb-2">
                    <a href="https://bnc.brown.edu" target="_blank" rel="noreferrer">
                      {author?.name || 'Behavioral Neurodata Core'}
                    </a>
                  </div>
                  <div className="fw-semibold">
                    <a href="https://mri.brown.edu" target="_blank" rel="noreferrer">
                      Brown MRI Research Facility
                    </a>
                  </div>
                </div>
              )}
              <div className="mt-3">
                <div className="text-muted small">License</div>
                <div className="fw-semibold">{license}</div>
              </div>
              <div className="mt-3">
                <div className="text-muted small">Repository</div>
                {repoUrl ? (
                  <div className="fw-semibold">
                    <a href={repoUrl} target="_blank" rel="noreferrer" aria-label="GitHub repository">
                      {repoUrl}
                    </a>
                  </div>
                ) : (
                  <div className="fw-semibold">Not available</div>
                )}
              </div>
              <div className="mt-3">
                <div className="text-muted small">Documentation</div>
                <div className="fw-semibold">
                  <a
                    href="https://docs.ccv.brown.edu/bnc-user-manual/motion-trainer/motion-trainer-user-guide"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Motion Trainer User Guide"
                  >
                    Motion Trainer User Guide
                  </a>
                </div>
              </div>

            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4 g-3">
        {/* Contributors Card */}
        {contributorList.length > 0 && (
          <Col md={6} lg={7}>
            <Card className="h-100 shadow-sm">
              <Card.Body>
                <Card.Title as="h2" className="h6 mb-3">Contributors</Card.Title>
                <ListGroup variant="flush">
                  {contributorList.map((c, idx) => {
                    if (typeof c === 'string') {
                      return (
                        <ListGroup.Item key={idx} className="py-2">
                          <span className="fw-semibold">{c}</span>
                        </ListGroup.Item>
                      );
                    }
                    const name = c?.name || 'Unknown';
                    return (
                      <ListGroup.Item key={idx} className="py-2 d-flex flex-wrap align-items-center">
                        <span className="fw-semibold me-2">{name}</span>
                        {c?.email && (
                          <a href={`mailto:${c.email}`} className="me-2 small">{c.email}</a>
                        )}
                        {c?.url && (
                          <a href={c.url} target="_blank" rel="noreferrer" className="small">
                            {c.url}
                          </a>
                        )}
                      </ListGroup.Item>
                    );
                  })}
                </ListGroup>
              </Card.Body>
            </Card>
          </Col>
        )}

        {/* Contact Us Card */}
        <Col md={6} lg={5}>
          <Card className="h-100 shadow-sm">
            <Card.Body className="d-flex flex-column">
              <Card.Title as="h2" className="h6 mb-3">Contact Us</Card.Title>
              <div className="mb-2">
                <div className="text-muted small">Support</div>
                <div className="fw-semibold">
                  <a href="mailto:bnc-it@brown.edu">bnc-it@brown.edu</a>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Footer CTA (optional) */}
      <Row className="mt-2">
        <Col md={10} lg={8} xl={7}>
          <div className="d-flex gap-2">
            {onBack && (
              <Button variant="outline-secondary" onClick={onBack}>
                Back
              </Button>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default About;
