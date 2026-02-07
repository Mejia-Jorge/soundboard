import React from 'react';
import { render } from '@testing-library/react';
import { jest, test } from '@jest/globals';

// Mock subcomponents
jest.mock('./controller', () => () => <div data-testid="controller" />);

import App from './App';

test('renders without crashing', () => {
  render(<App />);
});
