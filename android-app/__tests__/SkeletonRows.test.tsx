import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SkeletonRows } from '../src/components/SkeletonRows';

describe('SkeletonRows', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders 2 rows each with 4 skeleton cards and heading placeholders', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SkeletonRows cardWidth={300} cardHeight={169} />,
      );
    });

    const root = renderer!.root;
    // 2 rows * 4 cards = 8 cards
    const cards = root.findAll(
      node => typeof node.type === 'string' && node.props.testID === 'skeleton-card',
    );
    expect(cards).toHaveLength(8);

    act(() => {
      jest.runOnlyPendingTimers();
      renderer?.unmount();
    });
  });
});
