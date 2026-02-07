import React from 'react';
import { render } from '@testing-library/react';
import { jest, test } from '@jest/globals';

// Define myIpcRenderer on window before anything else
Object.defineProperty(window, 'myIpcRenderer', {
  value: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(() => () => {}),
  },
  writable: true
});

// Mock subcomponents
jest.mock('./controller', () => () => <div data-testid="controller" />);

import App from './App';

test('renders without crashing', () => {
  render(<App />);
});
