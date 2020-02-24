import path from 'path';
import React from 'react';
import Electron from 'electron';

import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';


export class HomeTab extends React.Component {

  constructor(props) {
    super(props);
  }

  render () {
    // A button for each model
    const investJSON = this.props.investList;
    let investButtons = [];
    for (const model in investJSON) {
      investButtons.push(
        <Button key={model}
          value={investJSON[model]['internal_name']}
          onClick={this.props.investGetSpec}
          variant="outline-success">
          {model}
        </Button>
      );
    }

    return (
      <Row>
        <Col md={6}>
          <ButtonGroup vertical className="mt-2">
            {investButtons}
          </ButtonGroup>
        </Col>
        <Col md={6}>
          <Row className="mt-2">
            <LoadStateForm
              loadState={this.props.loadState}
              recentSessions={this.props.recentSessions}/>
          </Row>
        </Col>
      </Row>
    );
  }
}


class LoadStateForm extends React.Component {
  
  constructor(props) {
    super(props);
    this.selectFile = this.selectFile.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  selectFile(event) {
    const dialog = Electron.remote.dialog;
    // TODO: could add more filters to only show .json
    dialog.showOpenDialog({
      properties: ['openFile']
    }, (filepath) => {
      if (filepath[0]) {
        this.props.loadState(
          path.parse(path.basename(filepath[0])).name); // 0 is safe since we only allow 1 selection
      }
    })
  }

  handleClick(event) {
    this.props.loadState(event.target.value);
  }

  render() {

    // Buttons to load each recently saved state
    let recentButtons = [];
    this.props.recentSessions.forEach(session => {
      recentButtons.push(
        <Button  className="text-left"
          key={session}
          value={session}
          onClick={this.handleClick}
          variant='outline-dark'>
          {session}
        </Button>
      );
    });
    // Also a button to browse to a cached state file if it's not in recent list
    recentButtons.push(
      <Button
        key="browse"
        type="submit"
        variant="secondary"
        onClick={this.selectFile}>
        Browse for saved session
      </Button>
    );

    return (
      <div>
        <div>
          Select Recent Session:
        </div>
        <ButtonGroup vertical className="mt-2">
          {recentButtons}
        </ButtonGroup>
      </div>
    );
  }
}
