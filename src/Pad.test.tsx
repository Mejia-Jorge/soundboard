import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest, test, expect } from '@jest/globals';
import '@testing-library/jest-dom';
import Pad from './pad';

test('renders pad with delete button', () => {
  // Mock setSinkId which is not in JSDOM
  // @ts-ignore
  window.HTMLMediaElement.prototype.setSinkId = jest.fn(() => Promise.resolve());

  const mockAudioContext = {
    state: 'suspended',
    resume: jest.fn(),
    createMediaElementSource: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
    })),
    createGain: jest.fn(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      gain: {
        value: 1,
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        setTargetAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
      },
    })),
    createMediaStreamDestination: jest.fn(() => ({
      stream: {},
    })),
    currentTime: 0,
  } as unknown as AudioContext;

  render(
    <Pad
      outputs={['default', 'default']}
      source="test.mp3"
      name="test.mp3"
      volume={1}
      virtualVolume={1}
      audioContext={mockAudioContext}
    />
  );

  const deleteButton = screen.getByTitle('Delete Sound');
  expect(deleteButton).toBeInTheDocument();
  expect(deleteButton).toHaveClass('delete-btn');
});
